import { pgTable, uuid, text, numeric, integer, date, timestamp } from "drizzle-orm/pg-core";
import { membersTable } from "./members";
import { committeeAssignmentsTable } from "./committee";

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
  responsibleCommitteeAssignmentId: uuid("responsible_committee_assignment_id").references(
    () => committeeAssignmentsTable.id,
    { onDelete: "set null" },
  ),
  description: text("description").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/** The single row (id=1) stores only the allocation; usage is always derived from loans. */
export const loanBudgetsTable = pgTable("loan_budgets", {
  id: integer("id").primaryKey().default(1),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loanBudgetHistoryTable = pgTable("loan_budget_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  oldAmount: numeric("old_amount", { precision: 14, scale: 2 }).notNull(),
  newAmount: numeric("new_amount", { precision: 14, scale: 2 }).notNull(),
  actorId: text("actor_id").notNull(),
  actorName: text("actor_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loanPaymentsTable = pgTable("loan_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  loanId: uuid("loan_id").notNull().references(() => loansTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
  paymentDate: date("payment_date").notNull(),
  paymentMethod: text("payment_method").notNull().default("cash"),
  notes: text("notes").notNull().default(""),
  recordedBy: text("recorded_by").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Loan = typeof loansTable.$inferSelect;
export type LoanPayment = typeof loanPaymentsTable.$inferSelect;
export type LoanBudget = typeof loanBudgetsTable.$inferSelect;
export type LoanBudgetHistory = typeof loanBudgetHistoryTable.$inferSelect;
