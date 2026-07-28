import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";

export const documentsTable = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("general"),
  tags: text("tags").notNull().default(""),
  fileUrl: text("file_url").notNull().default(""),
  fileName: text("file_name").notNull().default(""),
  fileSize: integer("file_size").notNull().default(0),
  mimeType: text("mime_type").notNull().default(""),
  uploadedBy: text("uploaded_by").notNull().default(""),
  expiryDate: text("expiry_date"),
  status: text("status").notNull().default("active"),
  version: integer("version").notNull().default(1),
  linkedEntityId: text("linked_entity_id").notNull().default(""),
  linkedEntityType: text("linked_entity_type").notNull().default(""),
  notes: text("notes").notNull().default(""),
  /** Access level: public | members | committee | admin */
  visibility: text("visibility").notNull().default("members"),
  downloadCount: integer("download_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Extra supporting files attached to a document (PDFs, Word, Excel, images, ZIPs…). */
export const documentAttachmentsTable = pgTable("document_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documentsTable.id, { onDelete: "cascade" }),
  fileUrl: text("file_url").notNull().default(""),
  fileName: text("file_name").notNull().default(""),
  fileSize: integer("file_size").notNull().default(0),
  mimeType: text("mime_type").notNull().default(""),
  uploadedBy: text("uploaded_by").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Per-document audit trail: uploaded / viewed / downloaded / edited / version / attachment events. */
export const documentActivityTable = pgTable("document_activity", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documentsTable.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  userName: text("user_name").notNull().default(""),
  details: text("details").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DocumentAttachment = typeof documentAttachmentsTable.$inferSelect;
export type DocumentActivity = typeof documentActivityTable.$inferSelect;

export const documentVersionsTable = pgTable("document_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documentsTable.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  fileUrl: text("file_url").notNull().default(""),
  fileName: text("file_name").notNull().default(""),
  fileSize: integer("file_size").notNull().default(0),
  uploadedBy: text("uploaded_by").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
