import { Router, type IRouter } from "express";
import { eq, desc, ilike, or, count, and, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  documentsTable,
  documentVersionsTable,
  documentAttachmentsTable,
  documentActivityTable,
} from "@workspace/db";
import { requireAuth, requireRole, type AuthedRequest } from "../middlewares/requireAuth";
import { getUserById } from "../lib/users";
import { streamStoredFile, isApiFileUrl } from "../lib/documentFiles";
import { logAudit } from "../lib/audit";

/** FRF case documents are managed by admins only; other document mutations are admin/finance. */
function canMutateDoc(role: string | undefined, linkedEntityType: string | null | undefined): boolean {
  if (linkedEntityType === "frf_claim") return role === "admin";
  return role === "admin" || role === "finance";
}

export const DOCUMENT_VISIBILITIES = ["public", "members", "committee", "admin"] as const;
export type DocumentVisibility = (typeof DOCUMENT_VISIBILITIES)[number];

/**
 * Visibility levels a role may READ.
 * - admin: everything
 * - committee roles (finance, event): public + members + committee
 * - viewer (regular member account): public + members
 */
export function visibleLevelsForRole(role: string | undefined): DocumentVisibility[] {
  if (role === "admin") return ["public", "members", "committee", "admin"];
  if (role === "finance" || role === "event") return ["public", "members", "committee"];
  return ["public", "members"];
}

function actorName(req: unknown): string {
  const authed = req as AuthedRequest;
  return getUserById(authed.userId ?? "")?.displayName ?? authed.userId ?? "";
}

async function logActivity(documentId: string, action: string, userName: string, details = "") {
  await db.insert(documentActivityTable).values({ documentId, action, userName, details });
}

const router: IRouter = Router();
router.use(requireAuth);

const DocumentInput = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  category: z.string().default("general"),
  tags: z.string().default(""),
  fileUrl: z.string().default(""),
  fileName: z.string().default(""),
  fileSize: z.number().int().default(0),
  mimeType: z.string().default(""),
  expiryDate: z.string().optional().nullable(),
  status: z.enum(["active", "expired", "archived"]).default("active"),
  linkedEntityId: z.string().default(""),
  linkedEntityType: z.string().default(""),
  notes: z.string().default(""),
  visibility: z.enum(DOCUMENT_VISIBILITIES).default("members"),
});

const AddVersionInput = z.object({
  fileUrl: z.string().default(""),
  fileName: z.string().default(""),
  fileSize: z.number().int().default(0),
  notes: z.string().default(""),
});

const AttachmentInput = z.object({
  fileUrl: z.string().min(1),
  fileName: z.string().min(1),
  fileSize: z.number().int().default(0),
  mimeType: z.string().default(""),
});

function docToApi(row: typeof documentsTable.$inferSelect, attachmentsCount = 0) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    tags: row.tags,
    // Never expose raw storage URLs — files are served through
    // permission-checked endpoints only.
    fileUrl: row.fileUrl ? `/api/documents/${row.id}/file` : "",
    fileName: row.fileName,
    fileSize: row.fileSize,
    mimeType: row.mimeType,
    uploadedBy: row.uploadedBy,
    expiryDate: row.expiryDate ?? null,
    status: row.status,
    version: row.version,
    linkedEntityId: row.linkedEntityId,
    linkedEntityType: row.linkedEntityType,
    notes: row.notes,
    visibility: row.visibility,
    downloadCount: row.downloadCount,
    attachmentsCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function versionToApi(row: typeof documentVersionsTable.$inferSelect) {
  return {
    id: row.id,
    documentId: row.documentId,
    version: row.version,
    fileUrl: row.fileUrl ? `/api/documents/${row.documentId}/versions/${row.id}/file` : "",
    fileName: row.fileName,
    fileSize: row.fileSize,
    uploadedBy: row.uploadedBy,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function attachmentToApi(row: typeof documentAttachmentsTable.$inferSelect) {
  return {
    id: row.id,
    documentId: row.documentId,
    fileUrl: row.fileUrl ? `/api/documents/${row.documentId}/attachments/${row.id}/file` : "",
    fileName: row.fileName,
    fileSize: row.fileSize,
    mimeType: row.mimeType,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/documents", async (req, res): Promise<void> => {
  try {
    const {
      search,
      category,
      status,
      visibility,
      linkedEntityType,
      linkedEntityId,
      page = "1",
      pageSize = "25",
    } = req.query as Record<string, string>;

    const p = Math.max(1, parseInt(page, 10));
    const ps = Math.min(100, Math.max(1, parseInt(pageSize, 10)));

    const allowed = visibleLevelsForRole((req as unknown as AuthedRequest).userRole);
    const conditions = [inArray(documentsTable.visibility, allowed)];

    if (linkedEntityType) {
      conditions.push(eq(documentsTable.linkedEntityType, linkedEntityType));
    }

    if (linkedEntityId) {
      conditions.push(eq(documentsTable.linkedEntityId, linkedEntityId));
    }

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(documentsTable.title, pattern),
          ilike(documentsTable.description, pattern),
          ilike(documentsTable.tags, pattern),
          ilike(documentsTable.fileName, pattern),
        )!,
      );
    }

    if (category && category !== "all") {
      conditions.push(eq(documentsTable.category, category));
    }

    if (status && status !== "all") {
      conditions.push(eq(documentsTable.status, status));
    }

    if (visibility && visibility !== "all") {
      conditions.push(eq(documentsTable.visibility, visibility));
    }

    const where = and(...conditions);

    const [rows, countRows, attCounts] = await Promise.all([
      db
        .select()
        .from(documentsTable)
        .where(where)
        .orderBy(desc(documentsTable.createdAt))
        .limit(ps)
        .offset((p - 1) * ps),
      db.select({ count: count() }).from(documentsTable).where(where),
      db
        .select({ documentId: documentAttachmentsTable.documentId, count: count() })
        .from(documentAttachmentsTable)
        .groupBy(documentAttachmentsTable.documentId),
    ]);

    const attMap = new Map(attCounts.map((r) => [r.documentId, Number(r.count)]));
    res.json({
      items: rows.map((r) => docToApi(r, attMap.get(r.id) ?? 0)),
      total: Number(countRows[0]?.count ?? 0),
    });
  } catch (err) {
    req.log.error({ err }, "listDocuments failed");
    res.status(500).json({ error: "Failed to list documents" });
  }
});

/** Loads a document and enforces read visibility for the current user. */
async function loadVisibleDoc(req: unknown, id: string) {
  const [row] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
  if (!row) return { row: null, allowed: false as const };
  const allowed = visibleLevelsForRole((req as AuthedRequest).userRole).includes(
    row.visibility as DocumentVisibility,
  );
  return { row, allowed };
}

router.get("/documents/:id", async (req, res): Promise<void> => {
  try {
    const { row, allowed } = await loadVisibleDoc(req, String(req.params.id));
    if (!row) { res.status(404).json({ error: "Document not found" }); return; }
    if (!allowed) { res.status(403).json({ error: "You are not authorised to view this document" }); return; }
    const [att] = await db
      .select({ count: count() })
      .from(documentAttachmentsTable)
      .where(eq(documentAttachmentsTable.documentId, row.id));
    res.json(docToApi(row, Number(att?.count ?? 0)));
  } catch (err) {
    req.log.error({ err }, "getDocument failed");
    res.status(500).json({ error: "Failed to get document" });
  }
});

// ── Permission-checked file streaming ────────────────────────────────────────

router.get("/documents/:id/file", async (req, res): Promise<void> => {
  try {
    const { row, allowed } = await loadVisibleDoc(req, String(req.params.id));
    if (!row || !row.fileUrl) { res.status(404).json({ error: "File not found" }); return; }
    if (!allowed) { res.status(403).json({ error: "You are not authorised to view this document" }); return; }
    await streamStoredFile(res, row.fileUrl, row.fileName);
  } catch (err) {
    req.log.error({ err }, "streamDocumentFile failed");
    if (!res.headersSent) res.status(500).json({ error: "Failed to serve file" });
  }
});

router.get("/documents/:id/attachments/:attachmentId/file", async (req, res): Promise<void> => {
  try {
    const { row, allowed } = await loadVisibleDoc(req, String(req.params.id));
    if (!row) { res.status(404).json({ error: "File not found" }); return; }
    if (!allowed) { res.status(403).json({ error: "You are not authorised to view this document" }); return; }
    const [att] = await db
      .select()
      .from(documentAttachmentsTable)
      .where(
        and(
          eq(documentAttachmentsTable.id, String(req.params.attachmentId)),
          eq(documentAttachmentsTable.documentId, row.id),
        ),
      );
    if (!att || !att.fileUrl) { res.status(404).json({ error: "File not found" }); return; }
    await streamStoredFile(res, att.fileUrl, att.fileName);
  } catch (err) {
    req.log.error({ err }, "streamAttachmentFile failed");
    if (!res.headersSent) res.status(500).json({ error: "Failed to serve file" });
  }
});

router.get("/documents/:id/versions/:versionId/file", async (req, res): Promise<void> => {
  try {
    const { row, allowed } = await loadVisibleDoc(req, String(req.params.id));
    if (!row) { res.status(404).json({ error: "File not found" }); return; }
    if (!allowed) { res.status(403).json({ error: "You are not authorised to view this document" }); return; }
    const [ver] = await db
      .select()
      .from(documentVersionsTable)
      .where(
        and(
          eq(documentVersionsTable.id, String(req.params.versionId)),
          eq(documentVersionsTable.documentId, row.id),
        ),
      );
    if (!ver || !ver.fileUrl) { res.status(404).json({ error: "File not found" }); return; }
    await streamStoredFile(res, ver.fileUrl, ver.fileName);
  } catch (err) {
    req.log.error({ err }, "streamVersionFile failed");
    if (!res.headersSent) res.status(500).json({ error: "Failed to serve file" });
  }
});

router.post("/documents", requireRole("admin", "finance"), async (req, res): Promise<void> => {
  try {
    const parsed = DocumentInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }
    const authed = req as unknown as AuthedRequest;
    if (!canMutateDoc(authed.userRole, parsed.data.linkedEntityType)) {
      res.status(403).json({ error: "Only admins can manage FRF case documents" });
      return;
    }
    // Only admins may publish documents to the public portal or restrict to admin-only.
    if ((parsed.data.visibility === "public" || parsed.data.visibility === "admin") && authed.userRole !== "admin") {
      res.status(403).json({ error: "Only admins can set Public or Admin Only visibility" });
      return;
    }
    const name = actorName(req);
    // Clients echo back our permission-checked API URLs; never store those.
    if (isApiFileUrl(parsed.data.fileUrl)) delete (parsed.data as { fileUrl?: string }).fileUrl;
    const [row] = await db
      .insert(documentsTable)
      .values({ ...parsed.data, uploadedBy: name })
      .returning();
    await logActivity(row!.id, "uploaded", name, row!.fileName || row!.title);
    await logAudit(req, "document_created", "documents", {
      entityId: row!.id, entityName: row!.title, details: `Member link: ${row!.linkedEntityId}`,
    });
    res.status(201).json(docToApi(row!));
  } catch (err) {
    req.log.error({ err }, "createDocument failed");
    res.status(500).json({ error: "Failed to create document" });
  }
});

router.put("/documents/:id", requireRole("admin", "finance"), async (req, res): Promise<void> => {
  try {
    const parsed = DocumentInput.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }
    const [existing] = await db
      .select({ linkedEntityType: documentsTable.linkedEntityType, visibility: documentsTable.visibility })
      .from(documentsTable)
      .where(eq(documentsTable.id, String(req.params.id)));
    if (!existing) { res.status(404).json({ error: "Document not found" }); return; }
    const role = (req as unknown as AuthedRequest).userRole;
    if (!canMutateDoc(role, existing.linkedEntityType) || !canMutateDoc(role, parsed.data.linkedEntityType ?? existing.linkedEntityType)) {
      res.status(403).json({ error: "Only admins can manage FRF case documents" });
      return;
    }
    if (
      parsed.data.visibility !== undefined &&
      parsed.data.visibility !== existing.visibility &&
      (parsed.data.visibility === "public" || parsed.data.visibility === "admin") &&
      role !== "admin"
    ) {
      res.status(403).json({ error: "Only admins can set Public or Admin Only visibility" });
      return;
    }
    // Clients echo back our permission-checked API URLs; keep the stored raw URL.
    if (isApiFileUrl(parsed.data.fileUrl)) delete (parsed.data as { fileUrl?: string }).fileUrl;
    const [row] = await db
      .update(documentsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(documentsTable.id, String(req.params.id)))
      .returning();
    if (!row) { res.status(404).json({ error: "Document not found" }); return; }
    await logActivity(row.id, "edited", actorName(req));
    await logAudit(req, "document_updated", "documents", {
      entityId: row.id, entityName: row.title, details: "Document metadata updated",
    });
    res.json(docToApi(row));
  } catch (err) {
    req.log.error({ err }, "updateDocument failed");
    res.status(500).json({ error: "Failed to update document" });
  }
});

router.delete("/documents/:id", requireRole("admin", "finance"), async (req, res): Promise<void> => {
  try {
    const [existing] = await db
      .select({ linkedEntityType: documentsTable.linkedEntityType })
      .from(documentsTable)
      .where(eq(documentsTable.id, String(req.params.id)));
    if (existing && !canMutateDoc((req as unknown as AuthedRequest).userRole, existing.linkedEntityType)) {
      res.status(403).json({ error: "Only admins can manage FRF case documents" });
      return;
    }
    await db.delete(documentsTable).where(eq(documentsTable.id, String(req.params.id)));
    await logAudit(req, "document_deleted", "documents", {
      entityId: String(req.params.id), details: "Document deleted",
    });
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "deleteDocument failed");
    res.status(500).json({ error: "Failed to delete document" });
  }
});

// ── Attachments ──────────────────────────────────────────────────────────────

router.get("/documents/:id/attachments", async (req, res): Promise<void> => {
  try {
    const { row, allowed } = await loadVisibleDoc(req, String(req.params.id));
    if (!row) { res.status(404).json({ error: "Document not found" }); return; }
    if (!allowed) { res.status(403).json({ error: "You are not authorised to view this document" }); return; }
    const rows = await db
      .select()
      .from(documentAttachmentsTable)
      .where(eq(documentAttachmentsTable.documentId, row.id))
      .orderBy(desc(documentAttachmentsTable.createdAt));
    res.json(rows.map(attachmentToApi));
  } catch (err) {
    req.log.error({ err }, "listAttachments failed");
    res.status(500).json({ error: "Failed to list attachments" });
  }
});

router.post("/documents/:id/attachments", requireRole("admin", "finance"), async (req, res): Promise<void> => {
  try {
    const parsed = AttachmentInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, String(req.params.id)));
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    if (!canMutateDoc((req as unknown as AuthedRequest).userRole, doc.linkedEntityType)) {
      res.status(403).json({ error: "Only admins can manage FRF case documents" });
      return;
    }
    const name = actorName(req);
    const [row] = await db
      .insert(documentAttachmentsTable)
      .values({ ...parsed.data, documentId: doc.id, uploadedBy: name })
      .returning();
    await logActivity(doc.id, "attachment_added", name, parsed.data.fileName);
    res.status(201).json(attachmentToApi(row!));
  } catch (err) {
    req.log.error({ err }, "addAttachment failed");
    res.status(500).json({ error: "Failed to add attachment" });
  }
});

router.delete("/documents/:id/attachments/:attachmentId", requireRole("admin", "finance"), async (req, res): Promise<void> => {
  try {
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, String(req.params.id)));
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    if (!canMutateDoc((req as unknown as AuthedRequest).userRole, doc.linkedEntityType)) {
      res.status(403).json({ error: "Only admins can manage FRF case documents" });
      return;
    }
    const [removed] = await db
      .delete(documentAttachmentsTable)
      .where(
        and(
          eq(documentAttachmentsTable.id, String(req.params.attachmentId)),
          eq(documentAttachmentsTable.documentId, doc.id),
        ),
      )
      .returning();
    if (removed) await logActivity(doc.id, "attachment_removed", actorName(req), removed.fileName);
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "deleteAttachment failed");
    res.status(500).json({ error: "Failed to delete attachment" });
  }
});

// ── Tracking & activity log ──────────────────────────────────────────────────

const TrackInput = z.object({
  action: z.enum(["viewed", "downloaded"]),
  fileName: z.string().default(""),
});

router.post("/documents/:id/track", async (req, res): Promise<void> => {
  try {
    const parsed = TrackInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
    const { row, allowed } = await loadVisibleDoc(req, String(req.params.id));
    if (!row) { res.status(404).json({ error: "Document not found" }); return; }
    if (!allowed) { res.status(403).json({ error: "You are not authorised to view this document" }); return; }
    await logActivity(row.id, parsed.data.action, actorName(req), parsed.data.fileName);
    if (parsed.data.action === "downloaded") {
      await db
        .update(documentsTable)
        .set({ downloadCount: sql`${documentsTable.downloadCount} + 1` })
        .where(eq(documentsTable.id, row.id));
    }
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "trackDocument failed");
    res.status(500).json({ error: "Failed to track" });
  }
});

router.get("/documents/:id/activity", async (req, res): Promise<void> => {
  try {
    const { row, allowed } = await loadVisibleDoc(req, String(req.params.id));
    if (!row) { res.status(404).json({ error: "Document not found" }); return; }
    if (!allowed) { res.status(403).json({ error: "You are not authorised to view this document" }); return; }
    const rows = await db
      .select()
      .from(documentActivityTable)
      .where(eq(documentActivityTable.documentId, row.id))
      .orderBy(desc(documentActivityTable.createdAt))
      .limit(200);
    res.json(
      rows.map((r) => ({
        id: r.id,
        documentId: r.documentId,
        action: r.action,
        userName: r.userName,
        details: r.details,
        createdAt: r.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "listActivity failed");
    res.status(500).json({ error: "Failed to list activity" });
  }
});

// ── Versions ─────────────────────────────────────────────────────────────────

router.get("/documents/:id/versions", async (req, res): Promise<void> => {
  try {
    const { row, allowed } = await loadVisibleDoc(req, String(req.params.id));
    if (!row) { res.status(404).json({ error: "Document not found" }); return; }
    if (!allowed) { res.status(403).json({ error: "You are not authorised to view this document" }); return; }
    const rows = await db
      .select()
      .from(documentVersionsTable)
      .where(eq(documentVersionsTable.documentId, row.id))
      .orderBy(desc(documentVersionsTable.version));
    res.json(rows.map(versionToApi));
  } catch (err) {
    req.log.error({ err }, "listDocumentVersions failed");
    res.status(500).json({ error: "Failed to list versions" });
  }
});

router.post("/documents/:id/versions", requireRole("admin", "finance"), async (req, res): Promise<void> => {
  try {
    const parsed = AddVersionInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }
    const name = actorName(req);

    const [doc] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, String(req.params.id)));
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    if (!canMutateDoc((req as unknown as AuthedRequest).userRole, doc.linkedEntityType)) {
      res.status(403).json({ error: "Only admins can manage FRF case documents" });
      return;
    }

    const newVersion = doc.version + 1;

    await db.insert(documentVersionsTable).values({
      documentId: String(req.params.id),
      version: doc.version,
      fileUrl: doc.fileUrl,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      uploadedBy: doc.uploadedBy,
      notes: "Previous version archived",
    });

    const [updated] = await db
      .update(documentsTable)
      .set({
        fileUrl: parsed.data.fileUrl || doc.fileUrl,
        fileName: parsed.data.fileName || doc.fileName,
        fileSize: parsed.data.fileSize ?? doc.fileSize,
        version: newVersion,
        uploadedBy: name,
        notes: parsed.data.notes || doc.notes,
        updatedAt: new Date(),
      })
      .where(eq(documentsTable.id, String(req.params.id)))
      .returning();

    await logActivity(doc.id, "version_added", name, `v${newVersion} — ${parsed.data.fileName || doc.fileName}`);

    const versionRow = await db
      .select()
      .from(documentVersionsTable)
      .where(eq(documentVersionsTable.documentId, String(req.params.id)))
      .orderBy(desc(documentVersionsTable.version))
      .limit(1);

    res.status(201).json({
      document: docToApi(updated!),
      version: versionRow[0] ? versionToApi(versionRow[0]) : null,
    });
  } catch (err) {
    req.log.error({ err }, "addDocumentVersion failed");
    res.status(500).json({ error: "Failed to add version" });
  }
});

export default router;
