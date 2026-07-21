import { pgTable, uuid, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sponsorsTable = pgTable("sponsors", {
  id: uuid("id").primaryKey().defaultRandom(),
  sponsorName: text("sponsor_name").notNull(),
  company: text("company").notNull().default(""),
  contactPerson: text("contact_person").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  tier: text("tier").notNull().default("bronze"),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  paidAmount: numeric("paid_amount", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  status: text("status").notNull().default("pending"),
  transferMethod: text("transfer_method").notNull().default("bank_transfer"),
  assignedStaff: text("assigned_staff").notNull().default(""),
  linkedEvent: text("linked_event").notNull().default(""),
  dueDate: timestamp("due_date", { withTimezone: true }),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertSponsorSchema = createInsertSchema(sponsorsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSponsor = z.infer<typeof insertSponsorSchema>;
export type Sponsor = typeof sponsorsTable.$inferSelect;
