import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db, frfMembershipsTable, frfAmbassadorHistoryTable } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/frf/ambassadors", async (req, res): Promise<void> => {
  const { period = "all-time", year, quarter, month } = req.query;

  const rows = await db
    .select()
    .from(frfMembershipsTable)
    .where(eq(frfMembershipsTable.status, "approved"));

  const now = new Date();
  let filtered = rows;

  if (period === "monthly" && month) {
    const parts = String(month).split("-").map(Number);
    const y = parts[0];
    const m = parts[1];
    if (y && m) {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 1);
      filtered = rows.filter((r) => r.approvedAt && r.approvedAt >= start && r.approvedAt < end);
    }
  } else if (period === "quarterly") {
    const yr = Number(year ?? now.getFullYear());
    const q = Number(quarter ?? Math.floor(now.getMonth() / 3) + 1);
    const startMonth = (q - 1) * 3;
    const start = new Date(yr, startMonth, 1);
    const end = new Date(yr, startMonth + 3, 1);
    filtered = rows.filter((r) => r.approvedAt && r.approvedAt >= start && r.approvedAt < end);
  } else if (period === "yearly") {
    const yr = Number(year ?? now.getFullYear());
    const start = new Date(yr, 0, 1);
    const end = new Date(yr + 1, 0, 1);
    filtered = rows.filter((r) => r.approvedAt && r.approvedAt >= start && r.approvedAt < end);
  }

  const withReferrer = filtered.filter((r) => r.referrerDkmoId && r.referrerDkmoId.trim() !== "");

  const map = new Map<string, { name: string; dkmoId: string; frfNumber: string; count: number }>();
  for (const r of withReferrer) {
    const key = r.referrerDkmoId;
    const prev = map.get(key) ?? { name: r.referrerMemberName, dkmoId: key, frfNumber: r.referrerFrfNumber, count: 0 };
    prev.count++;
    map.set(key, prev);
  }

  const sorted = Array.from(map.values()).sort((a, b) => b.count - a.count);
  const ranked = sorted.map((entry, i) => ({
    rank: i + 1,
    referrerMemberName: entry.name,
    referrerDkmoId: entry.dkmoId,
    referrerFrfNumber: entry.frfNumber,
    approvedReferrals: entry.count,
    points: entry.count,
    awardStatus: i < 3 ? "eligible_for_momento" : "pending_review",
  }));

  res.json(ranked);
});

router.get("/frf/ambassador-history", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(frfAmbassadorHistoryTable)
    .orderBy(desc(frfAmbassadorHistoryTable.year), frfAmbassadorHistoryTable.rank);
  res.json(rows);
});

const HistoryInput = z.object({
  year: z.number().int().min(2000).max(2100),
  periodType: z.string().default("annual"),
  rank: z.number().int().min(1),
  referrerMemberName: z.string().min(1),
  referrerDkmoId: z.string().default(""),
  referrerFrfNumber: z.string().default(""),
  approvedReferrals: z.number().int().default(0),
  points: z.number().int().default(0),
  awardStatus: z.enum(["eligible_for_momento", "awarded", "pending_review"]).default("pending_review"),
  notes: z.string().default(""),
});

router.post("/frf/ambassador-history", async (req, res): Promise<void> => {
  const parsed = HistoryInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const actor = (req as AuthedRequest).userId ?? "";
  const [created] = await db
    .insert(frfAmbassadorHistoryTable)
    .values({ ...parsed.data, createdBy: actor })
    .returning();
  res.status(201).json(created);
});

router.patch("/frf/ambassador-history/:id", async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  const parsed = HistoryInput.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db
    .update(frfAmbassadorHistoryTable)
    .set(parsed.data)
    .where(eq(frfAmbassadorHistoryTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(updated);
});

router.delete("/frf/ambassador-history/:id", async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  await db.delete(frfAmbassadorHistoryTable).where(eq(frfAmbassadorHistoryTable.id, id));
  res.status(204).end();
});

export default router;
