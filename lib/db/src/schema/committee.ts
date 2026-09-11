import {
  boolean,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membersTable } from "./members";

export const committeeTermsTable = pgTable(
  "committee_terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    committeeYear: text("committee_year").notNull().unique(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("committee_terms_active_idx").on(t.isActive),
    uniqueIndex("committee_terms_one_active_idx")
      .on(t.isActive)
      .where(sql`${t.isActive} = true`),
  ],
);

export const committeeAssignmentsTable = pgTable(
  "committee_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    termId: uuid("term_id")
      .notNull()
      .references(() => committeeTermsTable.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => membersTable.id, { onDelete: "restrict" }),
    position: text("position").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    isActive: boolean("is_active").notNull().default(true),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("committee_assignments_term_member_unique").on(t.termId, t.memberId),
    index("committee_assignments_term_idx").on(t.termId),
    index("committee_assignments_member_idx").on(t.memberId),
  ],
);

export const insertCommitteeTermSchema = createInsertSchema(committeeTermsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertCommitteeAssignmentSchema = createInsertSchema(
  committeeAssignmentsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CommitteeTerm = typeof committeeTermsTable.$inferSelect;
export type CommitteeAssignment = typeof committeeAssignmentsTable.$inferSelect;
export type InsertCommitteeTerm = z.infer<typeof insertCommitteeTermSchema>;
export type InsertCommitteeAssignment = z.infer<typeof insertCommitteeAssignmentSchema>;