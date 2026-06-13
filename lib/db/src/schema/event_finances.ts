import { pgTable, uuid, text, timestamp, numeric, integer, boolean } from "drizzle-orm/pg-core";
import { eventsTable } from "./events";

export const eventSponsorsTable = pgTable("event_sponsors", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
  sponsorName: text("sponsor_name").notNull(),
  contactPerson: text("contact_person").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
  sponsorshipType: text("sponsorship_type").notNull().default("cash"),
  sponsorshipDate: text("sponsorship_date").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const eventExpensesTable = pgTable("event_expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  description: text("description").notNull().default(""),
  vendor: text("vendor").notNull().default(""),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
  expenseDate: text("expense_date").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const eventTicketBookletsTable = pgTable("event_ticket_booklets", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
  bookletNumber: text("booklet_number").notNull(),
  ticketRangeStart: integer("ticket_range_start").notNull(),
  ticketRangeEnd: integer("ticket_range_end").notNull(),
  assignedTo: text("assigned_to").notNull().default(""),
  assignedDate: text("assigned_date").notNull().default(""),
  ticketAmount: numeric("ticket_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("available"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const eventTicketsTable = pgTable("event_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookletId: uuid("booklet_id").notNull().references(() => eventTicketBookletsTable.id, { onDelete: "cascade" }),
  eventId: uuid("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
  ticketNumber: integer("ticket_number").notNull(),
  isSold: boolean("is_sold").notNull().default(false),
  soldBy: text("sold_by").notNull().default(""),
  buyerName: text("buyer_name").notNull().default(""),
  buyerPhone: text("buyer_phone").notNull().default(""),
  saleDate: text("sale_date").notNull().default(""),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EventSponsor = typeof eventSponsorsTable.$inferSelect;
export type InsertEventSponsor = typeof eventSponsorsTable.$inferInsert;
export type EventExpense = typeof eventExpensesTable.$inferSelect;
export type InsertEventExpense = typeof eventExpensesTable.$inferInsert;
export type EventTicketBooklet = typeof eventTicketBookletsTable.$inferSelect;
export type InsertEventTicketBooklet = typeof eventTicketBookletsTable.$inferInsert;
export type EventTicket = typeof eventTicketsTable.$inferSelect;
export type InsertEventTicket = typeof eventTicketsTable.$inferInsert;
