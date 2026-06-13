import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, frfClaimsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { z } from "zod";

const router: IRouter = Router();
router.use(requireAuth);

const FrfClaimInput = z.object({
  claimantName: z.string().min(1),
  membershipId: z.string().optional().default(""),
  memberId: z.string().uuid().nullable().optional(),
  claimType: z.enum(["death_benefit", "emergency", "air_ticket", "other"]).default("death_benefit"),
  amountRequested: z.number().min(0).default(0),
  amountApproved: z.number().min(0).default(0),
  status: z.enum(["pending", "under_review", "approved", "rejected", "disbursed"]).default("pending"),
  claimDate: z.string().datetime().optional(),
  approvedDate: z.string().datetime().nullable().optional(),
  approvedBy: z.string().optional().default(""),
  beneficiaryName: z.string().optional().default(""),
  beneficiaryRelation: z.string().optional().default(""),
  description: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

function frfToApi(row: any) {
  return {
    id: row.id,
    memberId: row.memberId ?? null,
    claimantName: row.claimantName,
    membershipId: row.membershipId ?? "",
    claimType: row.claimType,
    amountRequested: Number(row.amountRequested),
    amountApproved: Number(row.amountApproved),
    status: row.status,
    claimDate: row.claimDate?.toISOString() ?? null,
    approvedDate: row.approvedDate?.toISOString() ?? null,
    approvedBy: row.approvedBy ?? "",
    beneficiaryName: row.beneficiaryName ?? "",
    beneficiaryRelation: row.beneficiaryRelation ?? "",
    description: row.description ?? "",
    notes: row.notes ?? "",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/frf/claims", async (req, res): Promise<void> => {
  try {
    const { status, claimType } = req.query as Record<string, string>;
    let query = db.select().from(frfClaimsTable).$dynamic();

    const conditions = [];
    if (status && status !== "all") conditions.push(eq(frfClaimsTable.status, status));
    if (claimType && claimType !== "all") conditions.push(eq(frfClaimsTable.claimType, claimType));
    if (conditions.length > 0) query = query.where(and(...conditions));

    const rows = await query.orderBy(desc(frfClaimsTable.claimDate));
    res.json(rows.map(frfToApi));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list FRF claims" });
  }
});

router.get("/frf/stats", async (req, res): Promise<void> => {
  try {
    const rows = await db.select().from(frfClaimsTable);
    const total = rows.length;
    const approved = rows.filter((r) => r.status === "approved" || r.status === "disbursed");
    const pending = rows.filter((r) => r.status === "pending" || r.status === "under_review");
    const rejected = rows.filter((r) => r.status === "rejected");
    const totalDisbursed = approved.reduce((a, r) => a + Number(r.amountApproved), 0);
    const totalRequested = rows.reduce((a, r) => a + Number(r.amountRequested), 0);

    const byType = ["death_benefit", "emergency", "air_ticket", "other"].map((t) => ({
      type: t,
      count: rows.filter((r) => r.claimType === t).length,
      totalAmount: rows.filter((r) => r.claimType === t).reduce((a, r) => a + Number(r.amountApproved), 0),
    }));

    res.json({
      total,
      pendingCount: pending.length,
      approvedCount: approved.length,
      rejectedCount: rejected.length,
      totalDisbursed,
      totalRequested,
      byType,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get FRF stats" });
  }
});

router.post("/frf/claims", requireRole("admin", "finance"), async (req, res): Promise<void> => {
  const parsed = FrfClaimInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const data = parsed.data;
    const [created] = await db.insert(frfClaimsTable).values({
      claimantName: data.claimantName,
      membershipId: data.membershipId,
      memberId: data.memberId ?? null,
      claimType: data.claimType,
      amountRequested: String(data.amountRequested),
      amountApproved: String(data.amountApproved),
      status: data.status,
      claimDate: data.claimDate ? new Date(data.claimDate) : new Date(),
      approvedDate: data.approvedDate ? new Date(data.approvedDate) : null,
      approvedBy: data.approvedBy,
      beneficiaryName: data.beneficiaryName,
      beneficiaryRelation: data.beneficiaryRelation,
      description: data.description,
      notes: data.notes,
    }).returning();
    res.status(201).json(frfToApi(created!));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create FRF claim" });
  }
});

router.get("/frf/claims/:id", async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  try {
    const [row] = await db.select().from(frfClaimsTable).where(eq(frfClaimsTable.id, id));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(frfToApi(row));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get FRF claim" });
  }
});

router.put("/frf/claims/:id", requireRole("admin", "finance"), async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  const parsed = FrfClaimInput.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const data = parsed.data;
    const updateData: Record<string, any> = {};
    if (data.claimantName !== undefined) updateData.claimantName = data.claimantName;
    if (data.membershipId !== undefined) updateData.membershipId = data.membershipId;
    if (data.memberId !== undefined) updateData.memberId = data.memberId;
    if (data.claimType !== undefined) updateData.claimType = data.claimType;
    if (data.amountRequested !== undefined) updateData.amountRequested = String(data.amountRequested);
    if (data.amountApproved !== undefined) updateData.amountApproved = String(data.amountApproved);
    if (data.status !== undefined) updateData.status = data.status;
    if (data.claimDate !== undefined) updateData.claimDate = new Date(data.claimDate);
    if (data.approvedDate !== undefined) updateData.approvedDate = data.approvedDate ? new Date(data.approvedDate) : null;
    if (data.approvedBy !== undefined) updateData.approvedBy = data.approvedBy;
    if (data.beneficiaryName !== undefined) updateData.beneficiaryName = data.beneficiaryName;
    if (data.beneficiaryRelation !== undefined) updateData.beneficiaryRelation = data.beneficiaryRelation;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const [updated] = await db.update(frfClaimsTable).set(updateData).where(eq(frfClaimsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(frfToApi(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update FRF claim" });
  }
});

router.delete("/frf/claims/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  try {
    const [deleted] = await db.delete(frfClaimsTable).where(eq(frfClaimsTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete FRF claim" });
  }
});

export default router;
