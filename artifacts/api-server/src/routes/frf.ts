import { Router, type IRouter } from "express";
import { eq, desc, and, sql, notInArray } from "drizzle-orm";
import { db, frfClaimsTable, frfContributionsTable, membersTable, paymentsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { getUserById } from "../lib/users";
import { z } from "zod";
import {
  generateContributionsForClaim,
  cancelPendingContributions,
  reopenCancelledContributions,
  deriveContributionStatus,
} from "../lib/frf-ledger";

const router: IRouter = Router();
router.use(requireAuth);

const DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp);base64,/;
const PhotoDataUrl = z
  .string()
  .max(1_500_000, "Photo is too large — please upload a smaller image")
  .regex(DATA_URL_RE, "Photo must be a jpeg/png/webp data URL");

const FrfClaimInput = z.object({
  title: z.string().optional().default(""),
  photoUrl: PhotoDataUrl.nullable().optional(),
  supportingPhotos: z.array(PhotoDataUrl).max(6).optional(),
  closingDate: z.string().datetime().nullable().optional(),
  claimantName: z.string().min(1),
  membershipId: z.string().optional().default(""),
  memberId: z.string().uuid().nullable().optional(),
  claimType: z.enum(["death_benefit", "emergency", "air_ticket", "other"]).default("death_benefit"),
  amountRequested: z.number().min(0).default(0),
  amountApproved: z.number().min(0).default(0),
  contributionAmount: z.number().min(0).default(50),
  status: z.enum(["pending", "under_review", "approved", "rejected", "disbursed"]).default("pending"),
  claimDate: z.string().datetime().optional(),
  approvedDate: z.string().datetime().nullable().optional(),
  approvedBy: z.string().optional().default(""),
  beneficiaryName: z.string().optional().default(""),
  beneficiaryRelation: z.string().optional().default(""),
  description: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  reviewNotes: z.string().optional().default(""),
});

/** A case is closed once it is disbursed or rejected; otherwise it is open. */
function caseStatusOf(status: string): "open" | "closed" {
  return status === "disbursed" || status === "rejected" ? "closed" : "open";
}

function frfToApi(row: any) {
  return {
    id: row.id,
    memberId: row.memberId ?? null,
    title: row.title ?? "",
    photoUrl: row.photoUrl ?? null,
    supportingPhotos: row.supportingPhotos ?? [],
    caseStatus: caseStatusOf(row.status),
    closingDate: row.closingDate?.toISOString() ?? null,
    claimantName: row.claimantName,
    membershipId: row.membershipId ?? "",
    claimType: row.claimType,
    amountRequested: Number(row.amountRequested),
    amountApproved: Number(row.amountApproved),
    contributionAmount: Number(row.contributionAmount ?? 50),
    status: row.status,
    claimDate: row.claimDate?.toISOString() ?? null,
    approvedDate: row.approvedDate?.toISOString() ?? null,
    approvedBy: row.approvedBy ?? "",
    underReviewAt: row.underReviewAt?.toISOString() ?? null,
    underReviewBy: row.underReviewBy ?? "",
    disbursedAt: row.disbursedAt?.toISOString() ?? null,
    disbursedBy: row.disbursedBy ?? "",
    rejectedBy: row.rejectedBy ?? "",
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
    reviewNotes: row.reviewNotes ?? "",
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

    // One grouped query for live collection totals (excludes cancelled/exempt rows).
    const totals = await db
      .select({
        claimId: frfContributionsTable.claimId,
        collected: sql<string>`COALESCE(SUM(LEAST(${frfContributionsTable.amountPaid}, ${frfContributionsTable.amount})), 0)`,
      })
      .from(frfContributionsTable)
      .where(notInArray(frfContributionsTable.status, ["cancelled", "exempt"]))
      .groupBy(frfContributionsTable.claimId);
    const collectedByClaim = new Map(totals.map((t) => [t.claimId, Number(t.collected)]));

    res.json(rows.map((row) => {
      const collectedAmount = collectedByClaim.get(row.id) ?? 0;
      const target = Number(row.amountRequested);
      return {
        ...frfToApi(row),
        collectedAmount,
        targetProgress: target > 0 ? Math.min(100, Math.round((collectedAmount / target) * 100)) : 0,
      };
    }));
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
      title: data.title,
      photoUrl: data.photoUrl ?? null,
      supportingPhotos: data.supportingPhotos ?? [],
      closingDate: data.closingDate ? new Date(data.closingDate) : null,
      claimantName: data.claimantName,
      membershipId: data.membershipId,
      memberId: data.memberId ?? null,
      claimType: data.claimType,
      amountRequested: String(data.amountRequested),
      amountApproved: String(data.amountApproved),
      contributionAmount: String(data.contributionAmount),
      status: data.status,
      claimDate: data.claimDate ? new Date(data.claimDate) : new Date(),
      approvedDate: data.approvedDate ? new Date(data.approvedDate) : null,
      approvedBy: data.approvedBy,
      beneficiaryName: data.beneficiaryName,
      beneficiaryRelation: data.beneficiaryRelation,
      description: data.description,
      notes: data.notes,
    }).returning();
    // Auto-link: every new case immediately creates a pending contribution
    // record for every active member (unless created directly as rejected).
    if (created!.status !== "rejected") {
      const generated = await generateContributionsForClaim(created!.id, Number(created!.contributionAmount));
      req.log.info({ claimId: created!.id, generated }, "FRF contributions generated on case creation");
    }
    logAudit(req, "claim_created", "frf", { entityId: created!.id, entityName: data.claimantName, details: `Type: ${data.claimType}, Status: ${data.status}` });
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
    if (data.title !== undefined) updateData.title = data.title;
    if (data.photoUrl !== undefined) updateData.photoUrl = data.photoUrl;
    if (data.supportingPhotos !== undefined) updateData.supportingPhotos = data.supportingPhotos;
    if (data.closingDate !== undefined) updateData.closingDate = data.closingDate ? new Date(data.closingDate) : null;
    if (data.claimantName !== undefined) updateData.claimantName = data.claimantName;
    if (data.membershipId !== undefined) updateData.membershipId = data.membershipId;
    if (data.memberId !== undefined) updateData.memberId = data.memberId;
    if (data.claimType !== undefined) updateData.claimType = data.claimType;
    if (data.amountRequested !== undefined) updateData.amountRequested = String(data.amountRequested);
    if (data.amountApproved !== undefined) updateData.amountApproved = String(data.amountApproved);
    if (data.contributionAmount !== undefined) updateData.contributionAmount = String(data.contributionAmount);
    if (data.status !== undefined) updateData.status = data.status;
    if (data.claimDate !== undefined) updateData.claimDate = new Date(data.claimDate);
    if (data.approvedDate !== undefined) updateData.approvedDate = data.approvedDate ? new Date(data.approvedDate) : null;
    if (data.approvedBy !== undefined) updateData.approvedBy = data.approvedBy;
    if (data.beneficiaryName !== undefined) updateData.beneficiaryName = data.beneficiaryName;
    if (data.beneficiaryRelation !== undefined) updateData.beneficiaryRelation = data.beneficiaryRelation;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.reviewNotes !== undefined) updateData.reviewNotes = data.reviewNotes;

    if (data.status !== undefined) {
      const actor = getUserById((req as any).userId ?? "")?.displayName ?? (req as any).userId ?? "";
      const now = new Date();
      if (data.status === "under_review") { updateData.underReviewBy = actor; updateData.underReviewAt = now; }
      if (data.status === "approved") { updateData.approvedBy = actor; updateData.approvedDate = now; }
      if (data.status === "rejected") { updateData.rejectedBy = actor; updateData.rejectedAt = now; }
      if (data.status === "disbursed") { updateData.disbursedBy = actor; updateData.disbursedAt = now; }
    }

    const [existing] = await db.select().from(frfClaimsTable).where(eq(frfClaimsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    const [updated] = await db.update(frfClaimsTable).set(updateData).where(eq(frfClaimsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }

    // Keep the contribution ledger synchronized with claim status.
    // Contributions exist from case creation; only rejection cancels the
    // still-pending obligations (paid/partial rows are always preserved).
    // Closing a case (disbursed) freezes records without cancelling them.
    const wasRejected = existing.status === "rejected";
    const isRejected = updated.status === "rejected";
    if (isRejected && !wasRejected) {
      const cancelled = await cancelPendingContributions(updated.id);
      req.log.info({ claimId: updated.id, cancelled }, "FRF pending contributions cancelled on rejection");
    } else if (!isRejected && wasRejected) {
      const reopened = await reopenCancelledContributions(updated.id);
      const generated = await generateContributionsForClaim(updated.id, Number(updated.contributionAmount));
      req.log.info({ claimId: updated.id, generated, reopened }, "FRF contributions reopened");
    } else if (!isRejected && data.contributionAmount !== undefined && Number(existing.contributionAmount) !== data.contributionAmount) {
      // Amount changed on an open claim: update unpaid ledger rows only.
      await db.update(frfContributionsTable)
        .set({ amount: String(data.contributionAmount) })
        .where(and(eq(frfContributionsTable.claimId, updated.id), eq(frfContributionsTable.status, "pending")));
    }

    const action = data.status === "approved" ? "claim_approved" : data.status === "rejected" ? "claim_rejected" : "claim_updated";
    logAudit(req, action, "frf", { entityId: updated.id, entityName: updated.claimantName, details: `Status: ${updated.status}` });
    res.json(frfToApi(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update FRF claim" });
  }
});

router.get("/frf/claims/:id/collection", async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  try {
    const [claim] = await db.select().from(frfClaimsTable).where(eq(frfClaimsTable.id, id));
    if (!claim) { res.status(404).json({ error: "Not found" }); return; }

    const rows = await db
      .select({
        contribution: frfContributionsTable,
        member: membersTable,
      })
      .from(frfContributionsTable)
      .innerJoin(membersTable, eq(frfContributionsTable.memberId, membersTable.id))
      .where(eq(frfContributionsTable.claimId, id))
      .orderBy(desc(frfContributionsTable.createdAt));

    // Look up receipt/method/notes of linked payments in one query.
    const paymentIds = rows.map((r) => r.contribution.paymentId).filter((p): p is string => Boolean(p));
    const paymentById = new Map<string, { receiptNumber: string; paymentMethod: string; notes: string | null }>();
    if (paymentIds.length > 0) {
      const paymentRows = await db
        .select({
          id: paymentsTable.id,
          receiptNumber: paymentsTable.receiptNumber,
          paymentMethod: paymentsTable.paymentMethod,
          notes: paymentsTable.notes,
        })
        .from(paymentsTable);
      const wanted = new Set(paymentIds);
      for (const p of paymentRows) if (wanted.has(p.id)) paymentById.set(p.id, p);
    }

    const now = new Date();
    let expectedAmount = 0;
    let collectedAmount = 0;
    let lastPaymentAt: Date | null = null;
    let paidCount = 0, partialCount = 0, pendingCount = 0, overdueCount = 0, cancelledCount = 0, exemptCount = 0;

    const contributors = rows.map(({ contribution: c, member: m }) => {
      const status = deriveContributionStatus(c, claim.approvedDate, now);
      const amount = Number(c.amount);
      const amountPaid = Number(c.amountPaid);
      if (status === "cancelled") {
        cancelledCount++;
      } else if (status === "exempt") {
        exemptCount++;
      } else {
        expectedAmount += amount;
        collectedAmount += amountPaid;
        if (status === "paid") paidCount++;
        else if (status === "partial") partialCount++;
        else if (status === "overdue") overdueCount++;
        else pendingCount++;
      }
      if (amountPaid > 0 && c.paidAt && (!lastPaymentAt || c.paidAt > lastPaymentAt)) {
        lastPaymentAt = c.paidAt;
      }
      const payment = c.paymentId ? paymentById.get(c.paymentId) : undefined;
      return {
        contributionId: c.id,
        memberId: m.id,
        fullName: m.fullName,
        membershipId: m.membershipId,
        mobileNumber: m.mobileNumber,
        photoUrl: m.photoUrl ?? null,
        refMemberName: m.refMemberName ?? "",
        amount,
        amountPaid,
        balance: Math.max(amount - amountPaid, 0),
        status,
        paidAt: c.paidAt?.toISOString() ?? null,
        receiptNumber: payment?.receiptNumber ?? null,
        paymentMethod: payment?.paymentMethod ?? null,
        remarks: payment?.notes ?? null,
      };
    });

    const outstandingAmount = Math.max(expectedAmount - collectedAmount, 0);
    const targetAmount = Number(claim.amountRequested);
    res.json({
      claim: frfToApi(claim),
      totalMembers: paidCount + partialCount + pendingCount + overdueCount,
      expectedAmount,
      collectedAmount,
      outstandingAmount,
      targetAmount,
      remainingToTarget: Math.max(targetAmount - collectedAmount, 0),
      targetProgress: targetAmount > 0 ? Math.min(Math.round((collectedAmount / targetAmount) * 100), 100) : 0,
      collectionRate: expectedAmount > 0 ? Math.round((collectedAmount / expectedAmount) * 100) : 0,
      lastPaymentAt: lastPaymentAt ? (lastPaymentAt as Date).toISOString() : null,
      paidCount,
      partialCount,
      pendingCount,
      overdueCount,
      cancelledCount,
      exemptCount,
      contributors,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get FRF claim collection" });
  }
});

const ContributionStatusInput = z.object({
  status: z.enum(["exempt", "pending"]),
});

// Mark a member exempt for a case (or revert to pending). Paid/partial rows
// keep their money on record; only the obligation flag changes.
router.patch(
  "/frf/claims/:id/contributions/:contributionId",
  requireRole("admin", "finance"),
  async (req, res): Promise<void> => {
    const claimId = req.params["id"] as string;
    const contributionId = req.params["contributionId"] as string;
    const parsed = ContributionStatusInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    try {
      const [existing] = await db
        .select()
        .from(frfContributionsTable)
        .where(and(eq(frfContributionsTable.id, contributionId), eq(frfContributionsTable.claimId, claimId)));
      if (!existing) { res.status(404).json({ error: "Contribution not found" }); return; }

      let newStatus: string = parsed.data.status;
      if (newStatus === "exempt" && Number(existing.amountPaid) > 0) {
        res.status(409).json({ error: "Cannot exempt a contribution that already has payments recorded" });
        return;
      }
      if (newStatus === "pending" && Number(existing.amountPaid) > 0) {
        // Reverting exemption on a row with money recorded: recompute.
        newStatus = Number(existing.amountPaid) >= Number(existing.amount) ? "paid" : "partial";
      }
      const [updated] = await db
        .update(frfContributionsTable)
        .set({ status: newStatus })
        .where(eq(frfContributionsTable.id, contributionId))
        .returning();
      logAudit(req, "contribution_status_changed", "frf", {
        entityId: contributionId,
        entityName: existing.memberId,
        details: `Status: ${existing.status} → ${newStatus}`,
      });
      res.json({ id: updated!.id, status: updated!.status });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Failed to update contribution status" });
    }
  },
);

const ClaimPhotoInput = z.object({
  photoUrl: PhotoDataUrl.nullable().optional(),
  supportingPhotos: z.array(PhotoDataUrl).max(6).optional(),
});

router.patch("/frf/claims/:id/photo", requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  const parsed = ClaimPhotoInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const updateData: Record<string, any> = {};
    if (parsed.data.photoUrl !== undefined) updateData.photoUrl = parsed.data.photoUrl;
    if (parsed.data.supportingPhotos !== undefined) updateData.supportingPhotos = parsed.data.supportingPhotos;
    if (Object.keys(updateData).length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }
    const [updated] = await db
      .update(frfClaimsTable)
      .set(updateData)
      .where(eq(frfClaimsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    logAudit(req, "claim_photo_updated", "frf", {
      entityId: updated.id,
      entityName: updated.claimantName,
      details: parsed.data.photoUrl === null ? "Beneficiary photo removed" : "Beneficiary photo updated",
    });
    res.json(frfToApi(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update claim photo" });
  }
});

router.delete("/frf/claims/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  try {
    const [deleted] = await db.delete(frfClaimsTable).where(eq(frfClaimsTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
    logAudit(req, "claim_deleted", "frf", { entityId: deleted.id, entityName: deleted.claimantName });
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete FRF claim" });
  }
});

export default router;
