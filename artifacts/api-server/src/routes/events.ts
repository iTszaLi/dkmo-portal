import { Router, type IRouter } from "express";
import { db, eventsTable, tasksTable } from "@workspace/db";
import { eq, ilike, desc, asc, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const router: IRouter = Router();

const EVENT_STATUSES = ["upcoming", "ongoing", "completed", "cancelled"] as const;

const EventInputSchema = z.object({
  name: z.string().min(1, "Event name is required"),
  eventDate: z.string().datetime().nullable().optional(),
  location: z.string().default(""),
  budget: z.coerce.number().nonnegative().default(0),
  description: z.string().default(""),
  status: z.enum(EVENT_STATUSES).default("upcoming"),
});

const ListQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(EVENT_STATUSES).optional(),
  sort: z.enum(["recent", "name", "dateAsc", "dateDesc"]).default("dateDesc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

function rowToApi(r: typeof eventsTable.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    eventDate: r.eventDate ? r.eventDate.toISOString() : null,
    location: r.location,
    budget: Number(r.budget),
    description: r.description,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

router.use("/events", requireAuth);

router.get("/events", async (req, res): Promise<void> => {
  const parsed = ListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, status, sort, page, pageSize } = parsed.data;

  const where = sql`${search ? sql`${eventsTable.name} ilike ${"%" + search + "%"}` : sql`TRUE`}
    AND ${status ? sql`${eventsTable.status} = ${status}` : sql`TRUE`}`;

  const orderBy =
    sort === "name"
      ? asc(eventsTable.name)
      : sort === "dateAsc"
        ? asc(eventsTable.eventDate)
        : sort === "dateDesc"
          ? desc(eventsTable.eventDate)
          : desc(eventsTable.createdAt);

  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(eventsTable)
      .where(where)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(eventsTable).where(where),
  ]);

  res.json({ items: rows.map(rowToApi), page, pageSize, total: Number(count ?? 0) });
});

router.get("/events/:id", async (req, res): Promise<void> => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(eventsTable).where(eq(eventsTable.id, id.data));
  if (!row) { res.status(404).json({ error: "Event not found" }); return; }
  // Include task count
  const [{ cnt }] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(tasksTable)
    .where(eq(tasksTable.eventId, id.data));
  res.json({ ...rowToApi(row), taskCount: Number(cnt ?? 0) });
});

router.post("/events", requireRole("admin", "event"), async (req, res): Promise<void> => {
  const parsed = EventInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const [created] = await db.insert(eventsTable).values({
    name: d.name,
    eventDate: d.eventDate ? new Date(d.eventDate) : null,
    location: d.location,
    budget: String(d.budget),
    description: d.description,
    status: d.status,
  }).returning();
  res.status(201).json(rowToApi(created));
});

router.put("/events/:id", requireRole("admin", "event"), async (req, res): Promise<void> => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = EventInputSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const updates: Record<string, unknown> = {};
  if (d.name !== undefined) updates.name = d.name;
  if (d.eventDate !== undefined) updates.eventDate = d.eventDate ? new Date(d.eventDate) : null;
  if (d.location !== undefined) updates.location = d.location;
  if (d.budget !== undefined) updates.budget = String(d.budget);
  if (d.description !== undefined) updates.description = d.description;
  if (d.status !== undefined) updates.status = d.status;
  const [updated] = await db.update(eventsTable).set(updates).where(eq(eventsTable.id, id.data)).returning();
  if (!updated) { res.status(404).json({ error: "Event not found" }); return; }
  res.json(rowToApi(updated));
});

router.delete("/events/:id", requireRole("admin", "event"), async (req, res): Promise<void> => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(eventsTable).where(eq(eventsTable.id, id.data)).returning();
  if (!deleted) { res.status(404).json({ error: "Event not found" }); return; }
  res.status(204).end();
});

export default router;
