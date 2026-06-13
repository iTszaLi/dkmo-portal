import { Router, type IRouter } from "express";
import { db, sponsorsTable } from "@workspace/db";
import { eq, ilike, and, or, desc, asc, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const router: IRouter = Router();

const TIERS = ["platinum", "gold", "silver", "bronze"] as const;
const STATUSES = ["pending", "partial", "paid", "overdue"] as const;

const SponsorInputSchema = z.object({
  sponsorName: z.string().min(1, "Sponsor name is required"),
  company: z.string().default(""),
  contactPerson: z.string().default(""),
  phone: z.string().default(""),
  email: z.string().email("Invalid email").or(z.literal("")).default(""),
  tier: z.enum(TIERS).default("bronze"),
  totalAmount: z.coerce.number().nonnegative().default(0),
  paidAmount: z.coerce.number().nonnegative().default(0),
  status: z.enum(STATUSES).default("pending"),
  assignedStaff: z.string().default(""),
  linkedEvent: z.string().default(""),
  dueDate: z.string().datetime().nullable().optional(),
  notes: z.string().default(""),
});

const ListQuerySchema = z.object({
  search: z.string().optional(),
  tier: z.enum(TIERS).optional(),
  status: z.enum(STATUSES).optional(),
  sort: z
    .enum(["recent", "name", "totalDesc", "totalAsc", "pendingDesc"])
    .default("recent"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

function rowToApi(r: typeof sponsorsTable.$inferSelect) {
  const total = Number(r.totalAmount);
  const paid = Number(r.paidAmount);
  const pending = Math.max(total - paid, 0);
  return {
    id: r.id,
    sponsorName: r.sponsorName,
    company: r.company,
    contactPerson: r.contactPerson,
    phone: r.phone,
    email: r.email,
    tier: r.tier,
    totalAmount: total,
    paidAmount: paid,
    pendingAmount: pending,
    status: r.status,
    assignedStaff: r.assignedStaff,
    linkedEvent: r.linkedEvent,
    dueDate: r.dueDate ? r.dueDate.toISOString() : null,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// All routes require auth
router.use("/sponsors", requireAuth);

router.get("/sponsors", async (req, res): Promise<void> => {
  const parsed = ListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, tier, status, sort, page, pageSize } = parsed.data;

  const where = and(
    search
      ? or(
          ilike(sponsorsTable.sponsorName, `%${search}%`),
          ilike(sponsorsTable.company, `%${search}%`),
          ilike(sponsorsTable.contactPerson, `%${search}%`),
          ilike(sponsorsTable.email, `%${search}%`),
        )
      : undefined,
    tier ? eq(sponsorsTable.tier, tier) : undefined,
    status ? eq(sponsorsTable.status, status) : undefined,
  );

  const orderBy =
    sort === "name"
      ? asc(sponsorsTable.sponsorName)
      : sort === "totalDesc"
        ? desc(sponsorsTable.totalAmount)
        : sort === "totalAsc"
          ? asc(sponsorsTable.totalAmount)
          : sort === "pendingDesc"
            ? sql`(${sponsorsTable.totalAmount} - ${sponsorsTable.paidAmount}) DESC`
            : desc(sponsorsTable.createdAt);

  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(sponsorsTable)
      .where(where)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(sponsorsTable)
      .where(where),
  ]);

  res.json({
    items: rows.map(rowToApi),
    page,
    pageSize,
    total: Number(count ?? 0),
  });
});

router.get("/sponsors/:id", async (req, res): Promise<void> => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, id.data));
  if (!row) {
    res.status(404).json({ error: "Sponsor not found" });
    return;
  }
  res.json(rowToApi(row));
});

// Create — Admin only
router.post(
  "/sponsors",
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const parsed = SponsorInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const data = parsed.data;
    const [created] = await db
      .insert(sponsorsTable)
      .values({
        sponsorName: data.sponsorName,
        company: data.company,
        contactPerson: data.contactPerson,
        phone: data.phone,
        email: data.email,
        tier: data.tier,
        totalAmount: String(data.totalAmount),
        paidAmount: String(data.paidAmount),
        status: data.status,
        assignedStaff: data.assignedStaff,
        linkedEvent: data.linkedEvent,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        notes: data.notes,
      })
      .returning();
    res.status(201).json(rowToApi(created));
  },
);

// Update — Admin only (Finance can update status/paidAmount via /payments later)
router.put(
  "/sponsors/:id",
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = SponsorInputSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const d = parsed.data;
    const updates: Record<string, unknown> = {};
    if (d.sponsorName !== undefined) updates.sponsorName = d.sponsorName;
    if (d.company !== undefined) updates.company = d.company;
    if (d.contactPerson !== undefined) updates.contactPerson = d.contactPerson;
    if (d.phone !== undefined) updates.phone = d.phone;
    if (d.email !== undefined) updates.email = d.email;
    if (d.tier !== undefined) updates.tier = d.tier;
    if (d.totalAmount !== undefined) updates.totalAmount = String(d.totalAmount);
    if (d.paidAmount !== undefined) updates.paidAmount = String(d.paidAmount);
    if (d.status !== undefined) updates.status = d.status;
    if (d.assignedStaff !== undefined) updates.assignedStaff = d.assignedStaff;
    if (d.linkedEvent !== undefined) updates.linkedEvent = d.linkedEvent;
    if (d.dueDate !== undefined) updates.dueDate = d.dueDate ? new Date(d.dueDate) : null;
    if (d.notes !== undefined) updates.notes = d.notes;

    const [updated] = await db
      .update(sponsorsTable)
      .set(updates)
      .where(eq(sponsorsTable.id, id.data))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Sponsor not found" });
      return;
    }
    res.json(rowToApi(updated));
  },
);

// Delete — Admin only
router.delete(
  "/sponsors/:id",
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [deleted] = await db
      .delete(sponsorsTable)
      .where(eq(sponsorsTable.id, id.data))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Sponsor not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
