import { Router, type IRouter } from "express";
import {
  db,
  eventsTable,
  eventSponsorsTable,
  eventExpensesTable,
  eventTicketBookletsTable,
  eventTicketsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use("/events", requireAuth);

// ── Param validation helper ─────────────────────────────────────────
const uuidParam = (v: unknown) => z.string().uuid().safeParse(v);

// ── Converters ──────────────────────────────────────────────────────
function sponsorToApi(r: typeof eventSponsorsTable.$inferSelect) {
  return {
    id: r.id,
    eventId: r.eventId,
    sponsorName: r.sponsorName,
    contactPerson: r.contactPerson,
    phone: r.phone,
    email: r.email,
    amount: Number(r.amount),
    sponsorshipType: r.sponsorshipType,
    sponsorshipDate: r.sponsorshipDate,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  };
}

function expenseToApi(r: typeof eventExpensesTable.$inferSelect) {
  return {
    id: r.id,
    eventId: r.eventId,
    category: r.category,
    description: r.description,
    vendor: r.vendor,
    amount: Number(r.amount),
    expenseDate: r.expenseDate,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  };
}

function bookletToApi(r: typeof eventTicketBookletsTable.$inferSelect) {
  return {
    id: r.id,
    eventId: r.eventId,
    bookletNumber: r.bookletNumber,
    ticketRangeStart: r.ticketRangeStart,
    ticketRangeEnd: r.ticketRangeEnd,
    assignedTo: r.assignedTo,
    assignedDate: r.assignedDate,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  };
}

function ticketToApi(r: typeof eventTicketsTable.$inferSelect) {
  return {
    id: r.id,
    bookletId: r.bookletId,
    eventId: r.eventId,
    ticketNumber: r.ticketNumber,
    isSold: r.isSold,
    soldBy: r.soldBy,
    buyerName: r.buyerName,
    buyerPhone: r.buyerPhone,
    saleDate: r.saleDate,
    amount: Number(r.amount),
    createdAt: r.createdAt.toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════
// SPONSORS
// ═══════════════════════════════════════════════════════════════════
const SponsorInputSchema = z.object({
  sponsorName: z.string().min(1),
  contactPerson: z.string().default(""),
  phone: z.string().default(""),
  email: z.string().default(""),
  amount: z.coerce.number().nonnegative().default(0),
  sponsorshipType: z.enum(["cash", "in-kind"]).default("cash"),
  sponsorshipDate: z.string().default(""),
  notes: z.string().default(""),
});

router.get("/events/:eventId/sponsors", async (req, res): Promise<void> => {
  const eid = uuidParam(req.params.eventId);
  if (!eid.success) { res.status(400).json({ error: "Invalid event id" }); return; }
  const rows = await db
    .select()
    .from(eventSponsorsTable)
    .where(eq(eventSponsorsTable.eventId, eid.data))
    .orderBy(eventSponsorsTable.createdAt);
  res.json(rows.map(sponsorToApi));
});

router.post("/events/:eventId/sponsors", requireRole("admin", "event"), async (req, res): Promise<void> => {
  const eid = uuidParam(req.params.eventId);
  if (!eid.success) { res.status(400).json({ error: "Invalid event id" }); return; }
  const [ev] = await db.select({ id: eventsTable.id }).from(eventsTable).where(eq(eventsTable.id, eid.data));
  if (!ev) { res.status(404).json({ error: "Event not found" }); return; }
  const parsed = SponsorInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const [created] = await db.insert(eventSponsorsTable).values({
    eventId: eid.data,
    sponsorName: d.sponsorName,
    contactPerson: d.contactPerson,
    phone: d.phone,
    email: d.email,
    amount: String(d.amount),
    sponsorshipType: d.sponsorshipType,
    sponsorshipDate: d.sponsorshipDate,
    notes: d.notes,
  }).returning();
  res.status(201).json(sponsorToApi(created));
});

router.delete("/events/:eventId/sponsors/:id", requireRole("admin", "event"), async (req, res): Promise<void> => {
  const sid = uuidParam(req.params.id);
  if (!sid.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(eventSponsorsTable).where(eq(eventSponsorsTable.id, sid.data)).returning();
  if (!deleted) { res.status(404).json({ error: "Sponsor not found" }); return; }
  res.status(204).end();
});

// ═══════════════════════════════════════════════════════════════════
// EXPENSES
// ═══════════════════════════════════════════════════════════════════
const ExpenseInputSchema = z.object({
  category: z.string().min(1),
  description: z.string().default(""),
  vendor: z.string().default(""),
  amount: z.coerce.number().nonnegative().default(0),
  expenseDate: z.string().default(""),
  notes: z.string().default(""),
});

router.get("/events/:eventId/expenses", async (req, res): Promise<void> => {
  const eid = uuidParam(req.params.eventId);
  if (!eid.success) { res.status(400).json({ error: "Invalid event id" }); return; }
  const rows = await db
    .select()
    .from(eventExpensesTable)
    .where(eq(eventExpensesTable.eventId, eid.data))
    .orderBy(eventExpensesTable.createdAt);
  res.json(rows.map(expenseToApi));
});

router.post("/events/:eventId/expenses", requireRole("admin", "event"), async (req, res): Promise<void> => {
  const eid = uuidParam(req.params.eventId);
  if (!eid.success) { res.status(400).json({ error: "Invalid event id" }); return; }
  const [ev] = await db.select({ id: eventsTable.id }).from(eventsTable).where(eq(eventsTable.id, eid.data));
  if (!ev) { res.status(404).json({ error: "Event not found" }); return; }
  const parsed = ExpenseInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const [created] = await db.insert(eventExpensesTable).values({
    eventId: eid.data,
    category: d.category,
    description: d.description,
    vendor: d.vendor,
    amount: String(d.amount),
    expenseDate: d.expenseDate,
    notes: d.notes,
  }).returning();
  res.status(201).json(expenseToApi(created));
});

router.delete("/events/:eventId/expenses/:id", requireRole("admin", "event"), async (req, res): Promise<void> => {
  const xid = uuidParam(req.params.id);
  if (!xid.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(eventExpensesTable).where(eq(eventExpensesTable.id, xid.data)).returning();
  if (!deleted) { res.status(404).json({ error: "Expense not found" }); return; }
  res.status(204).end();
});

// ═══════════════════════════════════════════════════════════════════
// TICKET BOOKLETS
// ═══════════════════════════════════════════════════════════════════
const BookletInputSchema = z.object({
  bookletNumber: z.string().min(1),
  ticketRangeStart: z.coerce.number().int().min(1),
  ticketRangeEnd: z.coerce.number().int().min(1),
  assignedTo: z.string().default(""),
  assignedDate: z.string().default(""),
  status: z.enum(["available", "assigned", "sold", "completed"]).default("available"),
  ticketAmount: z.coerce.number().nonnegative().default(0),
});

router.get("/events/:eventId/booklets", async (req, res): Promise<void> => {
  const eid = uuidParam(req.params.eventId);
  if (!eid.success) { res.status(400).json({ error: "Invalid event id" }); return; }
  const rows = await db
    .select()
    .from(eventTicketBookletsTable)
    .where(eq(eventTicketBookletsTable.eventId, eid.data))
    .orderBy(eventTicketBookletsTable.createdAt);
  res.json(rows.map(bookletToApi));
});

router.post("/events/:eventId/booklets", requireRole("admin", "event"), async (req, res): Promise<void> => {
  const eid = uuidParam(req.params.eventId);
  if (!eid.success) { res.status(400).json({ error: "Invalid event id" }); return; }
  const [ev] = await db.select({ id: eventsTable.id }).from(eventsTable).where(eq(eventsTable.id, eid.data));
  if (!ev) { res.status(404).json({ error: "Event not found" }); return; }
  const parsed = BookletInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  if (d.ticketRangeEnd < d.ticketRangeStart) {
    res.status(400).json({ error: "ticketRangeEnd must be >= ticketRangeStart" }); return;
  }
  const [booklet] = await db.insert(eventTicketBookletsTable).values({
    eventId: eid.data,
    bookletNumber: d.bookletNumber,
    ticketRangeStart: d.ticketRangeStart,
    ticketRangeEnd: d.ticketRangeEnd,
    assignedTo: d.assignedTo,
    assignedDate: d.assignedDate,
    status: d.status,
  }).returning();

  // Auto-create individual tickets for the booklet range
  const ticketInserts = [];
  for (let n = d.ticketRangeStart; n <= d.ticketRangeEnd; n++) {
    ticketInserts.push({
      bookletId: booklet.id,
      eventId: eid.data,
      ticketNumber: n,
      isSold: false,
      amount: String(d.ticketAmount),
    });
  }
  if (ticketInserts.length > 0) {
    await db.insert(eventTicketsTable).values(ticketInserts);
  }

  res.status(201).json(bookletToApi(booklet));
});

router.put("/events/:eventId/booklets/:id", requireRole("admin", "event"), async (req, res): Promise<void> => {
  const bid = uuidParam(req.params.id);
  if (!bid.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = BookletInputSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const updates: Record<string, unknown> = {};
  if (d.bookletNumber !== undefined) updates.bookletNumber = d.bookletNumber;
  if (d.assignedTo !== undefined) updates.assignedTo = d.assignedTo;
  if (d.assignedDate !== undefined) updates.assignedDate = d.assignedDate;
  if (d.status !== undefined) updates.status = d.status;
  const [updated] = await db.update(eventTicketBookletsTable).set(updates).where(eq(eventTicketBookletsTable.id, bid.data)).returning();
  if (!updated) { res.status(404).json({ error: "Booklet not found" }); return; }
  res.json(bookletToApi(updated));
});

router.delete("/events/:eventId/booklets/:id", requireRole("admin", "event"), async (req, res): Promise<void> => {
  const bid = uuidParam(req.params.id);
  if (!bid.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(eventTicketBookletsTable).where(eq(eventTicketBookletsTable.id, bid.data)).returning();
  if (!deleted) { res.status(404).json({ error: "Booklet not found" }); return; }
  res.status(204).end();
});

// ═══════════════════════════════════════════════════════════════════
// TICKETS (within a booklet)
// ═══════════════════════════════════════════════════════════════════
router.get("/events/:eventId/booklets/:bookletId/tickets", async (req, res): Promise<void> => {
  const bid = uuidParam(req.params.bookletId);
  if (!bid.success) { res.status(400).json({ error: "Invalid booklet id" }); return; }
  const rows = await db
    .select()
    .from(eventTicketsTable)
    .where(eq(eventTicketsTable.bookletId, bid.data))
    .orderBy(eventTicketsTable.ticketNumber);
  res.json(rows.map(ticketToApi));
});

const TicketUpdateSchema = z.object({
  isSold: z.boolean().optional(),
  soldBy: z.string().optional(),
  buyerName: z.string().optional(),
  buyerPhone: z.string().optional(),
  saleDate: z.string().optional(),
  amount: z.coerce.number().nonnegative().optional(),
});

router.patch("/events/:eventId/booklets/:bookletId/tickets/:ticketId", requireRole("admin", "event"), async (req, res): Promise<void> => {
  const tid = uuidParam(req.params.ticketId);
  if (!tid.success) { res.status(400).json({ error: "Invalid ticket id" }); return; }
  const parsed = TicketUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const updates: Record<string, unknown> = {};
  if (d.isSold !== undefined) updates.isSold = d.isSold;
  if (d.soldBy !== undefined) updates.soldBy = d.soldBy;
  if (d.buyerName !== undefined) updates.buyerName = d.buyerName;
  if (d.buyerPhone !== undefined) updates.buyerPhone = d.buyerPhone;
  if (d.saleDate !== undefined) updates.saleDate = d.saleDate;
  if (d.amount !== undefined) updates.amount = String(d.amount);
  const [updated] = await db.update(eventTicketsTable).set(updates).where(eq(eventTicketsTable.id, tid.data)).returning();
  if (!updated) { res.status(404).json({ error: "Ticket not found" }); return; }
  res.json(ticketToApi(updated));
});

// ═══════════════════════════════════════════════════════════════════
// FINANCIAL SUMMARY
// ═══════════════════════════════════════════════════════════════════
router.get("/events/:eventId/financial-summary", async (req, res): Promise<void> => {
  const eid = uuidParam(req.params.eventId);
  if (!eid.success) { res.status(400).json({ error: "Invalid event id" }); return; }

  const [sponsorsAgg] = await db
    .select({
      total: sql<number>`COALESCE(SUM(amount::numeric), 0)::float`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(eventSponsorsTable)
    .where(eq(eventSponsorsTable.eventId, eid.data));

  const [expensesAgg] = await db
    .select({
      total: sql<number>`COALESCE(SUM(amount::numeric), 0)::float`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(eventExpensesTable)
    .where(eq(eventExpensesTable.eventId, eid.data));

  const [ticketsAgg] = await db
    .select({
      totalTickets: sql<number>`COUNT(*)::int`,
      soldTickets: sql<number>`SUM(CASE WHEN is_sold THEN 1 ELSE 0 END)::int`,
      ticketRevenue: sql<number>`COALESCE(SUM(CASE WHEN is_sold THEN amount::numeric ELSE 0 END), 0)::float`,
    })
    .from(eventTicketsTable)
    .where(eq(eventTicketsTable.eventId, eid.data));

  const totalIncome = Number(sponsorsAgg.total) + Number(ticketsAgg.ticketRevenue);
  const totalExpenses = Number(expensesAgg.total);
  const netBalance = totalIncome - totalExpenses;

  res.json({
    sponsors: {
      total: Number(sponsorsAgg.total),
      count: Number(sponsorsAgg.count),
    },
    expenses: {
      total: Number(expensesAgg.total),
      count: Number(expensesAgg.count),
    },
    tickets: {
      total: Number(ticketsAgg.totalTickets),
      sold: Number(ticketsAgg.soldTickets ?? 0),
      unsold: Number(ticketsAgg.totalTickets) - Number(ticketsAgg.soldTickets ?? 0),
      revenue: Number(ticketsAgg.ticketRevenue),
    },
    summary: {
      totalIncome,
      totalExpenses,
      netBalance,
    },
  });
});

export default router;
