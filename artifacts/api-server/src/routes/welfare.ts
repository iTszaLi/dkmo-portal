import { Router, type IRouter } from "express";
import { eq, desc, and, or, ilike } from "drizzle-orm";
import { db, welfareRequestsTable, type WelfareDocument } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { getUserById } from "../lib/users";
import { z } from "zod";

const router: IRouter = Router();
router.use("/welfare", requireAuth);

const SERVICE_TYPES = [
  "medical_aid",
  "general_relief",
  "emergency_response",
  "air_ticket",
  "india_rep",
] as const;

const STATUSES = ["submitted", "under_review", "approved", "rejected", "completed"] as const;

const PREFIX: Record<(typeof SERVICE_TYPES)[number], string> = {
  medical_aid: "MED",
  general_relief: "GRF",
  emergency_response: "EMR",
  air_ticket: "AIR",
  india_rep: "IRS",
};

const safeUrl = z
  .string()
  .refine((u) => /^\//.test(u) || /^https?:\/\//i.test(u), {
    message: "Document URL must be a relative path or an http(s) URL",
  });

const DocumentSchema = z.object({
  name: z.string(),
  url: safeUrl,
  uploadedAt: z.string().optional(),
});

const WelfareInput = z.object({
  serviceType: z.enum(SERVICE_TYPES),
  memberId: z.string().uuid().nullable().optional(),
  applicantName: z.string().min(1),
  membershipId: z.string().optional().default(""),
  contactNumber: z.string().optional().default(""),
  status: z.enum(STATUSES).default("submitted"),
  amountRequested: z.number().min(0).default(0),
  amountApproved: z.number().min(0).default(0),
  description: z.string().optional().default(""),
  details: z.record(z.string(), z.unknown()).optional().default({}),
  supportingDocuments: z.array(DocumentSchema).optional().default([]),
  assignedTo: z.string().optional().default(""),
  approvalNotes: z.string().optional().default(""),
});

function welfareToApi(row: typeof welfareRequestsTable.$inferSelect) {
  return {
    id: row.id,
    requestNumber: row.requestNumber,
    serviceType: row.serviceType,
    memberId: row.memberId ?? null,
    applicantName: row.applicantName,
    membershipId: row.membershipId ?? "",
    contactNumber: row.contactNumber ?? "",
    status: row.status,
    amountRequested: Number(row.amountRequested),
    amountApproved: Number(row.amountApproved),
    description: row.description ?? "",
    details: (row.details ?? {}) as Record<string, unknown>,
    supportingDocuments: (row.supportingDocuments ?? []) as WelfareDocument[],
    assignedTo: row.assignedTo ?? "",
    approvalNotes: row.approvalNotes ?? "",
    submittedAt: row.submittedAt?.toISOString() ?? null,
    underReviewAt: row.underReviewAt?.toISOString() ?? null,
    underReviewBy: row.underReviewBy ?? "",
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvedBy: row.approvedBy ?? "",
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
    rejectedBy: row.rejectedBy ?? "",
    completedAt: row.completedAt?.toISOString() ?? null,
    completedBy: row.completedBy ?? "",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function nextRequestNumber(serviceType: (typeof SERVICE_TYPES)[number]): Promise<string> {
  const prefix = PREFIX[serviceType];
  const rows = await db
    .select({ rn: welfareRequestsTable.requestNumber })
    .from(welfareRequestsTable)
    .where(eq(welfareRequestsTable.serviceType, serviceType));
  let max = 0;
  for (const r of rows) {
    const m = r.rn?.match(/(\d+)$/);
    if (m && m[1]) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: string }).code === "23505";
}

/** Populate the stage timestamp + actor fields that match a given status. */
function stageFieldsForStatus(status: (typeof STATUSES)[number], actor: string, now: Date): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (status === "under_review") {
    out.underReviewBy = actor;
    out.underReviewAt = now;
  }
  if (status === "approved") {
    out.approvedBy = actor;
    out.approvedAt = now;
  }
  if (status === "rejected") {
    out.rejectedBy = actor;
    out.rejectedAt = now;
  }
  if (status === "completed") {
    out.completedBy = actor;
    out.completedAt = now;
  }
  return out;
}

router.get("/welfare/requests", async (req, res): Promise<void> => {
  try {
    const { serviceType, status, search } = req.query as Record<string, string>;
    const conditions = [];
    if (serviceType && serviceType !== "all") conditions.push(eq(welfareRequestsTable.serviceType, serviceType));
    if (status && status !== "all") conditions.push(eq(welfareRequestsTable.status, status));
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(welfareRequestsTable.applicantName, q),
          ilike(welfareRequestsTable.membershipId, q),
          ilike(welfareRequestsTable.requestNumber, q),
          ilike(welfareRequestsTable.description, q),
        ),
      );
    }

    let query = db.select().from(welfareRequestsTable).$dynamic();
    if (conditions.length > 0) query = query.where(and(...conditions));
    const rows = await query.orderBy(desc(welfareRequestsTable.submittedAt));
    res.json(rows.map(welfareToApi));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list welfare requests" });
  }
});

router.get("/welfare/stats", async (req, res): Promise<void> => {
  try {
    const { serviceType } = req.query as Record<string, string>;
    let query = db.select().from(welfareRequestsTable).$dynamic();
    if (serviceType && serviceType !== "all") {
      query = query.where(eq(welfareRequestsTable.serviceType, serviceType));
    }
    const rows = await query;

    const byStatus = (s: string) => rows.filter((r) => r.status === s).length;
    const totalRequested = rows.reduce((a, r) => a + Number(r.amountRequested), 0);
    const totalApproved = rows
      .filter((r) => r.status === "approved" || r.status === "completed")
      .reduce((a, r) => a + Number(r.amountApproved), 0);

    const byType = SERVICE_TYPES.map((t) => ({
      type: t,
      count: rows.filter((r) => r.serviceType === t).length,
      totalApproved: rows
        .filter((r) => r.serviceType === t && (r.status === "approved" || r.status === "completed"))
        .reduce((a, r) => a + Number(r.amountApproved), 0),
    }));

    res.json({
      total: rows.length,
      submittedCount: byStatus("submitted"),
      underReviewCount: byStatus("under_review"),
      approvedCount: byStatus("approved"),
      rejectedCount: byStatus("rejected"),
      completedCount: byStatus("completed"),
      totalRequested,
      totalApproved,
      byType,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get welfare stats" });
  }
});

router.post("/welfare/requests", requireRole("admin", "finance"), async (req, res): Promise<void> => {
  const parsed = WelfareInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const data = parsed.data;
    const actor = getUserById((req as any).userId ?? "")?.displayName ?? (req as any).userId ?? "";
    const stageFields = stageFieldsForStatus(data.status, actor, new Date());

    // Allocate request number atomically: retry on unique-key collision under concurrency.
    let created: typeof welfareRequestsTable.$inferSelect | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      const requestNumber = await nextRequestNumber(data.serviceType);
      try {
        [created] = await db
          .insert(welfareRequestsTable)
          .values({
            requestNumber,
            serviceType: data.serviceType,
            memberId: data.memberId ?? null,
            applicantName: data.applicantName,
            membershipId: data.membershipId,
            contactNumber: data.contactNumber,
            status: data.status,
            amountRequested: String(data.amountRequested),
            amountApproved: String(data.amountApproved),
            description: data.description,
            details: data.details,
            supportingDocuments: data.supportingDocuments,
            assignedTo: data.assignedTo,
            approvalNotes: data.approvalNotes,
            ...stageFields,
          })
          .returning();
        break;
      } catch (e) {
        if (isUniqueViolation(e) && attempt < 4) continue;
        throw e;
      }
    }
    if (!created) {
      res.status(500).json({ error: "Failed to allocate request number" });
      return;
    }
    logAudit(req, "welfare_request_created", "welfare", {
      entityId: created.id,
      entityName: data.applicantName,
      details: `${data.serviceType} · ${created.requestNumber} · ${data.status}`,
    });
    res.status(201).json(welfareToApi(created));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create welfare request" });
  }
});

router.get("/welfare/requests/:id", async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  try {
    const [row] = await db.select().from(welfareRequestsTable).where(eq(welfareRequestsTable.id, id));
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(welfareToApi(row));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get welfare request" });
  }
});

router.put("/welfare/requests/:id", requireRole("admin", "finance"), async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  const parsed = WelfareInput.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const data = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (data.serviceType !== undefined) updateData.serviceType = data.serviceType;
    if (data.memberId !== undefined) updateData.memberId = data.memberId ?? null;
    if (data.applicantName !== undefined) updateData.applicantName = data.applicantName;
    if (data.membershipId !== undefined) updateData.membershipId = data.membershipId;
    if (data.contactNumber !== undefined) updateData.contactNumber = data.contactNumber;
    if (data.amountRequested !== undefined) updateData.amountRequested = String(data.amountRequested);
    if (data.amountApproved !== undefined) updateData.amountApproved = String(data.amountApproved);
    if (data.description !== undefined) updateData.description = data.description;
    if (data.details !== undefined) updateData.details = data.details;
    if (data.supportingDocuments !== undefined) updateData.supportingDocuments = data.supportingDocuments;
    if (data.assignedTo !== undefined) updateData.assignedTo = data.assignedTo;
    if (data.approvalNotes !== undefined) updateData.approvalNotes = data.approvalNotes;
    if (data.status !== undefined) updateData.status = data.status;

    if (data.status !== undefined) {
      const actor = getUserById((req as any).userId ?? "")?.displayName ?? (req as any).userId ?? "";
      Object.assign(updateData, stageFieldsForStatus(data.status, actor, new Date()));
    }

    const [updated] = await db
      .update(welfareRequestsTable)
      .set(updateData)
      .where(eq(welfareRequestsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const action =
      data.status === "approved"
        ? "welfare_request_approved"
        : data.status === "rejected"
          ? "welfare_request_rejected"
          : data.status === "completed"
            ? "welfare_request_completed"
            : "welfare_request_updated";
    logAudit(req, action, "welfare", {
      entityId: updated.id,
      entityName: updated.applicantName,
      details: `${updated.serviceType} · ${updated.requestNumber} · ${updated.status}`,
    });
    res.json(welfareToApi(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update welfare request" });
  }
});

router.delete("/welfare/requests/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  try {
    const [deleted] = await db.delete(welfareRequestsTable).where(eq(welfareRequestsTable.id, id)).returning();
    if (!deleted) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    logAudit(req, "welfare_request_deleted", "welfare", {
      entityId: deleted.id,
      entityName: deleted.applicantName,
      details: `${deleted.serviceType} · ${deleted.requestNumber}`,
    });
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete welfare request" });
  }
});

export default router;
