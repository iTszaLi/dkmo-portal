import { Router, type IRouter } from "express";
import { db, loansTable, loanPaymentsTable, membersTable } from "@workspace/db";
import { eq, ilike, and, or, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole, type AuthedRequest } from "../middlewares/requireAuth";
import { getUserById } from "../lib/users";

const router: IRouter = Router();

const LOAN_TYPES = [
  "personal",
  "medical",
  "education",
  "business",
  "emergency",
  "marriage",
  "housing",
  "other",
] as const;
const LOAN_STATUSES = ["active", "closed", "overdue", "defaulted"] as const;
const PAYMENT_METHODS = ["cash", "bank_transfer", "upi", "card", "cheque"] as const;

// Simplified create: the system derives duration, status and balances automatically.
const LoanCreateSchema = z
  .object({
    memberId: z.string().uuid(),
    loanType: z.enum(LOAN_TYPES).default("personal"),
    principalAmount: z.coerce.number().positive("Loan amount must be greater than 0"),
    emiAmount: z.coerce.number().positive("Monthly payment must be greater than 0"),
    disbursedDate: z.string().min(1),
    convenorName: z.string().default(""),
    notes: z.string().default(""),
  })
  .refine((d) => d.emiAmount <= d.principalAmount, {
    message: "Monthly payment cannot be greater than the loan amount",
  });

// Admin edit keeps full flexibility (legacy fields included).
const LoanUpdateSchema = z.object({
  memberId: z.string().uuid().nullable().optional(),
  loanType: z.enum(LOAN_TYPES).optional(),
  principalAmount: z.coerce.number().positive().optional(),
  disbursedDate: z.string().nullable().optional(),
  emiAmount: z.coerce.number().positive().optional(),
  convenorName: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

const PaymentInputSchema = z.object({
  amount: z.coerce.number().positive("Payment amount must be greater than 0"),
  paymentDate: z.string().min(1),
  paymentMethod: z.enum(PAYMENT_METHODS).default("cash"),
  notes: z.string().default(""),
});

const ListQuerySchema = z.object({
  search: z.string().optional(),
  // "open" = active|overdue; "due_this_month" = an installment falls due this
  // calendar month and isn't covered yet. Both power stat-card drilldowns.
  status: z.enum([...LOAN_STATUSES, "open", "due_this_month"] as const).optional(),
  loanType: z.enum(LOAN_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

type LoanRow = typeof loansTable.$inferSelect;

/**
 * Installments due so far. Installment k falls due k full months after the
 * disbursement date, so a loan disbursed today owes nothing yet.
 */
function expectedInstallments(r: LoanRow, emiCount: number): number {
  if (!r.disbursedDate) return 0;
  const start = new Date(r.disbursedDate);
  if (isNaN(start.getTime())) return 0;
  const now = new Date();
  let months =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1; // this month's due date not reached yet
  return Math.max(0, Math.min(months, emiCount));
}

/** Installments falling due on or before the end of the current calendar month. */
function expectedInstallmentsThroughThisMonth(r: LoanRow, emiCount: number): number {
  if (!r.disbursedDate) return 0;
  const start = new Date(r.disbursedDate);
  if (isNaN(start.getTime())) return 0;
  const now = new Date();
  const months =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  return Math.max(0, Math.min(months, emiCount));
}

/**
 * Derive everything from payments — the user never edits balances or status.
 * Legacy loans keep their pre-recorded progress via paid_emis * emi_amount as a baseline.
 */
function deriveLoan(r: LoanRow, paymentsTotal: number) {
  const principal = Number(r.principalAmount);
  const emi = Number(r.emiAmount);
  const legacyPaid = emi * r.paidEmis;
  const totalPaid = Math.min(legacyPaid + paymentsTotal, principal);
  const outstanding = Math.max(principal - totalPaid, 0);
  const emiCount = r.emiCount > 0 ? r.emiCount : emi > 0 ? Math.ceil(principal / emi) : 0;
  const paidInstallments =
    emi > 0 ? Math.min(Math.floor(totalPaid / emi + 1e-9), emiCount) : 0;

  let status: (typeof LOAN_STATUSES)[number];
  if (r.status === "defaulted") {
    status = "defaulted";
  } else if (outstanding <= 0) {
    status = "closed";
  } else if (expectedInstallments(r, emiCount) > paidInstallments) {
    status = "overdue";
  } else {
    status = "active";
  }
  return { principal, emi, totalPaid, outstanding, emiCount, paidInstallments, status };
}

function rowToApi(
  r: LoanRow,
  paymentsTotal: number,
  member?: { fullName: string; membershipId: string } | null,
) {
  const d = deriveLoan(r, paymentsTotal);
  return {
    id: r.id,
    memberId: r.memberId,
    memberName: member?.fullName ?? null,
    membershipId: member?.membershipId ?? null,
    loanType: r.loanType,
    principalAmount: d.principal,
    disbursedDate: r.disbursedDate ?? null,
    emiAmount: d.emi,
    emiCount: d.emiCount,
    paidEmis: d.paidInstallments,
    totalPaid: d.totalPaid,
    outstandingBalance: d.outstanding,
    status: d.status,
    convenorName: r.convenorName,
    description: r.description,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function paymentToApi(p: typeof loanPaymentsTable.$inferSelect) {
  return {
    id: p.id,
    loanId: p.loanId,
    amount: Number(p.amount),
    paymentDate: p.paymentDate,
    paymentMethod: p.paymentMethod,
    notes: p.notes,
    recordedBy: p.recordedBy,
    createdAt: p.createdAt.toISOString(),
  };
}

async function paymentTotals(loanIds?: string[]): Promise<Map<string, number>> {
  const rows = await db
    .select({
      loanId: loanPaymentsTable.loanId,
      total: sql<number>`coalesce(sum(${loanPaymentsTable.amount}::numeric), 0)::float`,
    })
    .from(loanPaymentsTable)
    .groupBy(loanPaymentsTable.loanId);
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!loanIds || loanIds.includes(row.loanId)) map.set(row.loanId, Number(row.total));
  }
  return map;
}

router.use("/loans", requireAuth);

// GET /loans/stats — must be before /:id
router.get("/loans/stats", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ loan: loansTable, memberId: loansTable.memberId })
    .from(loansTable);
  const totals = await paymentTotals();

  let active = 0;
  let overdue = 0;
  let closed = 0;
  let totalPrincipal = 0;
  let totalOutstanding = 0;
  let dueThisMonthAmount = 0;
  let dueThisMonthCount = 0;
  const missedMembers = new Set<string>();

  for (const { loan } of rows) {
    const d = deriveLoan(loan, totals.get(loan.id) ?? 0);
    totalPrincipal += d.principal;
    totalOutstanding += d.outstanding;
    if (d.status === "closed") closed += 1;
    else if (d.status === "overdue") {
      overdue += 1;
      if (loan.memberId) missedMembers.add(loan.memberId);
    } else if (d.status === "active") active += 1;
    // Due this month = an installment falls due within the current calendar
    // month and payments so far don't cover it yet.
    if (
      (d.status === "active" || d.status === "overdue") &&
      d.outstanding > 0 &&
      d.paidInstallments < expectedInstallmentsThroughThisMonth(loan, d.emiCount)
    ) {
      dueThisMonthCount += 1;
      dueThisMonthAmount += Math.min(d.emi, d.outstanding);
    }
  }

  res.json({
    total: rows.length,
    active,
    overdue,
    closed,
    totalPrincipal,
    totalOutstanding,
    dueThisMonthAmount,
    dueThisMonthCount,
    membersWithMissedPayments: missedMembers.size,
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

  // Status is derived, so filter after derivation (community-scale data).
  const rows = await db
    .select({
      loan: loansTable,
      memberName: membersTable.fullName,
      membershipId: membersTable.membershipId,
      mobileNumber: membersTable.mobileNumber,
    })
    .from(loansTable)
    .leftJoin(membersTable, eq(loansTable.memberId, membersTable.id))
    .where(
      and(
        loanType ? eq(loansTable.loanType, loanType) : undefined,
        search
          ? or(
              ilike(membersTable.fullName, `%${search}%`),
              ilike(membersTable.membershipId, `%${search}%`),
              ilike(membersTable.mobileNumber, `%${search}%`),
              ilike(loansTable.loanType, `%${search}%`),
              ilike(loansTable.description, `%${search}%`),
              ilike(loansTable.notes, `%${search}%`),
              ilike(loansTable.convenorName, `%${search}%`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(loansTable.createdAt));

  const totals = await paymentTotals();
  let pairs = rows.map((r) => ({
    raw: r.loan,
    api: rowToApi(
      r.loan,
      totals.get(r.loan.id) ?? 0,
      r.memberName ? { fullName: r.memberName, membershipId: r.membershipId ?? "" } : null,
    ),
  }));
  if (status === "open") {
    pairs = pairs.filter((p) => p.api.status === "active" || p.api.status === "overdue");
  } else if (status === "due_this_month") {
    pairs = pairs.filter((p) => {
      const d = deriveLoan(p.raw, totals.get(p.raw.id) ?? 0);
      return (
        (d.status === "active" || d.status === "overdue") &&
        d.outstanding > 0 &&
        d.paidInstallments < expectedInstallmentsThroughThisMonth(p.raw, d.emiCount)
      );
    });
  } else if (status) {
    pairs = pairs.filter((p) => p.api.status === status);
  }
  const items = pairs.map((p) => p.api);

  const total = items.length;
  const start = (page - 1) * pageSize;
  res.json({ items: items.slice(start, start + pageSize), page, pageSize, total });
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
  const totals = await paymentTotals([id.data]);
  res.json(
    rowToApi(
      row.loan,
      totals.get(id.data) ?? 0,
      row.memberName ? { fullName: row.memberName, membershipId: row.membershipId ?? "" } : null,
    ),
  );
});

// GET /loans/:id/payments — payment history
router.get("/loans/:id/payments", async (req, res): Promise<void> => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const rows = await db
    .select()
    .from(loanPaymentsTable)
    .where(eq(loanPaymentsTable.loanId, id.data))
    .orderBy(desc(loanPaymentsTable.paymentDate), desc(loanPaymentsTable.createdAt));
  res.json(rows.map(paymentToApi));
});

// POST /loans/:id/payments — record a repayment (auto-updates balance & status)
router.post(
  "/loans/:id/payments",
  requireRole("admin", "finance"),
  async (req, res): Promise<void> => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = PaymentInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [loan] = await db.select().from(loansTable).where(eq(loansTable.id, id.data));
    if (!loan) {
      res.status(404).json({ error: "Loan not found" });
      return;
    }
    const totalsBefore = await paymentTotals([id.data]);
    const before = deriveLoan(loan, totalsBefore.get(id.data) ?? 0);
    if (before.outstanding <= 0) {
      res.status(409).json({ error: "This loan is already fully paid." });
      return;
    }
    if (parsed.data.amount > before.outstanding) {
      res.status(409).json({
        error: `Payment exceeds the outstanding balance (SAR ${before.outstanding.toFixed(2)}).`,
      });
      return;
    }

    const user = getUserById((req as AuthedRequest).userId);
    const [created] = await db
      .insert(loanPaymentsTable)
      .values({
        loanId: id.data,
        amount: String(parsed.data.amount),
        paymentDate: parsed.data.paymentDate,
        paymentMethod: parsed.data.paymentMethod,
        notes: parsed.data.notes,
        recordedBy: user?.displayName ?? "",
      })
      .returning();

    // Keep the stored status in sync so other modules see the derived value.
    const after = deriveLoan(loan, (totalsBefore.get(id.data) ?? 0) + parsed.data.amount);
    await db
      .update(loansTable)
      .set({ status: after.status })
      .where(eq(loansTable.id, id.data));

    res.status(201).json({
      payment: paymentToApi(created),
      loanClosed: after.status === "closed",
    });
  },
);

// DELETE /loans/:id/payments/:paymentId — admin correction only
router.delete(
  "/loans/:id/payments/:paymentId",
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = z.string().uuid().safeParse(req.params.id);
    const paymentId = z.string().uuid().safeParse(req.params.paymentId);
    if (!id.success || !paymentId.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [deleted] = await db
      .delete(loanPaymentsTable)
      .where(and(eq(loanPaymentsTable.id, paymentId.data), eq(loanPaymentsTable.loanId, id.data)))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    const [loan] = await db.select().from(loansTable).where(eq(loansTable.id, id.data));
    if (loan) {
      const totals = await paymentTotals([id.data]);
      const d = deriveLoan(loan, totals.get(id.data) ?? 0);
      await db.update(loansTable).set({ status: d.status }).where(eq(loansTable.id, id.data));
    }
    res.sendStatus(204);
  },
);

// POST /loans — create (duration, status and balances are automatic)
router.post("/loans", requireRole("admin", "finance"), async (req, res): Promise<void> => {
  const parsed = LoanCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const emiCount = Math.ceil(d.principalAmount / d.emiAmount);
  // Only admins may assign someone else as convenor; everyone else is
  // recorded as the convenor themselves.
  const authed = req as AuthedRequest;
  const creator = getUserById(authed.userId);
  const convenorName =
    authed.userRole === "admin" && d.convenorName
      ? d.convenorName
      : (creator?.displayName ?? d.convenorName);
  const [created] = await db
    .insert(loansTable)
    .values({
      memberId: d.memberId,
      loanType: d.loanType,
      principalAmount: String(d.principalAmount),
      disbursedDate: d.disbursedDate,
      emiAmount: String(d.emiAmount),
      emiCount,
      paidEmis: 0,
      status: "active",
      convenorName,
      description: "",
      notes: d.notes,
    })
    .returning();

  const member = created.memberId
    ? await db.select().from(membersTable).where(eq(membersTable.id, created.memberId)).then((r) => r[0])
    : null;

  res.status(201).json(rowToApi(created, 0, member ?? null));
});

// PUT /loans/:id — admin only
router.put("/loans/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = LoanUpdateSchema.safeParse(req.body);
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
  if (d.convenorName !== undefined) updates.convenorName = d.convenorName;
  if (d.description !== undefined) updates.description = d.description;
  if (d.notes !== undefined) updates.notes = d.notes;

  // Re-derive duration when amounts change.
  if (d.principalAmount !== undefined || d.emiAmount !== undefined) {
    const [existing] = await db.select().from(loansTable).where(eq(loansTable.id, id.data));
    if (!existing) {
      res.status(404).json({ error: "Loan not found" });
      return;
    }
    const principal = d.principalAmount ?? Number(existing.principalAmount);
    const emi = d.emiAmount ?? Number(existing.emiAmount);
    if (emi > 0) updates.emiCount = Math.ceil(principal / emi);
  }

  const [updated] = await db
    .update(loansTable)
    .set(updates)
    .where(eq(loansTable.id, id.data))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Loan not found" });
    return;
  }

  const totals = await paymentTotals([id.data]);
  // Keep stored status in sync after schedule/amount edits.
  const derived = deriveLoan(updated, totals.get(id.data) ?? 0);
  if (derived.status !== updated.status) {
    await db.update(loansTable).set({ status: derived.status }).where(eq(loansTable.id, id.data));
    updated.status = derived.status;
  }
  const member = updated.memberId
    ? await db.select().from(membersTable).where(eq(membersTable.id, updated.memberId)).then((r) => r[0])
    : null;

  res.json(rowToApi(updated, totals.get(id.data) ?? 0, member ?? null));
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
