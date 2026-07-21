import { Router, type IRouter } from "express";
import { db, tasksTable, sponsorsTable, eventsTable } from "@workspace/db";
import { eq, desc, asc, sql, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const router: IRouter = Router();

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const TASK_STATUSES = ["pending", "in_progress", "completed", "cancelled"] as const;

const TaskInputSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().default(""),
  assignedTo: z.string().default(""),
  priority: z.enum(PRIORITIES).default("medium"),
  status: z.enum(TASK_STATUSES).default("pending"),
  dueDate: z.string().datetime().nullable().optional(),
  sponsorId: z.string().uuid().nullable().optional(),
  eventId: z.string().uuid().nullable().optional(),
});

const ListQuerySchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignedTo: z.string().optional(),
  sponsorId: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(),
  sort: z.enum(["recent", "dueAsc", "dueDesc", "priority"]).default("dueAsc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

function rowToApi(r: typeof tasksTable.$inferSelect & { sponsorName?: string | null; eventName?: string | null }) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    assignedTo: r.assignedTo,
    priority: r.priority,
    status: r.status,
    dueDate: r.dueDate ? r.dueDate.toISOString() : null,
    sponsorId: r.sponsorId ?? null,
    sponsorName: r.sponsorName ?? null,
    eventId: r.eventId ?? null,
    eventName: r.eventName ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

router.use("/tasks", requireAuth);

router.get("/tasks", async (req, res): Promise<void> => {
  const parsed = ListQuerySchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { status, priority, assignedTo, sponsorId, eventId, sort, page, pageSize } = parsed.data;

  const conditions = [];
  if (status) conditions.push(eq(tasksTable.status, status));
  if (priority) conditions.push(eq(tasksTable.priority, priority));
  if (assignedTo) conditions.push(eq(tasksTable.assignedTo, assignedTo));
  if (sponsorId) conditions.push(eq(tasksTable.sponsorId, sponsorId));
  if (eventId) conditions.push(eq(tasksTable.eventId, eventId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const orderBy =
    sort === "dueDesc" ? desc(tasksTable.dueDate)
    : sort === "priority" ? asc(tasksTable.priority)
    : sort === "recent" ? desc(tasksTable.createdAt)
    : asc(tasksTable.dueDate);

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        task: tasksTable,
        sponsorName: sponsorsTable.sponsorName,
        eventName: eventsTable.name,
      })
      .from(tasksTable)
      .leftJoin(sponsorsTable, eq(tasksTable.sponsorId, sponsorsTable.id))
      .leftJoin(eventsTable, eq(tasksTable.eventId, eventsTable.id))
      .where(where)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(tasksTable).where(where),
  ]);

  let items = rows.map((r) => rowToApi({ ...r.task, sponsorName: r.sponsorName, eventName: r.eventName }));

  // Client-side priority sort after DB fetch when sort=priority
  if (sort === "priority") {
    items = items.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
  }

  res.json({ items, page, pageSize, total: Number(count ?? 0) });
});

router.get("/tasks/:id", async (req, res): Promise<void> => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db
    .select({ task: tasksTable, sponsorName: sponsorsTable.sponsorName, eventName: eventsTable.name })
    .from(tasksTable)
    .leftJoin(sponsorsTable, eq(tasksTable.sponsorId, sponsorsTable.id))
    .leftJoin(eventsTable, eq(tasksTable.eventId, eventsTable.id))
    .where(eq(tasksTable.id, id.data));
  if (!row) { res.status(404).json({ error: "Task not found" }); return; }
  res.json(rowToApi({ ...row.task, sponsorName: row.sponsorName, eventName: row.eventName }));
});

router.post("/tasks", requireRole("admin", "event", "finance"), async (req, res): Promise<void> => {
  const parsed = TaskInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const [created] = await db.insert(tasksTable).values({
    title: d.title,
    description: d.description,
    assignedTo: d.assignedTo,
    priority: d.priority,
    status: d.status,
    dueDate: d.dueDate ? new Date(d.dueDate) : null,
    sponsorId: d.sponsorId ?? null,
    eventId: d.eventId ?? null,
  }).returning();
  res.status(201).json(rowToApi({ ...created, sponsorName: null, eventName: null }));
});

router.put("/tasks/:id", requireRole("admin", "event", "finance"), async (req, res): Promise<void> => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = TaskInputSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const updates: Record<string, unknown> = {};
  if (d.title !== undefined) updates.title = d.title;
  if (d.description !== undefined) updates.description = d.description;
  if (d.assignedTo !== undefined) updates.assignedTo = d.assignedTo;
  if (d.priority !== undefined) updates.priority = d.priority;
  if (d.status !== undefined) updates.status = d.status;
  if (d.dueDate !== undefined) updates.dueDate = d.dueDate ? new Date(d.dueDate) : null;
  if (d.sponsorId !== undefined) updates.sponsorId = d.sponsorId ?? null;
  if (d.eventId !== undefined) updates.eventId = d.eventId ?? null;
  const [updated] = await db.update(tasksTable).set(updates).where(eq(tasksTable.id, id.data)).returning();
  if (!updated) { res.status(404).json({ error: "Task not found" }); return; }
  // Re-fetch with joins for sponsor/event names
  const [row] = await db
    .select({ task: tasksTable, sponsorName: sponsorsTable.sponsorName, eventName: eventsTable.name })
    .from(tasksTable)
    .leftJoin(sponsorsTable, eq(tasksTable.sponsorId, sponsorsTable.id))
    .leftJoin(eventsTable, eq(tasksTable.eventId, eventsTable.id))
    .where(eq(tasksTable.id, id.data));
  res.json(rowToApi({ ...row!.task, sponsorName: row!.sponsorName, eventName: row!.eventName }));
});

router.delete("/tasks/:id", requireRole("admin", "event", "finance"), async (req, res): Promise<void> => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(tasksTable).where(eq(tasksTable.id, id.data)).returning();
  if (!deleted) { res.status(404).json({ error: "Task not found" }); return; }
  res.status(204).end();
});

export default router;
