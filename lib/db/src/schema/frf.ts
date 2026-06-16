import { pgTable, uuid, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { membersTable } from "./members";

export const frfClaimsTable = pgTable("frf_claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberId: uuid("member_id").references(() => membersTable.id, { onDelete: "set null" }),
  claimantName: text("claimant_name").notNull(),
  membershipId: text("membership_id").notNull().default(""),
  claimType: text("claim_type").notNull().default("death_benefit"),
  amountRequested: numeric("amount_requested", { precision: 12, scale: 2 }).notNull().default("0"),
  amountApproved: numeric("amount_approved", { precision: 12, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("pending"),
  claimDate: timestamp("claim_date", { withTimezone: true }).notNull().defaultNow(),
  approvedDate: timestamp("approved_date", { withTimezone: true }),
  approvedBy: text("approved_by").notNull().default(""),
  underReviewAt: timestamp("under_review_at", { withTimezone: true }),
  underReviewBy: text("under_review_by").notNull().default(""),
  disbursedAt: timestamp("disbursed_at", { withTimezone: true }),
  disbursedBy: text("disbursed_by").notNull().default(""),
  rejectedBy: text("rejected_by").notNull().default(""),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  reviewNotes: text("review_notes").notNull().default(""),
  beneficiaryName: text("beneficiary_name").notNull().default(""),
  beneficiaryRelation: text("beneficiary_relation").notNull().default(""),
  description: text("description").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type FrfClaim = typeof frfClaimsTable.$inferSelect;
export type InsertFrfClaim = typeof frfClaimsTable.$inferInsert;
