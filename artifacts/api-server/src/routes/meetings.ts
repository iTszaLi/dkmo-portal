import { Router, type IRouter } from "express";
import { eq, desc, asc, and } from "drizzle-orm";
import {
  db,
  meetingsTable,
  meetingAttendanceTable,
  membersTable,
} from "@workspace/db";
import {
  CreateMeetingBody,
  GetMeetingParams,
  UpdateMeetingParams,
  UpdateMeetingBody,
  DeleteMeetingParams,
  SetMeetingAttendanceParams,
  SetMeetingAttendanceBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

router.use(requireAuth);

type MeetingRow = typeof meetingsTable.$inferSelect;

function meetingDateToString(d: Date | null): string {
  return d ? d.toISOString() : "";
}

/**
 * Builds the full attendance register for a meeting: every member appears,
 * defaulting to "absent" unless an attendance record marks them present.
 */
async function buildMeetingDetail(meeting: MeetingRow) {
  const [members, attendance] = await Promise.all([
    db
      .select()
      .from(membersTable)
      .orderBy(asc(membersTable.fullName)),
    db
      .select()
      .from(meetingAttendanceTable)
      .where(eq(meetingAttendanceTable.meetingId, meeting.id)),
  ]);

  const statusByMember = new Map<string, string>();
  for (const a of attendance) statusByMember.set(a.memberId, a.status);

  const rows = members.map((m) => {
    const status = statusByMember.get(m.id) === "present" ? "present" : "absent";
    const location = [m.city, m.country].filter(Boolean).join(", ");
    return {
      memberId: m.id,
      membershipId: m.membershipId,
      fullName: m.fullName,
      location,
      mobileNumber: m.mobileNumber,
      status,
    };
  });

  const totalCount = rows.length;
  const presentCount = rows.filter((r) => r.status === "present").length;
  const absentCount = totalCount - presentCount;
  const attendancePercentage =
    totalCount > 0 ? Math.round((presentCount / totalCount) * 1000) / 10 : 0;

  return {
    id: meeting.id,
    title: meeting.title,
    meetingDate: meetingDateToString(meeting.meetingDate),
    location: meeting.location,
    notes: meeting.notes,
    totalCount,
    presentCount,
    absentCount,
    attendancePercentage,
    createdAt: meetingDateToString(meeting.createdAt),
    attendance: rows,
  };
}

router.get("/meetings", async (_req, res): Promise<void> => {
  const [meetings, members, attendance] = await Promise.all([
    db.select().from(meetingsTable).orderBy(desc(meetingsTable.meetingDate)),
    db.select({ id: membersTable.id }).from(membersTable),
    db
      .select({
        meetingId: meetingAttendanceTable.meetingId,
        status: meetingAttendanceTable.status,
      })
      .from(meetingAttendanceTable),
  ]);

  const totalCount = members.length;
  const presentByMeeting = new Map<string, number>();
  for (const a of attendance) {
    if (a.status === "present") {
      presentByMeeting.set(
        a.meetingId,
        (presentByMeeting.get(a.meetingId) ?? 0) + 1,
      );
    }
  }

  const result = meetings.map((m) => {
    const presentCount = presentByMeeting.get(m.id) ?? 0;
    const absentCount = totalCount - presentCount;
    const attendancePercentage =
      totalCount > 0 ? Math.round((presentCount / totalCount) * 1000) / 10 : 0;
    return {
      id: m.id,
      title: m.title,
      meetingDate: meetingDateToString(m.meetingDate),
      location: m.location,
      notes: m.notes,
      totalCount,
      presentCount,
      absentCount,
      attendancePercentage,
      createdAt: meetingDateToString(m.createdAt),
    };
  });

  res.json(result);
});

router.post("/meetings", async (req, res): Promise<void> => {
  const parsed = CreateMeetingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const date = new Date(parsed.data.meetingDate);
  if (Number.isNaN(date.getTime())) {
    res.status(400).json({ error: "Invalid meeting date" });
    return;
  }
  const [created] = await db
    .insert(meetingsTable)
    .values({
      title: parsed.data.title,
      meetingDate: date,
      location: parsed.data.location ?? "",
      notes: parsed.data.notes ?? "",
    })
    .returning();
  if (!created) {
    res.status(500).json({ error: "Failed to create meeting" });
    return;
  }
  logAudit(req, "meeting_created", "meetings", {
    entityId: created.id,
    entityName: created.title,
  });
  res.status(201).json(await buildMeetingDetail(created));
});

router.get("/meetings/:id", async (req, res): Promise<void> => {
  const params = GetMeetingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [meeting] = await db
    .select()
    .from(meetingsTable)
    .where(eq(meetingsTable.id, params.data.id));
  if (!meeting) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }
  res.json(await buildMeetingDetail(meeting));
});

router.patch("/meetings/:id", async (req, res): Promise<void> => {
  const params = UpdateMeetingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateMeetingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const date = new Date(parsed.data.meetingDate);
  if (Number.isNaN(date.getTime())) {
    res.status(400).json({ error: "Invalid meeting date" });
    return;
  }
  const [updated] = await db
    .update(meetingsTable)
    .set({
      title: parsed.data.title,
      meetingDate: date,
      location: parsed.data.location ?? "",
      notes: parsed.data.notes ?? "",
    })
    .where(eq(meetingsTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }
  logAudit(req, "meeting_updated", "meetings", {
    entityId: updated.id,
    entityName: updated.title,
  });
  res.json(await buildMeetingDetail(updated));
});

router.delete("/meetings/:id", async (req, res): Promise<void> => {
  const params = DeleteMeetingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(meetingsTable)
    .where(eq(meetingsTable.id, params.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }
  logAudit(req, "meeting_deleted", "meetings", {
    entityId: deleted.id,
    entityName: deleted.title,
  });
  res.sendStatus(204);
});

router.put("/meetings/:id/attendance", async (req, res): Promise<void> => {
  const params = SetMeetingAttendanceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = SetMeetingAttendanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [meeting] = await db
    .select()
    .from(meetingsTable)
    .where(eq(meetingsTable.id, params.data.id));
  if (!meeting) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }

  for (const record of parsed.data.records) {
    await db
      .insert(meetingAttendanceTable)
      .values({
        meetingId: meeting.id,
        memberId: record.memberId,
        status: record.status,
      })
      .onConflictDoUpdate({
        target: [
          meetingAttendanceTable.meetingId,
          meetingAttendanceTable.memberId,
        ],
        set: { status: record.status, updatedAt: new Date() },
      });
  }

  logAudit(req, "meeting_attendance_updated", "meetings", {
    entityId: meeting.id,
    entityName: meeting.title,
    details: `${parsed.data.records.length} records`,
  });
  res.json(await buildMeetingDetail(meeting));
});

export default router;
