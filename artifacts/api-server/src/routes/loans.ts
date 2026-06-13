import { Router, type IRouter } from "express";
import { db, loansTable, membersTable } from "@workspace/db";
import { eq, ilike, and, or, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const router: IRouter = Router();

const LOAN_TYPES = ["personal", "emergency", "education", "medical", "business"] as const;
const LOAN_STATUSES = ["active", "closed", "overdue", "defaulted"] as const;

const LoanInputSchema = z.object({
  memberId: z.string().uuid().nullable().optional(),
  loanType: z.enum(LOAN_TYPES).default("personal"),
  principalAmount: z.coerce.number().nonnegative().default(0),
  disbursedDate: z.string().nullable().optional(),
  emiAmount: z.coerce.number().nonnegative().default(0),
  emiCount: z.coerce.number().int().nonnegative().default(0),
  paidEmis: z.coerce.number().int().nonnegative().default(0),
  status: z.enum(LOAN_STATUSES).default("active"),
  convenorName: z.string().default(""),
  description: z.string().default(""),
  notes: z.string().default(""),
});

const ListQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(LOAN_STATUSES).optional(),
  loanType: z.enum(LOAN_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

function rowToApi(
  r: typeof loansTable.$inferSelect,
  member?: { fullName: string; membershipId: string } | null,
) {
  const principal = Number(r.principalAmount);
  const emi = Number(r.emiAmount);
  const outstanding = Math.max(principal - emi * r.paidEmis, 0);
  return {
    id: r.id,
    memberId: r.memberId,
    memberName: member?.fullName ?? null,
    membershipId: member?.membershipId ?? null,
    loanType: r.loanType,
    principalAmount: principal,
    disbursedDate: r.disbursedDate ?? null,
    emiAmount: emi,
    emiCount: r.emiCount,
    paidEmis: r.paidEmis,
    outstandingBalance: outstanding,
    status: r.status,
    convenorName: r.convenorName,
    description: r.description,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

router.use("/loans", requireAuth);

// GET /loans/stats — must be before /:id
router.get("/loans/stats", async (req, res): Promise<void> => {
  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${loansTable.status} = 'active')::int`,
      overdue: sql<number>`count(*) filter (where ${loansTable.status} = 'overdue')::int`,
      closed: sql<number>`count(*) filter (where ${loansTable.status} = 'closed')::int`,
      totalPrincipal: sql<number>`coalesce(sum(${loansTable.principalAmount}::numeric), 0)::float`,
      totalOutstanding: sql<number>`coalesce(sum(greatest(${loansTable.principalAmount}::numeric - ${loansTable.emiAmount}::numeric * ${loansTable.paidEmis}, 0)), 0)::float`,
    })
    .from(loansTable);

  res.json({
    total: stats?.total ?? 0,
    active: stats?.active ?? 0,
    overdue: stats?.overdue ?? 0,
    closed: stats?.closed ?? 0,
    totalPrincipal: Number(stats?.totalPrincipal ?? 0),
    totalOutstanding: Number(stats?.totalOutstanding ?? 0),
  });
});

// GET /loans
router.get("/loans", async (req, res): Promise<void> => {
  const parsed = ListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, status, loanType, page, pageSize } = parsed.data;

  const where = and(
    status ? eq(loansTable.status, status) : undefined,
    loanType ? eq(loansTable.loanType, loanType) : undefined,
  );

  const rows = await db
    .select({
      loan: loansTable,
      memberName: membersTable.fullName,
      membershipId: membersTable.membershipId,
    })
    .from(loansTable)
    .leftJoin(membersTable, eq(loansTable.memberId, membersTable.id))
    .where(
      and(
        where,
        search
          ? or(
              ilike(membersTable.fullName, `%${search}%`),
              ilike(membersTable.membershipId, `%${search}%`),
              ilike(loansTable.description, `%${search}%`),
              ilike(loansTable.convenorName, `%${search}%`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(loansTable.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(loansTable)
    .leftJoin(membersTable, eq(loansTable.memberId, membersTable.id))
    .where(
      and(
        where,
        search
          ? or(
              ilike(membersTable.fullName, `%${search}%`),
              ilike(membersTable.membershipId, `%${search}%`),
              ilike(loansTable.description, `%${search}%`),
              ilike(loansTable.convenorName, `%${search}%`),
            )
          : undefined,
      ),
    );

  res.json({
    items: rows.map((r) =>
      rowToApi(r.loan, r.memberName ? { fullName: r.memberName, membershipId: r.membershipId ?? "" } : null),
    ),
    page,
    pageSize,
    total: Number(count ?? 0),
  });
});

// GET /loans/:id
router.get("/loans/:id", async (req, res): Promise<void> => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select({ loan: loansTable, memberName: membersTable.fullName, membershipId: membersTable.membershipId })
    .from(loansTable)
    .leftJoin(membersTable, eq(loansTable.memberId, membersTable.id))
    .where(eq(loansTable.id, id.data));

  if (!row) {
    res.status(404).json({ error: "Loan not found" });
    return;
  }
  res.json(
    rowToApi(
      row.loan,
      row.memberName ? { fullName: row.memberName, membershipId: row.membershipId ?? "" } : null,
    ),
  );
});

// POST /loans — admin only
router.post("/loans", requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = LoanInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const [created] = await db
    .insert(loansTable)
    .values({
      memberId: d.memberId ?? null,
      loanType: d.loanType,
      principalAmount: String(d.principalAmount),
      disbursedDate: d.disbursedDate ?? null,
      emiAmount: String(d.emiAmount),
      emiCount: d.emiCount,
      paidEmis: d.paidEmis,
      status: d.status,
      convenorName: d.convenorName,
      description: d.description,
      notes: d.notes,
    })
    .returning();

  const member = created.memberId
    ? await db.select().from(membersTable).where(eq(membersTable.id, created.memberId)).then((r) => r[0])
    : null;

  res.status(201).json(rowToApi(created, member ?? null));
});

// PUT /loans/:id — admin only
router.put("/loans/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = LoanInputSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const updates: Record<string, unknown> = {};
  if (d.memberId !== undefined) updates.memberId = d.memberId ?? null;
  if (d.loanType !== undefined) updates.loanType = d.loanType;
  if (d.principalAmount !== undefined) updates.principalAmount = String(d.principalAmount);
  if (d.disbursedDate !== undefined) updates.disbursedDate = d.disbursedDate ?? null;
  if (d.emiAmount !== undefined) updates.emiAmount = String(d.emiAmount);
  if (d.emiCount !== undefined) updates.emiCount = d.emiCount;
  if (d.paidEmis !== undefined) updates.paidEmis = d.paidEmis;
  if (d.status !== undefined) updates.status = d.status;
  if (d.convenorName !== undefined) updates.convenorName = d.convenorName;
  if (d.description !== undefined) updates.description = d.description;
  if (d.notes !== undefined) updates.notes = d.notes;

  const [updated] = await db
    .update(loansTable)
    .set(updates)
    .where(eq(loansTable.id, id.data))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Loan not found" });
    return;
  }

  const member = updated.memberId
    ? await db.select().from(membersTable).where(eq(membersTable.id, updated.memberId)).then((r) => r[0])
    : null;

  res.json(rowToApi(updated, member ?? null));
});

// DELETE /loans/:id — admin only
router.delete("/loans/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [deleted] = await db.delete(loansTable).where(eq(loansTable.id, id.data)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Loan not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
