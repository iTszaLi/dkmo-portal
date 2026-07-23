import { Router, type IRouter } from "express";
import { eq, ilike, or, desc, sql, type SQL } from "drizzle-orm";
import { db, membersTable, frfClaimsTable, frfContributionsTable, paymentsTable } from "@workspace/db";
import {
  CreateMemberBody,
  UpdateMemberBody,
  GetMemberParams,
  UpdateMemberParams,
  DeleteMemberParams,
  ListMembersQueryParams,
  UpdateMemberFeeStatusParams,
  UpdateMemberFeeStatusBody,
  UpdateMemberCommitteeStatusParams,
  UpdateMemberCommitteeStatusBody,
  UpdateMemberPhotoParams,
  UpdateMemberPhotoBody,
} from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { memberToApi } from "../lib/serializers";
import { logAudit } from "../lib/audit";
import {
  aggregateMemberFrf,
  deriveContributionStatus,
  frfEligibility,
} from "../lib/frf-ledger";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/members", async (req, res): Promise<void> => {
  const parsed = ListMembersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const search = parsed.data.search?.trim();

  let rows;
  if (search) {
    const like = `%${search}%`;
    const conditions: SQL[] = [
      ilike(membersTable.fullName, like),
      ilike(membersTable.mobileNumber, like),
      ilike(membersTable.membershipId, like),
      ilike(membersTable.applicationNumber, like),
      ilike(membersTable.iqamaNumber, like),
      ilike(membersTable.jamaath, like),
      ilike(membersTable.city, like),
      ilike(membersTable.country, like),
      ilike(membersTable.refMemberName, like),
      // Match members whose referrer's DKMO ID matches the search term.
      sql`${membersTable.refMemberId} IN (SELECT ref.id::text FROM members ref WHERE ref.membership_id ILIKE ${like})`,
    ];
    // Mobile search: users type the KSA number without the leading zero
    // (e.g. 502260256). Normalize stored numbers to digits-only and match,
    // so leading zeros / country codes don't block the lookup.
    const digits = search.replace(/\D/g, "").replace(/^0+/, "");
    if (digits.length > 0) {
      conditions.push(
        sql`regexp_replace(${membersTable.mobileNumber}, '\D', '', 'g') ILIKE ${"%" + digits + "%"}`,
      );
    }
    rows = await db
      .select()
      .from(membersTable)
      .where(or(...conditions))
      .orderBy(desc(membersTable.createdAt));
  } else {
    rows = await db
      .select()
      .from(membersTable)
      .orderBy(desc(membersTable.createdAt));
  }

  // Attach FRF ledger aggregates so the members list can show
  // Due / Paid / Outstanding without extra requests.
  const frfAgg = await aggregateMemberFrf(rows.map((r) => r.id));
  res.json(
    rows.map((m) => {
      const agg = frfAgg.get(m.id);
      return {
        ...memberToApi(m),
        frfDue: agg?.totalDue ?? 0,
        frfPaid: agg?.totalPaid ?? 0,
        frfOutstanding: agg?.totalOutstanding ?? 0,
        frfOverdueCount: agg?.overdueCount ?? 0,
        frfPendingCount: agg?.pendingCount ?? 0,
      };
    }),
  );
});

/**
 * Allocates the next sequential membership ID in the form DKMO-XXXX from the
 * shared Postgres sequence (`next_dkmo_number()`), also used by the public
 * membership-application flow. Sequence numbers are never reused, even after
 * a member is deleted.
 */
async function generateMembershipId(): Promise<string> {
  const result = await db.execute(sql`SELECT next_dkmo_number() AS num`);
  return (result.rows[0] as { num: string }).num;
}

router.post("/members", async (req, res): Promise<void> => {
  const parsed = CreateMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const feeStatus = parsed.data.feeStatus ?? "unpaid";
    const actor = (req as AuthedRequest).userId ?? "";
    // Membership IDs are always allocated by the server so they stay
    // sequential and unique; any client-provided value is ignored.
    const membershipId = await generateMembershipId();
    const [created] = await db
      .insert(membersTable)
      .values({
        fullName: parsed.data.fullName,
        mobileNumber: parsed.data.mobileNumber,
        membershipId,
        applicationNumber: parsed.data.applicationNumber ?? "",
        iqamaNumber: parsed.data.iqamaNumber ?? "",
        jamaath: parsed.data.jamaath ?? "",
        city: parsed.data.city ?? "",
        country: parsed.data.country ?? "",
        designation: parsed.data.designation ?? "",
        isExecutiveCommittee: parsed.data.isExecutiveCommittee ?? false,
        isCoreCommittee: parsed.data.isCoreCommittee ?? false,
        membershipFee: String(parsed.data.membershipFee ?? 100),
        feeStatus,
        feePaidAt: feeStatus === "paid" ? new Date() : null,
        feeUpdatedBy: feeStatus === "paid" ? actor : "",
        responsibility: parsed.data.responsibility ?? "not_responsible",
        notes: parsed.data.notes ?? "",
        refMemberName: parsed.data.refMemberName ?? "",
        refMemberId: parsed.data.refMemberId ?? "",
        photoUrl: parsed.data.photoUrl ?? null,
      })
      .returning();
    if (!created) {
      res.status(500).json({ error: "Failed to create member" });
      return;
    }
    logAudit(req, "member_created", "members", { entityId: created.id, entityName: created.fullName, details: `ID: ${created.membershipId}` });
    res.status(201).json(memberToApi(created));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("duplicate") || message.includes("unique")) {
      res.status(400).json({ error: "Membership ID already exists" });
      return;
    }
    throw err;
  }
});

router.get("/members/:id", async (req, res): Promise<void> => {
  const params = GetMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [member] = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.id, params.data.id));

  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  res.json(memberToApi(member));
});

router.patch("/members/:id", async (req, res): Promise<void> => {
  const params = UpdateMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    const actor = (req as unknown as AuthedRequest).userId ?? "";
    const nextFeeStatus = parsed.data.feeStatus ?? existing.feeStatus;
    const feeChanged = nextFeeStatus !== existing.feeStatus;
    const feeAudit = feeChanged
      ? {
          feeStatus: nextFeeStatus,
          feePaidAt: nextFeeStatus === "paid" ? new Date() : null,
          feeUpdatedBy: actor,
        }
      : { feeStatus: nextFeeStatus };

    const [updated] = await db
      .update(membersTable)
      .set({
        fullName: parsed.data.fullName,
        mobileNumber: parsed.data.mobileNumber,
        // Membership IDs are permanent; ignore any client-provided change.
        membershipId: existing.membershipId,
        applicationNumber: parsed.data.applicationNumber ?? "",
        iqamaNumber: parsed.data.iqamaNumber ?? "",
        jamaath: parsed.data.jamaath ?? "",
        city: parsed.data.city ?? "",
        country: parsed.data.country ?? "",
        designation: parsed.data.designation ?? "",
        isExecutiveCommittee:
          parsed.data.isExecutiveCommittee ?? existing.isExecutiveCommittee,
        isCoreCommittee:
          parsed.data.isCoreCommittee ?? existing.isCoreCommittee,
        membershipFee: String(parsed.data.membershipFee ?? existing.membershipFee),
        responsibility: parsed.data.responsibility ?? existing.responsibility,
        notes: parsed.data.notes ?? existing.notes,
        refMemberName: parsed.data.refMemberName ?? "",
        refMemberId: parsed.data.refMemberId ?? "",
        // Photo is only changed when explicitly provided (photo edits normally
        // go through the dedicated /members/:id/photo endpoint).
        ...(parsed.data.photoUrl !== undefined ? { photoUrl: parsed.data.photoUrl } : {}),
        ...feeAudit,
      })
      .where(eq(membersTable.id, params.data.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    logAudit(req, "member_updated", "members", { entityId: updated.id, entityName: updated.fullName, details: `ID: ${updated.membershipId}` });
    res.json(memberToApi(updated));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("duplicate") || message.includes("unique")) {
      res.status(400).json({ error: "Membership ID already exists" });
      return;
    }
    throw err;
  }
});

router.patch("/members/:id/fee-status", async (req, res): Promise<void> => {
  const params = UpdateMemberFeeStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateMemberFeeStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const actor = (req as unknown as AuthedRequest).userId ?? "";
  const feeStatus = parsed.data.feeStatus;
  const [updated] = await db
    .update(membersTable)
    .set({
      feeStatus,
      feePaidAt: feeStatus === "paid" ? new Date() : null,
      feeUpdatedBy: actor,
    })
    .where(eq(membersTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  logAudit(req, "member_fee_status_updated", "members", {
    entityId: updated.id,
    entityName: updated.fullName,
    details: `Fee status: ${feeStatus}`,
  });
  res.json(memberToApi(updated));
});

router.patch("/members/:id/committee-status", async (req, res): Promise<void> => {
  const params = UpdateMemberCommitteeStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateMemberCommitteeStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Executive Committee and Core Committee are fully independent. Only mutate
  // the flag(s) explicitly provided so changing one never affects the other.
  const patch: Partial<{
    isExecutiveCommittee: boolean;
    isCoreCommittee: boolean;
  }> = {};
  if (parsed.data.isExecutiveCommittee !== undefined) {
    patch.isExecutiveCommittee = parsed.data.isExecutiveCommittee;
  }
  if (parsed.data.isCoreCommittee !== undefined) {
    patch.isCoreCommittee = parsed.data.isCoreCommittee;
  }
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "No committee status fields provided" });
    return;
  }

  const [updated] = await db
    .update(membersTable)
    .set(patch)
    .where(eq(membersTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  const changes = Object.entries(patch)
    .map(([k, v]) => {
      const label = k === "isExecutiveCommittee" ? "Executive Committee" : "Core Committee";
      return `${label}: ${v ? "yes" : "no"}`;
    })
    .join(", ");
  logAudit(req, "member_committee_status_updated", "members", {
    entityId: updated.id,
    entityName: updated.fullName,
    details: changes,
  });
  res.json(memberToApi(updated));
});

router.patch("/members/:id/photo", async (req, res): Promise<void> => {
  const params = UpdateMemberPhotoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateMemberPhotoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const photoUrl = parsed.data.photoUrl;
  if (photoUrl !== null && !/^data:image\/(jpeg|jpg|png|webp);base64,/.test(photoUrl)) {
    res.status(400).json({ error: "Photo must be a JPG, PNG, or WEBP image" });
    return;
  }

  const [updated] = await db
    .update(membersTable)
    .set({ photoUrl })
    .where(eq(membersTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  logAudit(req, "member_updated", "members", {
    entityId: updated.id,
    entityName: updated.fullName,
    details: photoUrl ? "Profile photo updated" : "Profile photo removed",
  });
  res.json(memberToApi(updated));
});

router.get("/members/:id/referrals", async (req, res): Promise<void> => {
  const params = GetMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [reference] = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.id, params.data.id));
  if (!reference) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  const referred = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.refMemberId, params.data.id))
    .orderBy(desc(membersTable.createdAt));

  const FRF_RESPONSIBILITY_PER_MEMBER = 50;

  res.json({
    referenceMemberName: reference.fullName,
    totalCount: referred.length,
    frfResponsibilityAmount: referred.length * FRF_RESPONSIBILITY_PER_MEMBER,
    members: referred.map((m) => ({
      id: m.id,
      fullName: m.fullName,
      membershipId: m.membershipId,
      mobileNumber: m.mobileNumber,
      city: m.city,
      photoUrl: m.photoUrl ?? null,
      feeStatus: m.feeStatus,
    })),
  });
});

router.get("/members/:id/frf-summary", async (req, res): Promise<void> => {
  const params = GetMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    const [member] = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.id, params.data.id));
    if (!member) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    const now = new Date();

    // Own contribution ledger with claim context.
    const ledger = await db
      .select({ contribution: frfContributionsTable, claim: frfClaimsTable, payment: paymentsTable })
      .from(frfContributionsTable)
      .innerJoin(frfClaimsTable, eq(frfContributionsTable.claimId, frfClaimsTable.id))
      .leftJoin(paymentsTable, eq(frfContributionsTable.paymentId, paymentsTable.id))
      .where(eq(frfContributionsTable.memberId, params.data.id))
      .orderBy(desc(frfContributionsTable.createdAt));

    let totalClaims = 0;
    let totalDue = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let casesPaid = 0;
    let casesPending = 0;
    let lastContributionAt: Date | null = null;

    const history = ledger.map(({ contribution: c, claim, payment }) => {
      const status = deriveContributionStatus(c, claim.approvedDate, now);
      const amount = Number(c.amount);
      const amountPaid = Number(c.amountPaid);
      if (status !== "cancelled" && status !== "exempt") {
        totalClaims += 1;
        totalDue += amount;
        totalPaid += amountPaid;
        if (amountPaid > 0 && c.paidAt && (!lastContributionAt || c.paidAt > lastContributionAt)) {
          lastContributionAt = c.paidAt;
        }
        if (status === "paid") {
          casesPaid += 1;
        } else {
          casesPending += 1;
          totalOutstanding += Math.max(amount - amountPaid, 0);
        }
      }
      return {
        contributionId: c.id,
        claimId: claim.id,
        title: claim.title ?? "",
        claimantName: claim.claimantName,
        claimType: claim.claimType,
        amount,
        amountPaid,
        balance: Math.max(amount - amountPaid, 0),
        status,
        approvedDate: claim.approvedDate?.toISOString() ?? null,
        paidAt: c.paidAt?.toISOString() ?? null,
        paymentMethod: payment?.paymentMethod ?? null,
        receiptNumber: payment?.receiptNumber ?? null,
        remarks: payment?.notes ?? null,
      };
    });

    // Cases where this member is the beneficiary, with live collection
    // progress derived from the contribution ledger.
    const beneficiaryClaims = await db
      .select()
      .from(frfClaimsTable)
      .where(eq(frfClaimsTable.memberId, params.data.id))
      .orderBy(desc(frfClaimsTable.claimDate));

    const beneficiaryCases = [];
    for (const claim of beneficiaryClaims) {
      const contribs = await db
        .select()
        .from(frfContributionsTable)
        .where(eq(frfContributionsTable.claimId, claim.id));
      let committed = 0;
      let collected = 0;
      for (const c of contribs) {
        const st = deriveContributionStatus(c, claim.approvedDate, now);
        if (st === "cancelled" || st === "exempt") continue;
        committed += Number(c.amount);
        collected += Number(c.amountPaid);
      }
      const target = Number(claim.amountRequested);
      beneficiaryCases.push({
        claimId: claim.id,
        title: claim.title ?? "",
        photoUrl: claim.photoUrl ?? null,
        claimantName: claim.claimantName,
        claimType: claim.claimType,
        status: claim.status,
        caseStatus: claim.status === "disbursed" || claim.status === "rejected" ? "closed" : "open",
        targetAmount: target,
        committedAmount: committed,
        collectedAmount: collected,
        remainingToTarget: Math.max(target - collected, 0),
        collectionProgress: target > 0 ? Math.min(Math.round((collected / target) * 100), 100) : 0,
        claimDate: claim.claimDate?.toISOString() ?? null,
      });
    }

    // Reference collection performance: members this member recruited.
    const referred = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.refMemberId, params.data.id))
      .orderBy(desc(membersTable.createdAt));

    const refAgg = await aggregateMemberFrf(referred.map((r) => r.id));

    let fullyPaidCount = 0;
    let pendingCount = 0;
    let overdueCount = 0;
    let refTotalDue = 0;
    let refTotalPaid = 0;
    let refTotalOutstanding = 0;

    const referenceMembers = referred.map((rm) => {
      const agg = refAgg.get(rm.id);
      const due = agg?.totalDue ?? 0;
      const paid = agg?.totalPaid ?? 0;
      const outstanding = agg?.totalOutstanding ?? 0;
      refTotalDue += due;
      refTotalPaid += paid;
      refTotalOutstanding += outstanding;
      let collectionStatus: "paid" | "pending" | "overdue" | "none";
      if (!agg || agg.totalClaims === 0) {
        collectionStatus = "none";
      } else if (outstanding === 0) {
        collectionStatus = "paid";
        fullyPaidCount++;
      } else if (agg.overdueCount > 0) {
        collectionStatus = "overdue";
        overdueCount++;
      } else {
        collectionStatus = "pending";
        pendingCount++;
      }
      return {
        id: rm.id,
        fullName: rm.fullName,
        membershipId: rm.membershipId,
        mobileNumber: rm.mobileNumber,
        photoUrl: rm.photoUrl ?? null,
        feeStatus: rm.feeStatus,
        frfEligibility: frfEligibility(rm).status,
        frfDue: due,
        frfPaid: paid,
        frfOutstanding: outstanding,
        collectionStatus,
        lastFrfPaymentAt: agg?.lastContributionAt?.toISOString() ?? null,
      };
    });

    res.json({
      eligibility: frfEligibility(member),
      totalClaims,
      totalDue,
      totalPaid,
      totalOutstanding,
      casesPaid,
      casesPending,
      lastContributionAt: lastContributionAt
        ? (lastContributionAt as Date).toISOString()
        : null,
      history,
      beneficiaryCases,
      referenceCollection: {
        totalReferences: referred.length,
        fullyPaidCount,
        pendingCount,
        overdueCount,
        collectionRate:
          refTotalDue > 0 ? Math.round((refTotalPaid / refTotalDue) * 100) : 100,
        totalOutstanding: refTotalOutstanding,
        members: referenceMembers,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get member FRF summary" });
  }
});

router.delete("/members/:id", async (req, res): Promise<void> => {
  const params = DeleteMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(membersTable)
    .where(eq(membersTable.id, params.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  logAudit(req, "member_deleted", "members", { entityId: deleted.id, entityName: deleted.fullName, details: `ID: ${deleted.membershipId}` });
  res.sendStatus(204);
});

export default router;
