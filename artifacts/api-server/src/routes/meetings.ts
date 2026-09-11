import { Router, type IRouter } from "express";
import { eq, desc, asc, and, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  meetingsTable,
  meetingAttendanceTable,
  membersTable,
  committeeAssignmentsTable,
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
const UpdateMeetingParticipantsBody = z.object({
  memberIds: z.array(z.string().uuid()).max(200),
}).superRefine((value, ctx) => {
  if (new Set(value.memberIds).size !== value.memberIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["memberIds"],
      message: "Duplicate member IDs are not allowed.",
    });
  }
});

function meetingDateToString(d: Date | null): string {
  return d ? d.toISOString() : "";
}

async function committeeMembersForTerm(termId: string | null) {
  if (!termId) return [];
  return db
    .select({
      id: membersTable.id,
      membershipId: membersTable.membershipId,
      fullName: membersTable.fullName,
      city: membersTable.city,
      country: membersTable.country,
      mobileNumber: membersTable.mobileNumber,
    })
    .from(committeeAssignmentsTable)
    .innerJoin(membersTable, eq(committeeAssignmentsTable.memberId, membersTable.id))
    .where(
      and(
        eq(committeeAssignmentsTable.termId, termId),
        eq(committeeAssignmentsTable.isActive, true),
      ),
    )
    .orderBy(asc(membersTable.fullName));
}

async function ensureMeetingParticipants(meeting: MeetingRow): Promise<MeetingRow> {
  if (meeting.participantsInitialized) return meeting;

  const members = await committeeMembersForTerm(meeting.committeeTermId);
  if (members.length > 0) {
    await db
      .insert(meetingAttendanceTable)
      .values(
        members.map((member) => ({
          meetingId: meeting.id,
          memberId: member.id,
          status: "absent",
        })),
      )
      .onConflictDoNothing({
        target: [meetingAttendanceTable.meetingId, meetingAttendanceTable.memberId],
      });
  }
  await db
    .update(meetingsTable)
    .set({ participantsInitialized: true })
    .where(eq(meetingsTable.id, meeting.id));

  return { ...meeting, participantsInitialized: true };
}

/**
 * Builds the full attendance register from the meeting's persisted participant
 * rows. The first read of a legacy meeting backfills its original term roster;
 * later reads never re-expand the list when the official committee changes.
 */
async function buildMeetingDetail(meeting: MeetingRow) {
  const initializedMeeting = await ensureMeetingParticipants(meeting);
  const attendance = await db
    .select({
      memberId: meetingAttendanceTable.memberId,
      status: meetingAttendanceTable.status,
      membershipId: membersTable.membershipId,
      fullName: membersTable.fullName,
      city: membersTable.city,
      country: membersTable.country,
      mobileNumber: membersTable.mobileNumber,
    })
    .from(meetingAttendanceTable)
    .innerJoin(membersTable, eq(meetingAttendanceTable.memberId, membersTable.id))
    .where(eq(meetingAttendanceTable.meetingId, initializedMeeting.id));

  const rows = attendance.map((a) => {
    const location = [a.city, a.country].filter(Boolean).join(", ");
    return {
      memberId: a.memberId,
      membershipId: a.membershipId,
      fullName: a.fullName,
      location,
      mobileNumber: a.mobileNumber,
      status: a.status === "present" ? "present" : "absent",
    };
  });

  const totalCount = rows.length;
  const presentCount = rows.filter((r) => r.status === "present").length;
  const absentCount = totalCount - presentCount;
  const attendancePercentage =
    totalCount > 0 ? Math.round((presentCount / totalCount) * 1000) / 10 : 0;

  return {
    id: initializedMeeting.id,
    title: initializedMeeting.title,
    meetingDate: meetingDateToString(initializedMeeting.meetingDate),
    location: initializedMeeting.location,
    notes: initializedMeeting.notes,
    committeeTermId: initializedMeeting.committeeTermId,
    totalCount,
    presentCount,
    absentCount,
    attendancePercentage,
    createdAt: meetingDateToString(initializedMeeting.createdAt),
    attendance: rows,
  };
}

async function meetingParticipantOptions(meeting: MeetingRow, search: string) {
  const [eligibleMembers, selectedMembers] = await Promise.all([
    committeeMembersForTerm(meeting.committeeTermId),
    db
      .select({
        memberId: meetingAttendanceTable.memberId,
        membershipId: membersTable.membershipId,
        fullName: membersTable.fullName,
        city: membersTable.city,
        country: membersTable.country,
        mobileNumber: membersTable.mobileNumber,
      })
      .from(meetingAttendanceTable)
      .innerJoin(membersTable, eq(meetingAttendanceTable.memberId, membersTable.id))
      .where(eq(meetingAttendanceTable.meetingId, meeting.id)),
  ]);

  const selectedIds = new Set(selectedMembers.map((member) => member.memberId));
  const options = new Map<string, {
    memberId: string;
    membershipId: string;
    fullName: string;
    location: string;
    mobileNumber: string;
    selected: boolean;
  }>();

  for (const member of eligibleMembers) {
    options.set(member.id, {
      memberId: member.id,
      membershipId: member.membershipId,
      fullName: member.fullName,
      location: [member.city, member.country].filter(Boolean).join(", "),
      mobileNumber: member.mobileNumber,
      selected: selectedIds.has(member.id),
    });
  }
  for (const member of selectedMembers) {
    if (!options.has(member.memberId)) {
      options.set(member.memberId, {
        memberId: member.memberId,
        membershipId: member.membershipId,
        fullName: member.fullName,
        location: [member.city, member.country].filter(Boolean).join(", "),
        mobileNumber: member.mobileNumber,
        selected: true,
      });
    }
  }

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const members = [...options.values()]
    .filter((member) =>
      !normalizedSearch ||
      member.fullName.toLocaleLowerCase().includes(normalizedSearch) ||
      member.membershipId.toLocaleLowerCase().includes(normalizedSearch),
    )
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  return { meetingId: meeting.id, selectedCount: selectedIds.size, members };
}

router.get("/meetings", async (_req, res): Promise<void> => {
  const meetingRows = await db.select().from(meetingsTable).orderBy(desc(meetingsTable.meetingDate));
  const meetings = await Promise.all(meetingRows.map(ensureMeetingParticipants));
  const attendance = await db
    .select({
      meetingId: meetingAttendanceTable.meetingId,
      status: meetingAttendanceTable.status,
    })
    .from(meetingAttendanceTable);

  const presentByMeeting = new Map<string, number>();
  for (const a of attendance) {
    if (a.status === "present") {
      presentByMeeting.set(
        a.meetingId,
        (presentByMeeting.get(a.meetingId) ?? 0) + 1,
      );
    }
  }

  const participantCounts = new Map<string, number>();
  for (const a of attendance) {
    participantCounts.set(a.meetingId, (participantCounts.get(a.meetingId) ?? 0) + 1);
  }

  const result = meetings.map((m) => {
    const presentCount = presentByMeeting.get(m.id) ?? 0;
    const totalCount = participantCounts.get(m.id) ?? 0;
    const absentCount = totalCount - presentCount;
    const attendancePercentage =
      totalCount > 0 ? Math.round((presentCount / totalCount) * 1000) / 10 : 0;
    return {
      id: m.id,
      title: m.title,
      meetingDate: meetingDateToString(m.meetingDate),
      location: m.location,
      notes: m.notes,
      committeeTermId: m.committeeTermId,
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
  const [{ id: activeTermId } = {}] = await db
    .select({ id: committeeAssignmentsTable.termId })
    .from(committeeAssignmentsTable)
    .where(eq(committeeAssignmentsTable.isActive, true))
    .limit(1);
  if (!activeTermId) {
    res.status(409).json({ error: "No active committee term is configured." });
    return;
  }
  const [created] = await db
    .insert(meetingsTable)
    .values({
      title: parsed.data.title,
      meetingDate: date,
      location: parsed.data.location ?? "",
      notes: parsed.data.notes ?? "",
      committeeTermId: activeTermId,
      participantsInitialized: false,
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

router.get("/meetings/:id/participants", async (req, res): Promise<void> => {
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
  const initializedMeeting = await ensureMeetingParticipants(meeting);
  res.json(await meetingParticipantOptions(
    initializedMeeting,
    typeof req.query.search === "string" ? req.query.search : "",
  ));
});

router.put("/meetings/:id/participants", async (req, res): Promise<void> => {
  const params = GetMeetingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateMeetingParticipantsBody.safeParse(req.body);
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

  const initializedMeeting = await ensureMeetingParticipants(meeting);
  const [eligibleMembers, currentRows] = await Promise.all([
    committeeMembersForTerm(initializedMeeting.committeeTermId),
    db
      .select({ memberId: meetingAttendanceTable.memberId })
      .from(meetingAttendanceTable)
      .where(eq(meetingAttendanceTable.meetingId, initializedMeeting.id)),
  ]);
  const allowedIds = new Set([
    ...eligibleMembers.map((member) => member.id),
    ...currentRows.map((row) => row.memberId),
  ]);
  const invalidIds = parsed.data.memberIds.filter((memberId) => !allowedIds.has(memberId));
  if (invalidIds.length > 0) {
    res.status(403).json({
      error: "Only members of the meeting's committee term may be selected.",
    });
    return;
  }

  const requestedIds = new Set(parsed.data.memberIds);
  const currentIds = new Set(currentRows.map((row) => row.memberId));
  const removedIds = [...currentIds].filter((memberId) => !requestedIds.has(memberId));
  if (removedIds.length > 0) {
    await db
      .delete(meetingAttendanceTable)
      .where(
        and(
          eq(meetingAttendanceTable.meetingId, initializedMeeting.id),
          inArray(meetingAttendanceTable.memberId, removedIds),
        ),
      );
  }
  const addedIds = [...requestedIds].filter((memberId) => !currentIds.has(memberId));
  if (addedIds.length > 0) {
    await db
      .insert(meetingAttendanceTable)
      .values(addedIds.map((memberId) => ({
        meetingId: initializedMeeting.id,
        memberId,
        status: "absent",
      })))
      .onConflictDoNothing({
        target: [meetingAttendanceTable.meetingId, meetingAttendanceTable.memberId],
      });
  }

  logAudit(req, "meeting_participants_updated", "meetings", {
    entityId: initializedMeeting.id,
    entityName: initializedMeeting.title,
    details: `${requestedIds.size} participants`,
  });
  res.json(await buildMeetingDetail(initializedMeeting));
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

  const initializedMeeting = await ensureMeetingParticipants(meeting);
  const participantRows = await db
    .select({ memberId: meetingAttendanceTable.memberId })
    .from(meetingAttendanceTable)
    .where(eq(meetingAttendanceTable.meetingId, initializedMeeting.id));
  const participantIds = new Set(participantRows.map((row) => row.memberId));
  const ineligible = parsed.data.records.filter((record) => !participantIds.has(record.memberId));
  if (ineligible.length > 0) {
    res.status(403).json({
      error: "Only members of the authoritative committee term may be recorded for this meeting.",
    });
    return;
  }

  for (const record of parsed.data.records) {
    await db
      .insert(meetingAttendanceTable)
      .values({
        meetingId: initializedMeeting.id,
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
    entityId: initializedMeeting.id,
    entityName: initializedMeeting.title,
    details: `${parsed.data.records.length} records`,
  });
  res.json(await buildMeetingDetail(meeting));
});

export default router;
