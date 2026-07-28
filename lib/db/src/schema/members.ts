import { pgTable, uuid, text, timestamp, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const membersTable = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  mobileNumber: text("mobile_number").notNull(),
  membershipId: text("membership_id").notNull().unique(),
  photoUrl: text("photo_url"),
  applicationNumber: text("application_number").notNull().default(""),
  iqamaNumber: text("iqama_number").notNull().default(""),
  jamaath: text("jamaath").notNull().default(""),
  city: text("city").notNull().default(""),
  country: text("country").notNull().default(""),
  dateOfBirth: text("date_of_birth").notNull().default(""),
  designation: text("designation").notNull().default(""),
  isExecutiveCommittee: boolean("is_executive_committee").notNull().default(false),
  isCoreCommittee: boolean("is_core_committee").notNull().default(false),
  membershipFee: numeric("membership_fee", { precision: 12, scale: 2 })
    .notNull()
    .default("100"),
  feeStatus: text("fee_status").notNull().default("unpaid"),
  feePaidAt: timestamp("fee_paid_at", { withTimezone: true }),
  feeUpdatedBy: text("fee_updated_by").notNull().default(""),
  frfStatus: text("frf_status").notNull().default("active"),
  responsibility: text("responsibility").notNull().default("not_responsible"),
  notes: text("notes").notNull().default(""),
  // Legacy-import fields (populated by the Import Members module)
  legacyMemberId: text("legacy_member_id").notNull().default(""),
  oldApplicationNumber: text("old_application_number").notNull().default(""),
  whatsappNumber: text("whatsapp_number").notNull().default(""),
  passportNumber: text("passport_number").notNull().default(""),
  nativePlace: text("native_place").notNull().default(""),
  memberGroup: text("member_group").notNull().default(""),
  importBatchId: uuid("import_batch_id"),
  refMemberName: text("ref_member_name").notNull().default(""),
  refMemberId: text("ref_member_id").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertMemberSchema = createInsertSchema(membersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof membersTable.$inferSelect;
