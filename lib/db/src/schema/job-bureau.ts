import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { membersTable } from "./members";

export type JobDocument = { name: string; url: string; uploadedAt?: string };

export const jobListingsTable = pgTable("job_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  company: text("company").notNull().default(""),
  location: text("location").notNull().default(""),
  jobType: text("job_type").notNull().default("full_time"),
  salaryRange: text("salary_range").notNull().default(""),
  description: text("description").notNull().default(""),
  contactPerson: text("contact_person").notNull().default(""),
  contactNumber: text("contact_number").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  status: text("status").notNull().default("open"),
  postedBy: text("posted_by").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const jobApplicationsTable = pgTable("job_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id")
    .notNull()
    .references(() => jobListingsTable.id, { onDelete: "cascade" }),
  memberId: uuid("member_id").references(() => membersTable.id, { onDelete: "set null" }),
  applicantName: text("applicant_name").notNull(),
  membershipId: text("membership_id").notNull().default(""),
  contactNumber: text("contact_number").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  cvDocuments: jsonb("cv_documents").$type<JobDocument[]>().notNull().default([]),
  status: text("status").notNull().default("applied"),
  notes: text("notes").notNull().default(""),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type JobListing = typeof jobListingsTable.$inferSelect;
export type InsertJobListing = typeof jobListingsTable.$inferInsert;
export type JobApplication = typeof jobApplicationsTable.$inferSelect;
export type InsertJobApplication = typeof jobApplicationsTable.$inferInsert;
