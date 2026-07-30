import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membersTable } from "./members";

export const paymentsTable = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberId: uuid("member_id")
    .notNull()
    .references(() => membersTable.id, { onDelete: "cascade" }),
  paymentType: text("payment_type").notNull().default("membership_fee"),
  frfClaimId: uuid("frf_claim_id"),
  amountDue: numeric("amount_due", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("paid"),
  paymentMethod: text("payment_method").notNull(),
  receiptNumber: text("receipt_number").notNull(),
  notes: text("notes"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  importBatchId: uuid("import_batch_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
