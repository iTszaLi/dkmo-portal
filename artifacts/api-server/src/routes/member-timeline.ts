import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, memberTimelineEntriesTable, membersTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { z } from "zod";

const router: IRouter = Router();
router.use(requireAuth);

const idParams = z.object({ memberId: z.string().uuid() });
const entryParams = z.object({ memberId: z.string().uuid(), entryId: z.string().uuid() });
const entryInput = z.object({
  title: z.string().trim().min(1).max(160),
  detail: z.string().max(2000).optional().default(""),
  eventDate: z.string().datetime().nullable().optional(),
});

router.get("/members/:memberId/timeline", async (req, res): Promise<void> => {
  const parsed = idParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid member ID" }); return; }
  const [member] = await db.select({ id: membersTable.id }).from(membersTable).where(eq(membersTable.id, parsed.data.memberId));
  if (!member) { res.status(404).json({ error: "Member not found" }); return; }
  const entries = await db.select().from(memberTimelineEntriesTable)
    .where(eq(memberTimelineEntriesTable.memberId, parsed.data.memberId))
    .orderBy(desc(memberTimelineEntriesTable.eventDate), desc(memberTimelineEntriesTable.createdAt));
  res.json(entries);
});

router.post("/members/:memberId/timeline", requireRole("admin", "finance"), async (req, res): Promise<void> => {
  const params = idParams.safeParse(req.params);
  const body = entryInput.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid timeline entry" }); return; }
  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, params.data.memberId));
  if (!member) { res.status(404).json({ error: "Member not found" }); return; }
  const [entry] = await db.insert(memberTimelineEntriesTable).values({
    memberId: member.id,
    title: body.data.title,
    detail: body.data.detail,
    eventDate: body.data.eventDate ? new Date(body.data.eventDate) : null,
    createdBy: (req as any).userId ?? "",
  }).returning();
  await logAudit(req, "member_timeline_created", "members", { entityId: entry!.id, entityName: member.fullName, details: body.data.title });
  res.status(201).json(entry);
});

router.put("/members/:memberId/timeline/:entryId", requireRole("admin", "finance"), async (req, res): Promise<void> => {
  const params = entryParams.safeParse(req.params);
  const body = entryInput.partial().safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid timeline entry" }); return; }
  const [entry] = await db.update(memberTimelineEntriesTable).set({
    ...(body.data.title !== undefined ? { title: body.data.title } : {}),
    ...(body.data.detail !== undefined ? { detail: body.data.detail } : {}),
    ...(body.data.eventDate !== undefined ? { eventDate: body.data.eventDate ? new Date(body.data.eventDate) : null } : {}),
    updatedAt: new Date(),
  }).where(and(eq(memberTimelineEntriesTable.id, params.data.entryId), eq(memberTimelineEntriesTable.memberId, params.data.memberId))).returning();
  if (!entry) { res.status(404).json({ error: "Timeline entry not found" }); return; }
  await logAudit(req, "member_timeline_updated", "members", { entityId: entry.id, details: entry.title });
  res.json(entry);
});

router.delete("/members/:memberId/timeline/:entryId", requireRole("admin", "finance"), async (req, res): Promise<void> => {
  const params = entryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid timeline entry" }); return; }
  const [entry] = await db.delete(memberTimelineEntriesTable)
    .where(and(eq(memberTimelineEntriesTable.id, params.data.entryId), eq(memberTimelineEntriesTable.memberId, params.data.memberId)))
    .returning();
  if (!entry) { res.status(404).json({ error: "Timeline entry not found" }); return; }
  await logAudit(req, "member_timeline_deleted", "members", { entityId: entry.id, details: entry.title });
  res.sendStatus(204);
});

export default router;