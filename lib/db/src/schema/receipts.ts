import { pgTable, uuid, text, numeric, timestamp } from "drizzle-orm/pg-core";

export const receiptsTable = pgTable("receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  receiptNumber: text("receipt_number").notNull(),
  receiptDate: text("receipt_date").notNull(),
  memberName: text("member_name").notNull(),
  dkmoId: text("dkmo_id").notNull().default(""),
  jamathName: text("jamath_name").notNull().default(""),
  mobileNumber: text("mobile_number").notNull().default(""),
  whatsappNumber: text("whatsapp_number").notNull().default(""),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  paymentTypes: text("payment_types").notNull().default("{}"),
  createdBy: text("created_by").notNull().default(""),
  importBatchId: uuid("import_batch_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Receipt = typeof receiptsTable.$inferSelect;
export type InsertReceipt = typeof receiptsTable.$inferInsert;
