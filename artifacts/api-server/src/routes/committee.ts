import { Router, type IRouter } from "express";
import { asc, eq, inArray } from "drizzle-orm";
import {
  committeeAssignmentsTable,
  committeeTermsTable,
  db,
  membersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole, type AuthedRequest } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { z } from "zod";

const router: IRouter = Router();

router.use(requireAuth);

function isValidCommitteeYear(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 120 &&
    !/[/\u0000-\u001f]/.test(value)
  );
}

router.get("/committee/terms", async (_req, res): Promise<void> => {
  const [terms, assignments] = await Promise.all([
    db.select().from(committeeTermsTable).orderBy(asc(committeeTermsTable.startDate)),
    db.select({ termId: committeeAssignmentsTable.termId }).from(committeeAssignmentsTable),
  ]);

  const memberCountByTerm = new Map<string, number>();
  for (const assignment of assignments) {
    memberCountByTerm.set(
      assignment.termId,
      (memberCountByTerm.get(assignment.termId) ?? 0) + 1,
    );
  }

  res.json(
    terms.map((term) => ({
      id: term.id,
      committeeYear: term.committeeYear,
      startDate: term.startDate,
      endDate: term.endDate,
      isActive: term.isActive,
      memberCount: memberCountByTerm.get(term.id) ?? 0,
    })),
  );
});

router.get("/committee/terms/:committeeYear", async (req, res): Promise<void> => {
  const { committeeYear } = req.params;
  if (!isValidCommitteeYear(committeeYear)) {
    res.status(400).json({ error: "Invalid committee year" });
    return;
  }

  const [term] = await db
    .select()
    .from(committeeTermsTable)
    .where(eq(committeeTermsTable.committeeYear, committeeYear));
  if (!term) {
    res.status(404).json({ error: "Committee term not found" });
    return;
  }

  const assignments = await db
    .select({
      assignmentId: committeeAssignmentsTable.id,
      memberId: membersTable.id,
      membershipId: membersTable.membershipId,
      legacyMemberId: membersTable.legacyMemberId,
      fullName: membersTable.fullName,
      photoUrl: membersTable.photoUrl,
      position: committeeAssignmentsTable.position,
      startDate: committeeAssignmentsTable.startDate,
      endDate: committeeAssignmentsTable.endDate,
      isActive: committeeAssignmentsTable.isActive,
      permissions: committeeAssignmentsTable.permissions,
    })
    .from(committeeAssignmentsTable)
    .innerJoin(membersTable, eq(committeeAssignmentsTable.memberId, membersTable.id))
    .where(eq(committeeAssignmentsTable.termId, term.id))
    .orderBy(asc(committeeAssignmentsTable.position), asc(membersTable.fullName));

  res.json({
    id: term.id,
    committeeYear: term.committeeYear,
    startDate: term.startDate,
    endDate: term.endDate,
    isActive: term.isActive,
    members: assignments,
  });
});

const committeeCreateInput = z.object({
  committeeYear: z.string().trim().min(1).max(120),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isActive: z.boolean().default(true),
  assignments: z.array(z.object({
    memberId: z.string().uuid(),
    position: z.string().trim().min(1).max(160),
  })).max(500).default([]),
});

router.post("/committee/terms", requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = committeeCreateInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid committee details", details: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  if (!isValidCommitteeYear(data.committeeYear) || data.endDate < data.startDate) {
    res.status(400).json({ error: "Committee name or date range is invalid" });
    return;
  }
  const memberIds = data.assignments.map((assignment) => assignment.memberId);
  if (new Set(memberIds).size !== memberIds.length) {
    res.status(400).json({ error: "A member can only be added once to a committee" });
    return;
  }

  try {
    const created = await db.transaction(async (tx) => {
      const memberRows = memberIds.length === 0
        ? []
        : await tx.select({ id: membersTable.id }).from(membersTable).where(inArray(membersTable.id, memberIds));
      if (memberRows.length !== memberIds.length) {
        throw new Error("One or more selected members were not found");
      }

      if (data.isActive) {
        await tx.update(committeeTermsTable)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(committeeTermsTable.isActive, true));
      }

      const [term] = await tx.insert(committeeTermsTable).values({
        committeeYear: data.committeeYear,
        startDate: data.startDate,
        endDate: data.endDate,
        isActive: data.isActive,
      }).returning();
      if (!term) throw new Error("Committee could not be created");

      if (data.assignments.length > 0) {
        await tx.insert(committeeAssignmentsTable).values(
          data.assignments.map((assignment) => ({
            termId: term.id,
            memberId: assignment.memberId,
            position: assignment.position,
            startDate: data.startDate,
            endDate: data.endDate,
            isActive: true,
            permissions: [],
          })),
        );
      }
      return term;
    });

    await logAudit(req, "committee_term_created", "committee", {
      entityId: created.id,
      entityName: created.committeeYear,
      details: `${data.assignments.length} member assignment(s); active=${created.isActive}`,
    });
    res.status(201).json({
      id: created.id,
      committeeYear: created.committeeYear,
      startDate: created.startDate,
      endDate: created.endDate,
      isActive: created.isActive,
      memberCount: data.assignments.length,
    });
  } catch (err) {
    if (String(err).toLowerCase().includes("unique")) {
      res.status(409).json({ error: "A committee with this name already exists" });
      return;
    }
    if (err instanceof Error && err.message === "One or more selected members were not found") {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.post("/committee/terms/:id/activate", requireRole("admin"), async (req, res): Promise<void> => {
  const termId = String(req.params.id ?? "");
  try {
    const activated = await db.transaction(async (tx) => {
      const [term] = await tx.select().from(committeeTermsTable).where(eq(committeeTermsTable.id, termId));
      if (!term) return null;
      await tx.update(committeeTermsTable)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(committeeTermsTable.isActive, true));
      const [updated] = await tx.update(committeeTermsTable)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(committeeTermsTable.id, termId))
        .returning();
      return updated ?? null;
    });
    if (!activated) {
      res.status(404).json({ error: "Committee term not found" });
      return;
    }
    await logAudit(req, "committee_term_activated", "committee", {
      entityId: activated.id,
      entityName: activated.committeeYear,
      details: "Previous active term retained as historical",
    });
    res.json({
      id: activated.id,
      committeeYear: activated.committeeYear,
      startDate: activated.startDate,
      endDate: activated.endDate,
      isActive: activated.isActive,
    });
  } catch (err) {
    throw err;
  }
});

router.get("/committee/members/:memberId", async (req, res): Promise<void> => {
  const memberId = String(req.params.memberId ?? "");
  const rows = await db
    .select({
      assignmentId: committeeAssignmentsTable.id,
      termId: committeeTermsTable.id,
      committeeYear: committeeTermsTable.committeeYear,
      termStartDate: committeeTermsTable.startDate,
      termEndDate: committeeTermsTable.endDate,
      termIsActive: committeeTermsTable.isActive,
      memberId: committeeAssignmentsTable.memberId,
      position: committeeAssignmentsTable.position,
      startDate: committeeAssignmentsTable.startDate,
      endDate: committeeAssignmentsTable.endDate,
      isActive: committeeAssignmentsTable.isActive,
      permissions: committeeAssignmentsTable.permissions,
    })
    .from(committeeAssignmentsTable)
    .innerJoin(committeeTermsTable, eq(committeeAssignmentsTable.termId, committeeTermsTable.id))
    .where(eq(committeeAssignmentsTable.memberId, memberId))
    .orderBy(asc(committeeTermsTable.startDate));
  res.json(rows);
});

const assignmentInput = z.object({
  termId: z.string().uuid(),
  memberId: z.string().uuid(),
  position: z.string().trim().min(1).max(160),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  isActive: z.boolean().optional().default(true),
  permissions: z.array(z.string().max(80)).max(30).optional().default([]),
});

router.post("/committee/assignments", requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = assignmentInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid committee assignment", details: parsed.error.flatten() }); return; }
  const [term] = await db.select().from(committeeTermsTable).where(eq(committeeTermsTable.id, parsed.data.termId));
  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, parsed.data.memberId));
  if (!term || !member) { res.status(404).json({ error: !term ? "Committee term not found" : "Member not found" }); return; }
  try {
    const [assignment] = await db.insert(committeeAssignmentsTable).values({
      termId: parsed.data.termId,
      memberId: parsed.data.memberId,
      position: parsed.data.position,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate ?? null,
      isActive: parsed.data.isActive,
      permissions: parsed.data.permissions,
    }).returning();
    await logAudit(req, "committee_assignment_created", "committee", {
      entityId: assignment!.id, entityName: member.fullName, details: `${term.committeeYear}: ${assignment!.position}`,
    });
    res.status(201).json(assignment);
  } catch (err) {
    if (String(err).toLowerCase().includes("unique")) { res.status(409).json({ error: "Member already has an assignment in this term" }); return; }
    throw err;
  }
});

router.put("/committee/assignments/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = assignmentInput.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid committee assignment", details: parsed.error.flatten() }); return; }
  const [assignment] = await db.update(committeeAssignmentsTable).set({
    ...(parsed.data.position !== undefined ? { position: parsed.data.position } : {}),
    ...(parsed.data.startDate !== undefined ? { startDate: parsed.data.startDate } : {}),
    ...(parsed.data.endDate !== undefined ? { endDate: parsed.data.endDate ?? null } : {}),
    ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
    ...(parsed.data.permissions !== undefined ? { permissions: parsed.data.permissions } : {}),
    updatedAt: new Date(),
  }).where(eq(committeeAssignmentsTable.id, String(req.params.id))).returning();
  if (!assignment) { res.status(404).json({ error: "Committee assignment not found" }); return; }
  await logAudit(req, "committee_assignment_updated", "committee", {
    entityId: assignment.id, entityName: assignment.memberId, details: assignment.position,
  });
  res.json(assignment);
});

router.delete("/committee/assignments/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const [assignment] = await db.delete(committeeAssignmentsTable)
    .where(eq(committeeAssignmentsTable.id, String(req.params.id))).returning();
  if (!assignment) { res.status(404).json({ error: "Committee assignment not found" }); return; }
  await logAudit(req, "committee_assignment_deleted", "committee", {
    entityId: assignment.id, entityName: assignment.memberId, details: assignment.position,
  });
  res.sendStatus(204);
});

export default router;