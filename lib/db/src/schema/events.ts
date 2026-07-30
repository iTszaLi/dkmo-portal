import { pgTable, uuid, text, timestamp, numeric } from "drizzle-orm/pg-core";

export const eventsTable = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  eventDate: timestamp("event_date", { withTimezone: true }),
  location: text("location").notNull().default(""),
  budget: numeric("budget", { precision: 14, scale: 2 }).notNull().default("0"),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("upcoming"),
  importBatchId: uuid("import_batch_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Event = typeof eventsTable.$inferSelect;
export type InsertEvent = typeof eventsTable.$inferInsert;
