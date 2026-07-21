import { pgTable, uuid, text, timestamp, numeric, jsonb } from "drizzle-orm/pg-core";
import { membersTable } from "./members";

export type WelfareDocument = { name: string; url: string; uploadedAt?: string };

export const welfareRequestsTable = pgTable("welfare_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestNumber: text("request_number").notNull().unique(),
  serviceType: text("service_type").notNull(),
  memberId: uuid("member_id").references(() => membersTable.id, { onDelete: "set null" }),
  applicantName: text("applicant_name").notNull(),
  membershipId: text("membership_id").notNull().default(""),
  contactNumber: text("contact_number").notNull().default(""),
  status: text("status").notNull().default("submitted"),
  amountRequested: numeric("amount_requested", { precision: 12, scale: 2 }).notNull().default("0"),
  amountApproved: numeric("amount_approved", { precision: 12, scale: 2 }).notNull().default("0"),
  description: text("description").notNull().default(""),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  supportingDocuments: jsonb("supporting_documents").$type<WelfareDocument[]>().notNull().default([]),
  assignedTo: text("assigned_to").notNull().default(""),
  approvalNotes: text("approval_notes").notNull().default(""),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  underReviewAt: timestamp("under_review_at", { withTimezone: true }),
  underReviewBy: text("under_review_by").notNull().default(""),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: text("approved_by").notNull().default(""),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectedBy: text("rejected_by").notNull().default(""),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedBy: text("completed_by").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type WelfareRequest = typeof welfareRequestsTable.$inferSelect;
export type InsertWelfareRequest = typeof welfareRequestsTable.$inferInsert;
