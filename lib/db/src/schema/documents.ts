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
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

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
