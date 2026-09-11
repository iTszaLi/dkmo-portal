import { Router, type IRouter } from "express";
import { and, gte, lt, isNotNull } from "drizzle-orm";
import {
  db,
  eventsTable,
  meetingsTable,
  tasksTable,
  sponsorsTable,
  documentsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

type CalendarItem = {
  date: string; // YYYY-MM-DD
  type: "event" | "meeting" | "task" | "sponsor_due" | "document_expiry";
  title: string;
  href: string;
  meta?: string;
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * GET /api/calendar?year=2026&month=7 — everything happening in a given month:
 * events, meetings, task due dates, sponsor follow-ups and document expiries.
 * Auth-only, matching the portal's role-open read model.
 */
router.get("/calendar", requireAuth, async (req, res): Promise<void> => {
  const now = new Date();
  const year = Number(req.query.year) || now.getUTCFullYear();
  const month = Number(req.query.month) || now.getUTCMonth() + 1; // 1-12
  if (month < 1 || month > 12 || year < 2000 || year > 2100) {
    res.status(400).json({ message: "Invalid year/month" });
    return;
  }
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  try {
    const [events, meetings, tasks, sponsors, documents] = await Promise.all([
      db
        .select({ id: eventsTable.id, name: eventsTable.name, date: eventsTable.eventDate })
        .from(eventsTable)
        .where(and(isNotNull(eventsTable.eventDate), gte(eventsTable.eventDate, start), lt(eventsTable.eventDate, end))),
      db
        .select({ id: meetingsTable.id, title: meetingsTable.title, date: meetingsTable.meetingDate })
        .from(meetingsTable)
        .where(and(gte(meetingsTable.meetingDate, start), lt(meetingsTable.meetingDate, end))),
      db
        .select({ id: tasksTable.id, title: tasksTable.title, date: tasksTable.dueDate, status: tasksTable.status })
        .from(tasksTable)
        .where(and(isNotNull(tasksTable.dueDate), gte(tasksTable.dueDate, start), lt(tasksTable.dueDate, end))),
      db
        .select({ id: sponsorsTable.id, name: sponsorsTable.sponsorName, date: sponsorsTable.dueDate })
        .from(sponsorsTable)
        .where(and(isNotNull(sponsorsTable.dueDate), gte(sponsorsTable.dueDate, start), lt(sponsorsTable.dueDate, end))),
      // expiry_date is a text column (YYYY-MM-DD); filter in app code.
      db
        .select({ id: documentsTable.id, title: documentsTable.title, expiry: documentsTable.expiryDate })
        .from(documentsTable)
        .where(isNotNull(documentsTable.expiryDate)),
    ]);

    const items: CalendarItem[] = [];
    for (const e of events) if (e.date) items.push({ date: ymd(e.date), type: "event", title: e.name, href: `/events/${e.id}` });
    for (const m of meetings) items.push({ date: ymd(m.date), type: "meeting", title: m.title, href: "/meetings" });
    for (const t of tasks) if (t.date) items.push({ date: ymd(t.date), type: "task", title: t.title, href: `/tasks/${t.id}`, meta: t.status ?? undefined });
    for (const s of sponsors) if (s.date) items.push({ date: ymd(s.date), type: "sponsor_due", title: `${s.name} — follow-up`, href: `/sponsors/${s.id}` });

    const prefix = `${year}-${String(month).padStart(2, "0")}-`;
    for (const d of documents) {
      if (d.expiry && d.expiry.startsWith(prefix)) {
        items.push({ date: d.expiry, type: "document_expiry", title: `${d.title} expires`, href: "/documents" });
      }
    }
    items.sort((a, b) => a.date.localeCompare(b.date));
    res.json({ year, month, items });
  } catch (err) {
    console.error("calendar error", err);
    res.status(500).json({ message: "Failed to load calendar" });
  }
});

export default router;
