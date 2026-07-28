import { Router, type IRouter } from "express";
import { eq, desc, and, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, documentsTable, documentActivityTable } from "@workspace/db";
import { streamStoredFile } from "../lib/documentFiles";
import { publicRateLimit } from "../middlewares/rateLimit";

/**
 * Public document portal — NO authentication.
 * Exposes only documents explicitly marked visibility='public' with an active
 * status, and only a minimal non-sensitive DTO (no notes, no linked entities,
 * no uploader identity).
 */
const router: IRouter = Router();

// Throttle unauthenticated portal traffic to slow down scraping.
router.use("/public/documents", publicRateLimit(120, 60_000));

function publicDto(row: typeof documentsTable.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    tags: row.tags,
    fileUrl: row.fileUrl ? `/api/public/documents/${row.id}/file` : "",
    fileName: row.fileName,
    fileSize: row.fileSize,
    mimeType: row.mimeType,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/public/documents", async (req, res): Promise<void> => {
  try {
    const { search } = req.query as Record<string, string>;
    const conditions = [
      eq(documentsTable.visibility, "public"),
      eq(documentsTable.status, "active"),
    ];
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(documentsTable.title, pattern),
          ilike(documentsTable.description, pattern),
          ilike(documentsTable.tags, pattern),
        )!,
      );
    }
    const rows = await db
      .select()
      .from(documentsTable)
      .where(and(...conditions))
      .orderBy(desc(documentsTable.createdAt))
      .limit(100);
    res.json({ items: rows.map(publicDto) });
  } catch (err) {
    req.log.error({ err }, "publicDocuments failed");
    res.status(500).json({ error: "Failed to list documents" });
  }
});

/** Streams the file of a PUBLIC, active document only. */
router.get("/public/documents/:id/file", async (req, res): Promise<void> => {
  try {
    const [row] = await db
      .select()
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.id, String(req.params.id)),
          eq(documentsTable.visibility, "public"),
          eq(documentsTable.status, "active"),
        ),
      );
    if (!row || !row.fileUrl) { res.status(404).json({ error: "File not found" }); return; }
    await streamStoredFile(res, row.fileUrl, row.fileName);
  } catch (err) {
    req.log.error({ err }, "publicDocumentFile failed");
    if (!res.headersSent) res.status(500).json({ error: "Failed to serve file" });
  }
});

const TrackInput = z.object({ action: z.enum(["viewed", "downloaded"]) });

/** Anonymous view/download tracking for public documents only. */
router.post("/public/documents/:id/track", async (req, res): Promise<void> => {
  try {
    const parsed = TrackInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
    const [row] = await db
      .select()
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.id, String(req.params.id)),
          eq(documentsTable.visibility, "public"),
          eq(documentsTable.status, "active"),
        ),
      );
    if (!row) { res.status(404).json({ error: "Document not found" }); return; }
    await db.insert(documentActivityTable).values({
      documentId: row.id,
      action: parsed.data.action,
      userName: "Public visitor",
    });
    if (parsed.data.action === "downloaded") {
      await db
        .update(documentsTable)
        .set({ downloadCount: sql`${documentsTable.downloadCount} + 1` })
        .where(eq(documentsTable.id, row.id));
    }
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "publicTrack failed");
    res.status(500).json({ error: "Failed to track" });
  }
});

export default router;
