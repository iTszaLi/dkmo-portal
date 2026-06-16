import { Router, type IRouter } from "express";
import { eq, ilike, or, desc } from "drizzle-orm";
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

  const rows = search
    ? await db
        .select()
        .from(membersTable)
        .where(
          or(
            ilike(membersTable.fullName, `%${search}%`),
            ilike(membersTable.mobileNumber, `%${search}%`),
            ilike(membersTable.membershipId, `%${search}%`),
            ilike(membersTable.city, `%${search}%`),
            ilike(membersTable.country, `%${search}%`),
          ),
        )
        .orderBy(desc(membersTable.createdAt))
    : await db
        .select()
        .from(membersTable)
        .orderBy(desc(membersTable.createdAt));

  res.json(rows.map(memberToApi));
});

router.post("/members", async (req, res): Promise<void> => {
  const parsed = CreateMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const feeStatus = parsed.data.feeStatus ?? "unpaid";
    const actor = (req as AuthedRequest).userId ?? "";
    const [created] = await db
      .insert(membersTable)
      .values({
        fullName: parsed.data.fullName,
        mobileNumber: parsed.data.mobileNumber,
        membershipId: parsed.data.membershipId,
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
