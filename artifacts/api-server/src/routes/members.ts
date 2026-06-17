import { Router, type IRouter } from "express";
import { eq, ilike, or, and, ne, desc, sql, type SQL } from "drizzle-orm";
import { db, membersTable } from "@workspace/db";
import {
  CreateMemberBody,
  UpdateMemberBody,
  GetMemberParams,
  UpdateMemberParams,
  DeleteMemberParams,
  ListMembersQueryParams,
  UpdateMemberFeeStatusParams,
  UpdateMemberFeeStatusBody,
} from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { memberToApi } from "../lib/serializers";
import { logAudit } from "../lib/audit";

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

  res.json(rows.map(memberToApi));
});

/**
 * Detects an existing member that collides on mobile number or Iqama number.
 * Returns a human-readable message when a duplicate is found, otherwise null.
 * `excludeId` skips the member currently being edited (for updates).
 */
async function findMemberDuplicate(
  mobileNumber: string,
  iqamaNumber: string,
  excludeId?: string,
): Promise<string | null> {
  const mobile = (mobileNumber ?? "").trim();
  const iqama = (iqamaNumber ?? "").trim();
  const conditions: SQL[] = [];
  if (mobile) conditions.push(eq(membersTable.mobileNumber, mobile));
  if (iqama) conditions.push(eq(membersTable.iqamaNumber, iqama));
  if (conditions.length === 0) return null;

  const whereClause = excludeId
    ? and(ne(membersTable.id, excludeId), or(...conditions))
    : or(...conditions);

  const rows = await db.select().from(membersTable).where(whereClause);
  for (const row of rows) {
    if (mobile && row.mobileNumber.trim() === mobile) {
      return `A member with mobile number ${mobile} already exists (${row.fullName}).`;
    }
    if (iqama && row.iqamaNumber.trim() === iqama) {
      return `A member with Iqama number ${iqama} already exists (${row.fullName}).`;
    }
  }
  return null;
}

/**
 * Generates the next sequential membership ID in the form DKMO-YYYY-XXXX.
 * The sequence resets per calendar year and pads to 4 digits.
 */
async function generateMembershipId(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `DKMO-${year}-`;
  const rows = await db
    .select({ membershipId: membersTable.membershipId })
    .from(membersTable)
    .where(ilike(membersTable.membershipId, `${prefix}%`));
  let max = 0;
  for (const row of rows) {
    const suffix = row.membershipId.slice(prefix.length);
    const n = Number.parseInt(suffix, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

router.post("/members", async (req, res): Promise<void> => {
  const parsed = CreateMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const duplicate = await findMemberDuplicate(
    parsed.data.mobileNumber,
    parsed.data.iqamaNumber ?? "",
  );
  if (duplicate) {
    res.status(409).json({ error: duplicate });
    return;
  }

  try {
    const feeStatus = parsed.data.feeStatus ?? "unpaid";
    const actor = (req as AuthedRequest).userId ?? "";
    const membershipId =
      parsed.data.membershipId && parsed.data.membershipId.trim()
        ? parsed.data.membershipId.trim()
        : await generateMembershipId();
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
        membershipFee: String(parsed.data.membershipFee ?? 100),
        feeStatus,
        feePaidAt: feeStatus === "paid" ? new Date() : null,
        feeUpdatedBy: feeStatus === "paid" ? actor : "",
        refMemberName: parsed.data.refMemberName ?? "",
        refMemberId: parsed.data.refMemberId ?? "",
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

    const duplicate = await findMemberDuplicate(
      parsed.data.mobileNumber,
      parsed.data.iqamaNumber ?? "",
      params.data.id,
    );
    if (duplicate) {
      res.status(409).json({ error: duplicate });
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
        membershipId: parsed.data.membershipId,
        applicationNumber: parsed.data.applicationNumber ?? "",
        iqamaNumber: parsed.data.iqamaNumber ?? "",
        jamaath: parsed.data.jamaath ?? "",
        city: parsed.data.city ?? "",
        country: parsed.data.country ?? "",
        designation: parsed.data.designation ?? "",
        membershipFee: String(parsed.data.membershipFee ?? existing.membershipFee),
        refMemberName: parsed.data.refMemberName ?? "",
        refMemberId: parsed.data.refMemberId ?? "",
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
      feeStatus: m.feeStatus,
    })),
  });
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
