import { pgTable, uuid, text, timestamp, numeric, integer, date } from "drizzle-orm/pg-core";
import { membersTable } from "./members";

export const frfMembershipsTable = pgTable("frf_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  frfNumber: text("frf_number").notNull().unique(),
  memberId: uuid("member_id").references(() => membersTable.id, { onDelete: "set null" }),
  fullName: text("full_name").notNull(),
  dateOfBirth: date("date_of_birth"),
  bloodGroup: text("blood_group").notNull().default(""),
  maritalStatus: text("marital_status").notNull().default(""),
  numDependents: integer("num_dependents").notNull().default(0),
  passportNumber: text("passport_number").notNull().default(""),
  iqamaNumber: text("iqama_number").notNull().default(""),
  occupation: text("occupation").notNull().default(""),
  companyName: text("company_name").notNull().default(""),
  mobileSaudi: text("mobile_saudi").notNull().default(""),
  mobileIndia: text("mobile_india").notNull().default(""),
  email: text("email").notNull().default(""),
  areaSaudi: text("area_saudi").notNull().default(""),
  poBox: text("po_box").notNull().default(""),
  businessPhone: text("business_phone").notNull().default(""),
  emergencyNameSaudi: text("emergency_name_saudi").notNull().default(""),
  emergencyMobileSaudi: text("emergency_mobile_saudi").notNull().default(""),
  houseName: text("house_name").notNull().default(""),
  postalAddress: text("postal_address").notNull().default(""),
  district: text("district").notNull().default(""),
  nearestJamaath: text("nearest_jamaath").notNull().default(""),
  homePhone: text("home_phone").notNull().default(""),
  emergencyNameIndia: text("emergency_name_india").notNull().default(""),
  emergencyMobileIndia: text("emergency_mobile_india").notNull().default(""),
  nomineeName: text("nominee_name").notNull().default(""),
  nomineeRelation: text("nominee_relation").notNull().default(""),
  nomineeMobile: text("nominee_mobile").notNull().default(""),
  status: text("status").notNull().default("submitted"),
  photoUrl: text("photo_url"),
  notes: text("notes").notNull().default(""),
  membershipDate: date("membership_date").notNull().default("2024-01-01"),
  renewalDate: date("renewal_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const frfDependentsTable = pgTable("frf_dependents", {
  id: uuid("id").primaryKey().defaultRandom(),
  frfMembershipId: uuid("frf_membership_id").notNull().references(() => frfMembershipsTable.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  relation: text("relation").notNull().default(""),
  age: integer("age"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FrfMembership = typeof frfMembershipsTable.$inferSelect;
export type InsertFrfMembership = typeof frfMembershipsTable.$inferInsert;
export type FrfDependent = typeof frfDependentsTable.$inferSelect;
export type InsertFrfDependent = typeof frfDependentsTable.$inferInsert;
