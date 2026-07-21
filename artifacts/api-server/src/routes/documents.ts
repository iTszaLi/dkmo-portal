import { Router, type IRouter } from "express";
import { eq, desc, ilike, or, count, and } from "drizzle-orm";
import { z } from "zod";
import { db, documentsTable, documentVersionsTable } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";

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
});

const AddVersionInput = z.object({
  fileUrl: z.string().default(""),
  fileName: z.string().default(""),
  fileSize: z.number().int().default(0),
  notes: z.string().default(""),
});

function docToApi(row: typeof documentsTable.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    tags: row.tags,
    fileUrl: row.fileUrl,
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function versionToApi(row: typeof documentVersionsTable.$inferSelect) {
  return {
    id: row.id,
    documentId: row.documentId,
    version: row.version,
    fileUrl: row.fileUrl,
    fileName: row.fileName,
    fileSize: row.fileSize,
    uploadedBy: row.uploadedBy,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/documents", async (req, res): Promise<void> => {
  try {
    const {
      search,
      category,
      status,
      linkedEntityType,
      linkedEntityId,
      page = "1",
      pageSize = "25",
    } = req.query as Record<string, string>;

    const p = Math.max(1, parseInt(page, 10));
    const ps = Math.min(100, Math.max(1, parseInt(pageSize, 10)));

    const conditions = [];

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
        ),
      );
    }

    if (category && category !== "all") {
      conditions.push(eq(documentsTable.category, category));
    }

    if (status && status !== "all") {
      conditions.push(eq(documentsTable.status, status));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countRows] = await Promise.all([
      db
        .select()
        .from(documentsTable)
        .where(where)
        .orderBy(desc(documentsTable.createdAt))
        .limit(ps)
        .offset((p - 1) * ps),
      db
        .select({ count: count() })
        .from(documentsTable)
        .where(where),
    ]);

    res.json({ items: rows.map(docToApi), total: Number(countRows[0]?.count ?? 0) });
  } catch (err) {
    req.log.error({ err }, "listDocuments failed");
    res.status(500).json({ error: "Failed to list documents" });
  }
});

router.get("/documents/:id", async (req, res): Promise<void> => {
  try {
    const [row] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, req.params.id));
    if (!row) { res.status(404).json({ error: "Document not found" }); return; }
    res.json(docToApi(row));
  } catch (err) {
    req.log.error({ err }, "getDocument failed");
    res.status(500).json({ error: "Failed to get document" });
  }
});

router.post("/documents", async (req, res): Promise<void> => {
  try {
    const parsed = DocumentInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }
    const userId = (req as unknown as AuthedRequest).userId ?? "";
    const [row] = await db
      .insert(documentsTable)
      .values({ ...parsed.data, uploadedBy: userId })
      .returning();
    res.status(201).json(docToApi(row!));
  } catch (err) {
    req.log.error({ err }, "createDocument failed");
    res.status(500).json({ error: "Failed to create document" });
  }
});

router.put("/documents/:id", async (req, res): Promise<void> => {
  try {
    const parsed = DocumentInput.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }
    const [row] = await db
      .update(documentsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(documentsTable.id, req.params.id))
      .returning();
    if (!row) { res.status(404).json({ error: "Document not found" }); return; }
    res.json(docToApi(row));
  } catch (err) {
    req.log.error({ err }, "updateDocument failed");
    res.status(500).json({ error: "Failed to update document" });
  }
});

router.delete("/documents/:id", async (req, res): Promise<void> => {
  try {
    await db.delete(documentsTable).where(eq(documentsTable.id, req.params.id));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "deleteDocument failed");
    res.status(500).json({ error: "Failed to delete document" });
  }
});

router.get("/documents/:id/versions", async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(documentVersionsTable)
      .where(eq(documentVersionsTable.documentId, req.params.id))
      .orderBy(desc(documentVersionsTable.version));
    res.json(rows.map(versionToApi));
  } catch (err) {
    req.log.error({ err }, "listDocumentVersions failed");
    res.status(500).json({ error: "Failed to list versions" });
  }
});

router.post("/documents/:id/versions", async (req, res): Promise<void> => {
  try {
    const parsed = AddVersionInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }
    const userId = (req as unknown as AuthedRequest).userId ?? "";

    const [doc] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, req.params.id));
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    const newVersion = doc.version + 1;

    await db.insert(documentVersionsTable).values({
      documentId: req.params.id,
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
        uploadedBy: userId,
        notes: parsed.data.notes || doc.notes,
        updatedAt: new Date(),
      })
      .where(eq(documentsTable.id, req.params.id))
      .returning();

    const versionRow = await db
      .select()
      .from(documentVersionsTable)
      .where(eq(documentVersionsTable.documentId, req.params.id))
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
