import { pgTable, uuid, text, numeric, integer, date, timestamp } from "drizzle-orm/pg-core";
import { membersTable } from "./members";

export const loansTable = pgTable("loans", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberId: uuid("member_id").references(() => membersTable.id, { onDelete: "set null" }),
  loanType: text("loan_type").notNull().default("personal"),
  principalAmount: numeric("principal_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  disbursedDate: date("disbursed_date"),
  emiAmount: numeric("emi_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  emiCount: integer("emi_count").notNull().default(0),
  paidEmis: integer("paid_emis").notNull().default(0),
  status: text("status").notNull().default("active"),
  convenorName: text("convenor_name").notNull().default(""),
  description: text("description").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Loan = typeof loansTable.$inferSelect;
