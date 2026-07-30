import { pgTable, uuid, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";

/**
 * One row per legacy-member import run. Powers the Import History page and
 * the "Undo Last Import" rollback (inserted member ids are tracked so the
 * batch can be reversed as long as no dependent records exist).
 */
export const importBatchesTable = pgTable("import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  entity: text("entity").notNull().default("members"),
  fileName: text("file_name").notNull().default(""),
  fileSize: integer("file_size").notNull().default(0),
  totalRows: integer("total_rows").notNull().default(0),
  imported: integer("imported").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  duplicates: integer("duplicates").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  notes: text("notes").notNull().default(""),
  rolledBack: boolean("rolled_back").notNull().default(false),
  rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
  createdBy: text("created_by").notNull().default(""),
  createdByName: text("created_by_name").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ImportBatch = typeof importBatchesTable.$inferSelect;
