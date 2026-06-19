import { Router } from "express";
import { db } from "@workspace/db";
import { dkmoMembershipsTable, dkmoMembershipDependentsTable, membersTable } from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import z from "zod";
import { requireAuth, requireRole, type AuthedRequest } from "../middlewares/requireAuth";

const router = Router();

const DkmoMembershipInput = z.object({
  fullName: z.string().min(1, "Full name is required"),
  dateOfBirth: z.string().nullable().optional(),
  bloodGroup: z.string().default(""),
  maritalStatus: z.string().default(""),
  familyInSaudi: z.string().default(""),
  numDependents: z.number().int().default(0),
  passportNumber: z.string().default(""),
  iqamaNumber: z.string().regex(/^(\d{10}|)$/, "Iqama must be exactly 10 digits (or empty)").default(""),
  occupation: z.string().default(""),
  companyName: z.string().default(""),
  mobileSaudi: z.string().default(""),
  email: z.string().default(""),
  areaSaudi: z.string().default(""),
  poBox: z.string().default(""),
  businessPhone: z.string().default(""),
  emergencyNameSaudi: z.string().default(""),
  emergencyMobileSaudi: z.string().default(""),
  houseName: z.string().default(""),
  postalAddress: z.string().default(""),
  district: z.string().default(""),
  nearestJamaath: z.string().default(""),
  homePhone: z.string().default(""),
  mobileIndia: z.string().default(""),
  emergencyNameIndia: z.string().default(""),
  emergencyMobileIndia: z.string().default(""),
  photoUrl: z.string().nullable().optional(),
  notes: z.string().default(""),
  refMemberName: z.string().default(""),
  refMemberId: z.string().default(""),
  status: z.enum(["submitted", "under_review", "approved", "rejected", "completed"]).default("submitted"),
  remarks: z.string().default(""),
  declineReason: z.string().nullable().optional(),
  membershipDate: z.string().nullable().optional(),
  dependents: z.array(z.object({
    fullName: z.string().min(1),
    relation: z.string().default(""),
    age: z.number().int().nullable().optional(),
  })).default([]),
});

async function nextDkmoNumber(): Promise<string> {
  const result = await db.execute(sql`SELECT next_dkmo_number() AS num`);
  return (result.rows[0] as any).num as string;
}

function membershipToApi(r: typeof dkmoMembershipsTable.$inferSelect) {
  return {
    id: r.id,
    dkmoNumber: r.dkmoNumber,
    memberId: r.memberId,
    fullName: r.fullName,
    dateOfBirth: r.dateOfBirth,
    bloodGroup: r.bloodGroup,
    maritalStatus: r.maritalStatus,
    familyInSaudi: r.familyInSaudi,
    numDependents: r.numDependents,
    passportNumber: r.passportNumber,
    iqamaNumber: r.iqamaNumber,
    occupation: r.occupation,
    companyName: r.companyName,
    mobileSaudi: r.mobileSaudi,
    email: r.email,
    areaSaudi: r.areaSaudi,
    poBox: r.poBox,
    businessPhone: r.businessPhone,
    emergencyNameSaudi: r.emergencyNameSaudi,
    emergencyMobileSaudi: r.emergencyMobileSaudi,
    houseName: r.houseName,
    postalAddress: r.postalAddress,
    district: r.district,
    nearestJamaath: r.nearestJamaath,
    homePhone: r.homePhone,
    mobileIndia: r.mobileIndia,
    emergencyNameIndia: r.emergencyNameIndia,
    emergencyMobileIndia: r.emergencyMobileIndia,
    photoUrl: r.photoUrl,
    notes: r.notes,
    refMemberName: r.refMemberName,
    refMemberId: r.refMemberId,
    status: r.status,
    declineReason: r.declineReason,
    reviewedBy: r.reviewedBy,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    approvedBy: r.approvedBy,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    rejectedBy: r.rejectedBy,
    rejectedAt: r.rejectedAt?.toISOString() ?? null,
    remarks: r.remarks,
    membershipDate: r.membershipDate,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// ── Public: apply without auth ────────────────────────────────────────────────
router.post("/dkmo/memberships/apply", async (req, res): Promise<void> => {
  const parsed = DkmoMembershipInput.omit({ status: true }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const dup = await findMembershipDuplicates({ mobileSaudi: parsed.data.mobileSaudi, email: parsed.data.email });
  if (dup.mobile || dup.email) {
    res.status(409).json(duplicateConflictBody(dup));
    return;
  }

  const dkmoNumber = await nextDkmoNumber();
  const { dependents, ...fields } = parsed.data;

  let created: typeof dkmoMembershipsTable.$inferSelect | undefined;
  try {
    [created] = await db
      .insert(dkmoMembershipsTable)
      .values({
        dkmoNumber,
        memberId: null,
        fullName: fields.fullName,
        dateOfBirth: fields.dateOfBirth ?? null,
        bloodGroup: fields.bloodGroup,
        maritalStatus: fields.maritalStatus,
        familyInSaudi: fields.familyInSaudi,
        numDependents: fields.numDependents,
        passportNumber: fields.passportNumber,
        iqamaNumber: fields.iqamaNumber,
        occupation: fields.occupation,
        companyName: fields.companyName,
        mobileSaudi: fields.mobileSaudi,
        email: fields.email,
        areaSaudi: fields.areaSaudi,
        poBox: fields.poBox,
        businessPhone: fields.businessPhone,
        emergencyNameSaudi: fields.emergencyNameSaudi,
        emergencyMobileSaudi: fields.emergencyMobileSaudi,
        houseName: fields.houseName,
        postalAddress: fields.postalAddress,
        district: fields.district,
        nearestJamaath: fields.nearestJamaath,
        homePhone: fields.homePhone,
        mobileIndia: fields.mobileIndia,
        emergencyNameIndia: fields.emergencyNameIndia,
        emergencyMobileIndia: fields.emergencyMobileIndia,
        photoUrl: fields.photoUrl ?? null,
        notes: fields.notes,
        refMemberName: fields.refMemberName,
        refMemberId: fields.refMemberId,
        status: "submitted",
      })
      .returning();
  } catch (err) {
    if (isUniqueViolation(err)) {
      const dupDb = await findMembershipDuplicates({ mobileSaudi: fields.mobileSaudi, email: fields.email });
      res.status(409).json(duplicateConflictBody(dupDb.mobile || dupDb.email ? dupDb : { mobile: true, email: false, conflicts: [] }));
      return;
    }
    throw err;
  }

  if (dependents.length > 0) {
    await db.insert(dkmoMembershipDependentsTable).values(
      dependents.map((d) => ({
        dkmoMembershipId: created!.id,
        fullName: d.fullName,
        relation: d.relation,
        age: d.age ?? null,
      })),
    );
  }

  res.status(201).json(membershipToApi(created!));
});

// ── Public: track by dkmo number or mobile ───────────────────────────────────
// Returns a minimal, non-PII status DTO only — this is an unauthenticated endpoint.
function membershipToPublicTrack(r: typeof dkmoMembershipsTable.$inferSelect) {
  return {
    dkmoNumber: r.dkmoNumber,
    fullName: r.fullName,
    status: r.status,
    declineReason: r.declineReason,
    membershipDate: r.membershipDate,
    createdAt: r.createdAt.toISOString(),
  };
}

const onlyDigits = (s: string) => s.replace(/\D/g, "");

// ── Duplicate detection ──────────────────────────────────────────────────────
// A DKMO membership account is uniquely identified by its mobile number and
// email address. Uniqueness is enforced at the database level (partial unique
// indexes) and here at the application level for instant, friendly feedback.
// Rejected applications are excluded so a rejected applicant may re-apply. The
// check intentionally ignores the sponsor / reference member, so an applicant
// cannot bypass it by choosing a different sponsor.
const DUPLICATE_MESSAGES = {
  mobile: "This mobile number is already registered with DKMO. Please use a different mobile number or contact the administrator.",
  email: "This email address is already registered with DKMO. Please use a different email address or contact the administrator.",
  both: "Both this mobile number and email address are already registered with DKMO. Please use different details or contact the administrator.",
} as const;

type DuplicateConflict = { dkmoNumber: string; fullName: string; status: string; field: "mobile" | "email" };
type DuplicateResult = { mobile: boolean; email: boolean; conflicts: DuplicateConflict[] };

async function findMembershipDuplicates(
  input: { mobileSaudi?: string; email?: string },
  excludeId?: string,
): Promise<DuplicateResult> {
  const mobileDigits = onlyDigits(input.mobileSaudi ?? "");
  const emailNorm = (input.email ?? "").trim().toLowerCase();
  if (!mobileDigits && !emailNorm) return { mobile: false, email: false, conflicts: [] };

  const rows = await db.select().from(dkmoMembershipsTable);
  const conflicts: DuplicateConflict[] = [];
  let mobile = false;
  let email = false;
  for (const r of rows) {
    if (r.status === "rejected" || r.id === excludeId) continue;
    if (mobileDigits && onlyDigits(r.mobileSaudi) === mobileDigits) {
      mobile = true;
      conflicts.push({ dkmoNumber: r.dkmoNumber, fullName: r.fullName, status: r.status, field: "mobile" });
    }
    if (emailNorm && r.email.trim().toLowerCase() === emailNorm) {
      email = true;
      conflicts.push({ dkmoNumber: r.dkmoNumber, fullName: r.fullName, status: r.status, field: "email" });
    }
  }
  return { mobile, email, conflicts };
}

function duplicateConflictBody(d: DuplicateResult) {
  const field = d.mobile && d.email ? "both" : d.mobile ? "mobile" : "email";
  return { error: DUPLICATE_MESSAGES[field], code: "DUPLICATE" as const, field, conflicts: d.conflicts };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

router.get("/dkmo/memberships/track", async (req, res): Promise<void> => {
  const dkmoNumberRaw = typeof req.query.dkmoNumber === "string" ? req.query.dkmoNumber.trim() : "";
  const mobileRaw = typeof req.query.mobile === "string" ? req.query.mobile.trim() : "";
  if (!dkmoNumberRaw && !mobileRaw) {
    res.status(400).json({ error: "Provide dkmoNumber or mobile" });
    return;
  }
  const rows = await db.select().from(dkmoMembershipsTable).orderBy(desc(dkmoMembershipsTable.createdAt));

  let filtered: typeof rows;
  if (dkmoNumberRaw) {
    const q = dkmoNumberRaw.toLowerCase();
    filtered = rows.filter((r) => r.dkmoNumber.toLowerCase() === q);
  } else {
    const q = onlyDigits(mobileRaw);
    // Require a full mobile number to avoid enumeration via partial inputs.
    if (q.length < 10) {
      res.status(400).json({ error: "Enter your full registered mobile number" });
      return;
    }
    filtered = rows.filter(
      (r) => onlyDigits(r.mobileSaudi) === q || onlyDigits(r.mobileIndia) === q,
    );
  }
  res.json(filtered.map(membershipToPublicTrack));
});

// ── Public: official certificate data (approval-gated) ───────────────────────
// Returns the data needed to build the official membership certificate, but ONLY
// when the application has been approved by an admin. This is the security gate:
// the certificate is unreachable before approval, and the payload is sourced
// directly from the database record. Identity is proven by exact dkmoNumber or a
// full registered mobile number (same matching rules as /track).
function membershipToCertificate(r: typeof dkmoMembershipsTable.$inferSelect) {
  return {
    dkmoNumber: r.dkmoNumber,
    fullName: r.fullName,
    mobile: r.mobileSaudi || r.mobileIndia || "",
    photoUrl: r.photoUrl,
    status: r.status,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    membershipDate: r.membershipDate,
    createdAt: r.createdAt.toISOString(),
  };
}

const isApprovedStatus = (s: string) => s === "approved" || s === "completed";

router.get("/dkmo/memberships/certificate", async (req, res): Promise<void> => {
  const dkmoNumberRaw = typeof req.query.dkmoNumber === "string" ? req.query.dkmoNumber.trim() : "";
  const mobileRaw = typeof req.query.mobile === "string" ? req.query.mobile.trim() : "";
  if (!dkmoNumberRaw && !mobileRaw) {
    res.status(400).json({ error: "Provide dkmoNumber or mobile" });
    return;
  }
  const rows = await db.select().from(dkmoMembershipsTable).orderBy(desc(dkmoMembershipsTable.createdAt));

  let match: typeof rows[number] | undefined;
  if (dkmoNumberRaw) {
    const q = dkmoNumberRaw.toLowerCase();
    match = rows.find((r) => r.dkmoNumber.toLowerCase() === q);
  } else {
    const q = onlyDigits(mobileRaw);
    if (q.length < 10) {
      res.status(400).json({ error: "Enter your full registered mobile number" });
      return;
    }
    match = rows.find((r) => onlyDigits(r.mobileSaudi) === q || onlyDigits(r.mobileIndia) === q);
  }

  if (!match) { res.status(404).json({ error: "No application found" }); return; }
  if (!isApprovedStatus(match.status)) {
    res.status(403).json({ error: "The official membership document is available only after your application is approved by DKMO." });
    return;
  }
  res.json(membershipToCertificate(match));
});

// ── Public: QR verification (approval-gated, minimal) ────────────────────────
// Target of the QR code printed on the certificate. Returns a minimal, non-PII
// verification record; reports an active membership only for approved records.
router.get("/dkmo/memberships/verify", async (req, res): Promise<void> => {
  const dkmoNumberRaw = typeof req.query.dkmoNumber === "string" ? req.query.dkmoNumber.trim() : "";
  if (!dkmoNumberRaw) {
    res.status(400).json({ error: "Provide dkmoNumber" });
    return;
  }
  const q = dkmoNumberRaw.toLowerCase();
  const rows = await db.select().from(dkmoMembershipsTable);
  const match = rows.find((r) => r.dkmoNumber.toLowerCase() === q);

  if (!match || !isApprovedStatus(match.status)) {
    res.json({ found: false });
    return;
  }
  res.json({
    found: true,
    fullName: match.fullName,
    membershipNumber: match.dkmoNumber,
    status: "active",
    approvedAt: match.approvedAt?.toISOString() ?? null,
  });
});

// ── Public: duplicate pre-check for the application form ─────────────────────
// Returns only booleans (no PII) so the form can warn the applicant instantly.
router.get("/dkmo/memberships/check-duplicate", async (req, res): Promise<void> => {
  const mobile = typeof req.query.mobile === "string" ? req.query.mobile : "";
  const email = typeof req.query.email === "string" ? req.query.email : "";
  // Avoid enumeration via partial inputs: only check a full mobile / a real email.
  const mobileToCheck = onlyDigits(mobile).length >= 10 ? mobile : "";
  const emailToCheck = email.includes("@") ? email : "";
  const dup = await findMembershipDuplicates({ mobileSaudi: mobileToCheck, email: emailToCheck });
  res.json({ mobileExists: dup.mobile, emailExists: dup.email });
});

// ── Public: member lookup list for reference member dropdown ─────────────────
router.get("/dkmo/members-list", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ id: membersTable.id, fullName: membersTable.fullName, membershipId: membersTable.membershipId })
    .from(membersTable)
    .orderBy(membersTable.fullName);
  res.json(rows);
});

// ── Auth required below ───────────────────────────────────────────────────────
router.use(requireAuth);

router.get("/dkmo/memberships/stats", async (_req, res): Promise<void> => {
  const rows = await db.select().from(dkmoMembershipsTable);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const total = rows.length;
  const pending = rows.filter((r) => r.status === "submitted" || r.status === "under_review").length;
  const approved = rows.filter((r) => r.status === "approved" || r.status === "completed").length;
  const rejected = rows.filter((r) => r.status === "rejected").length;
  const newThisMonth = rows.filter((r) => {
    const m = `${r.createdAt.getFullYear()}-${String(r.createdAt.getMonth() + 1).padStart(2, "0")}`;
    return m === currentMonth;
  }).length;
  res.json({ total, pending, approved, rejected, newThisMonth });
});

// ── Admin: duplicate detection dashboard data ────────────────────────────────
// Groups membership records that share the same mobile number or email so an
// admin can review and clean them up. Includes every status (even rejected) so
// historical overlaps remain visible.
router.get("/dkmo/memberships/duplicates", requireRole("admin"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(dkmoMembershipsTable).orderBy(desc(dkmoMembershipsTable.createdAt));
  const toMini = (r: typeof rows[number]) => ({
    id: r.id,
    dkmoNumber: r.dkmoNumber,
    fullName: r.fullName,
    mobileSaudi: r.mobileSaudi,
    mobileIndia: r.mobileIndia,
    email: r.email,
    status: r.status,
    memberId: r.memberId,
    createdAt: r.createdAt.toISOString(),
  });
  const byMobile = new Map<string, typeof rows>();
  const byEmail = new Map<string, typeof rows>();
  for (const r of rows) {
    const m = onlyDigits(r.mobileSaudi);
    if (m) { const list = byMobile.get(m) ?? []; list.push(r); byMobile.set(m, list); }
    const e = r.email.trim().toLowerCase();
    if (e) { const list = byEmail.get(e) ?? []; list.push(r); byEmail.set(e, list); }
  }
  const groups: Array<{ type: "mobile" | "email"; value: string; count: number; records: ReturnType<typeof toMini>[] }> = [];
  for (const [value, rs] of byMobile) if (rs.length > 1) groups.push({ type: "mobile", value, count: rs.length, records: rs.map(toMini) });
  for (const [value, rs] of byEmail) if (rs.length > 1) groups.push({ type: "email", value, count: rs.length, records: rs.map(toMini) });
  res.json(groups);
});

router.get("/dkmo/memberships", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(dkmoMembershipsTable)
    .orderBy(desc(dkmoMembershipsTable.createdAt));

  const { q, status } = req.query as Record<string, string>;
  let filtered = rows;

  if (status && status !== "all") {
    filtered = filtered.filter((r) => r.status === status);
  }
  if (q) {
    const lq = q.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.fullName.toLowerCase().includes(lq) ||
        r.dkmoNumber.toLowerCase().includes(lq) ||
        r.mobileSaudi.includes(lq) ||
        r.mobileIndia.includes(lq) ||
        r.email.toLowerCase().includes(lq),
    );
  }
  res.json(filtered.map(membershipToApi));
});

router.post("/dkmo/memberships", async (req, res): Promise<void> => {
  const parsed = DkmoMembershipInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const dupAdmin = await findMembershipDuplicates({ mobileSaudi: parsed.data.mobileSaudi, email: parsed.data.email });
  if (dupAdmin.mobile || dupAdmin.email) {
    res.status(409).json(duplicateConflictBody(dupAdmin));
    return;
  }
  const dkmoNumber = await nextDkmoNumber();
  const { dependents, ...fields } = parsed.data;

  let created: typeof dkmoMembershipsTable.$inferSelect | undefined;
  try {
    [created] = await db
      .insert(dkmoMembershipsTable)
      .values({
        dkmoNumber,
        memberId: null,
        fullName: fields.fullName,
        dateOfBirth: fields.dateOfBirth ?? null,
        bloodGroup: fields.bloodGroup,
        maritalStatus: fields.maritalStatus,
        familyInSaudi: fields.familyInSaudi,
        numDependents: fields.numDependents,
        passportNumber: fields.passportNumber,
        iqamaNumber: fields.iqamaNumber,
        occupation: fields.occupation,
        companyName: fields.companyName,
        mobileSaudi: fields.mobileSaudi,
        email: fields.email,
        areaSaudi: fields.areaSaudi,
        poBox: fields.poBox,
        businessPhone: fields.businessPhone,
        emergencyNameSaudi: fields.emergencyNameSaudi,
        emergencyMobileSaudi: fields.emergencyMobileSaudi,
        houseName: fields.houseName,
        postalAddress: fields.postalAddress,
        district: fields.district,
        nearestJamaath: fields.nearestJamaath,
        homePhone: fields.homePhone,
        mobileIndia: fields.mobileIndia,
        emergencyNameIndia: fields.emergencyNameIndia,
        emergencyMobileIndia: fields.emergencyMobileIndia,
        photoUrl: fields.photoUrl ?? null,
        notes: fields.notes,
        refMemberName: fields.refMemberName,
        refMemberId: fields.refMemberId,
        status: fields.status,
      })
      .returning();
  } catch (err) {
    if (isUniqueViolation(err)) {
      const dupDb = await findMembershipDuplicates({ mobileSaudi: fields.mobileSaudi, email: fields.email });
      res.status(409).json(duplicateConflictBody(dupDb.mobile || dupDb.email ? dupDb : { mobile: true, email: false, conflicts: [] }));
      return;
    }
    throw err;
  }

  if (dependents.length > 0) {
    await db.insert(dkmoMembershipDependentsTable).values(
      dependents.map((d) => ({
        dkmoMembershipId: created!.id,
        fullName: d.fullName,
        relation: d.relation,
        age: d.age ?? null,
      })),
    );
  }

  res.status(201).json(membershipToApi(created!));
});

router.get("/dkmo/memberships/:id", async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  const rows = await db.select().from(dkmoMembershipsTable).where(eq(dkmoMembershipsTable.id, id));
  if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  const deps = await db.select().from(dkmoMembershipDependentsTable).where(eq(dkmoMembershipDependentsTable.dkmoMembershipId, id));
  res.json({
    ...membershipToApi(rows[0]),
    dependents: deps.map((d) => ({ id: d.id, fullName: d.fullName, relation: d.relation, age: d.age, createdAt: d.createdAt.toISOString() })),
  });
});

router.patch("/dkmo/memberships/:id", async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  const parsed = DkmoMembershipInput.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { dependents, ...fields } = parsed.data;

  // Block both (a) editing contact details into a collision and (b) re-activating
  // a previously rejected record whose mobile/email now collides with an active
  // one — the latter would otherwise only be caught by the DB unique index.
  const willChangeContact = fields.mobileSaudi !== undefined || fields.email !== undefined;
  const willActivate = fields.status !== undefined && fields.status !== "rejected";
  if (willChangeContact || willActivate) {
    const [current] = await db.select().from(dkmoMembershipsTable).where(eq(dkmoMembershipsTable.id, id));
    if (!current) { res.status(404).json({ error: "Not found" }); return; }
    const effectiveStatus = fields.status ?? current.status;
    if (effectiveStatus !== "rejected") {
      const dup = await findMembershipDuplicates(
        {
          mobileSaudi: fields.mobileSaudi ?? current.mobileSaudi,
          email: fields.email ?? current.email,
        },
        id,
      );
      if (dup.mobile || dup.email) {
        res.status(409).json(duplicateConflictBody(dup));
        return;
      }
    }
  }

  const now = new Date();
  const actor = (req as AuthedRequest).userId ?? "";

  let statusExtras: Record<string, unknown> = {};
  if (fields.status === "under_review") statusExtras = { reviewedBy: actor, reviewedAt: now };
  if (fields.status === "approved") statusExtras = { approvedBy: actor, approvedAt: now };
  if (fields.status === "rejected") statusExtras = { rejectedBy: actor, rejectedAt: now };

  let updated: typeof dkmoMembershipsTable.$inferSelect | undefined;
  try {
    [updated] = await db
    .update(dkmoMembershipsTable)
    .set({
      ...(fields.fullName !== undefined && { fullName: fields.fullName }),
      ...(fields.dateOfBirth !== undefined && { dateOfBirth: fields.dateOfBirth ?? null }),
      ...(fields.bloodGroup !== undefined && { bloodGroup: fields.bloodGroup }),
      ...(fields.maritalStatus !== undefined && { maritalStatus: fields.maritalStatus }),
      ...(fields.familyInSaudi !== undefined && { familyInSaudi: fields.familyInSaudi }),
      ...(fields.numDependents !== undefined && { numDependents: fields.numDependents }),
      ...(fields.passportNumber !== undefined && { passportNumber: fields.passportNumber }),
      ...(fields.iqamaNumber !== undefined && { iqamaNumber: fields.iqamaNumber }),
      ...(fields.occupation !== undefined && { occupation: fields.occupation }),
      ...(fields.companyName !== undefined && { companyName: fields.companyName }),
      ...(fields.mobileSaudi !== undefined && { mobileSaudi: fields.mobileSaudi }),
      ...(fields.email !== undefined && { email: fields.email }),
      ...(fields.areaSaudi !== undefined && { areaSaudi: fields.areaSaudi }),
      ...(fields.poBox !== undefined && { poBox: fields.poBox }),
      ...(fields.businessPhone !== undefined && { businessPhone: fields.businessPhone }),
      ...(fields.emergencyNameSaudi !== undefined && { emergencyNameSaudi: fields.emergencyNameSaudi }),
      ...(fields.emergencyMobileSaudi !== undefined && { emergencyMobileSaudi: fields.emergencyMobileSaudi }),
      ...(fields.houseName !== undefined && { houseName: fields.houseName }),
      ...(fields.postalAddress !== undefined && { postalAddress: fields.postalAddress }),
      ...(fields.district !== undefined && { district: fields.district }),
      ...(fields.nearestJamaath !== undefined && { nearestJamaath: fields.nearestJamaath }),
      ...(fields.homePhone !== undefined && { homePhone: fields.homePhone }),
      ...(fields.mobileIndia !== undefined && { mobileIndia: fields.mobileIndia }),
      ...(fields.emergencyNameIndia !== undefined && { emergencyNameIndia: fields.emergencyNameIndia }),
      ...(fields.emergencyMobileIndia !== undefined && { emergencyMobileIndia: fields.emergencyMobileIndia }),
      ...(fields.photoUrl !== undefined && { photoUrl: fields.photoUrl ?? null }),
      ...(fields.notes !== undefined && { notes: fields.notes }),
      ...(fields.refMemberName !== undefined && { refMemberName: fields.refMemberName }),
      ...(fields.refMemberId !== undefined && { refMemberId: fields.refMemberId }),
      ...(fields.status !== undefined && { status: fields.status }),
      ...(fields.declineReason !== undefined && { declineReason: fields.declineReason ?? null }),
      ...(fields.remarks !== undefined && { remarks: fields.remarks }),
      ...(fields.membershipDate !== undefined && { membershipDate: fields.membershipDate ?? null }),
      ...statusExtras,
      updatedAt: now,
    })
    .where(eq(dkmoMembershipsTable.id, id))
    .returning();
  } catch (err) {
    // Race backstop: a concurrent insert/update may trip the partial unique
    // index even though the pre-check passed. Map it to the same friendly 409.
    if (isUniqueViolation(err)) {
      const dup = await findMembershipDuplicates(
        { mobileSaudi: fields.mobileSaudi, email: fields.email },
        id,
      );
      const body = dup.mobile || dup.email
        ? duplicateConflictBody(dup)
        : { error: DUPLICATE_MESSAGES.both, code: "DUPLICATE" as const, field: "both" as const, conflicts: [] };
      res.status(409).json(body);
      return;
    }
    throw err;
  }

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  // On approval, create a member record (if not already linked) and carry the
  // reference member over from the application.
  if (fields.status === "approved" && !updated.memberId) {
    try {
      const [createdMember] = await db
        .insert(membersTable)
        .values({
          fullName: updated.fullName,
          mobileNumber: updated.mobileSaudi || updated.mobileIndia || "",
          membershipId: updated.dkmoNumber,
          city: updated.areaSaudi || updated.district || "",
          country: "Saudi Arabia",
          designation: updated.occupation || "",
          membershipFee: "100",
          feeStatus: "unpaid",
          refMemberName: updated.refMemberName,
          refMemberId: updated.refMemberId,
        })
        .returning();
      if (createdMember) {
        await db
          .update(dkmoMembershipsTable)
          .set({ memberId: createdMember.id, updatedAt: now })
          .where(eq(dkmoMembershipsTable.id, id));
        updated.memberId = createdMember.id;
      }
    } catch (err) {
      // A member with this membershipId may already exist; log and continue.
      req.log.warn({ err }, "Failed to auto-create member on approval");
    }
  }

  if (dependents !== undefined) {
    await db.delete(dkmoMembershipDependentsTable).where(eq(dkmoMembershipDependentsTable.dkmoMembershipId, id));
    if (dependents.length > 0) {
      await db.insert(dkmoMembershipDependentsTable).values(
        dependents.map((d) => ({
          dkmoMembershipId: id,
          fullName: d.fullName,
          relation: d.relation,
          age: d.age ?? null,
        })),
      );
    }
  }

  res.json(membershipToApi(updated));
});

router.delete("/dkmo/memberships/:id", async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  await db.delete(dkmoMembershipsTable).where(eq(dkmoMembershipsTable.id, id));
  res.status(204).end();
});

export default router;
