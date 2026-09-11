import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { membersTable } from "./members";

export const memberTimelineEntriesTable = pgTable("member_timeline_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberId: uuid("member_id")
    .notNull()
    .references(() => membersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  eventDate: timestamp("event_date", { withTimezone: true }),
  createdBy: text("created_by").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MemberTimelineEntry = typeof memberTimelineEntriesTable.$inferSelect;