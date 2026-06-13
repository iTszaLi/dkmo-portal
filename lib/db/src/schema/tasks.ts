import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { eventsTable } from "./events";
import { sponsorsTable } from "./sponsors";

export const tasksTable = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  assignedTo: text("assigned_to").notNull().default(""),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("pending"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  sponsorId: uuid("sponsor_id").references(() => sponsorsTable.id, { onDelete: "set null" }),
  eventId: uuid("event_id").references(() => eventsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Task = typeof tasksTable.$inferSelect;
export type InsertTask = typeof tasksTable.$inferInsert;
