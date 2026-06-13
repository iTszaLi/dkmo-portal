import { Router, type IRouter } from "express";
import { eq, desc, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, frfMembershipsTable, frfDependentsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const DependentInput = z.object({
  fullName: z.string().min(1),
  relation: z.string().default(""),
  age: z.number().int().optional().nullable(),
});

const FrfMembershipInput = z.object({
  memberId: z.string().uuid().optional().nullable(),
  fullName: z.string().min(1),
  dateOfBirth: z.string().optional().nullable(),
  bloodGroup: z.string().default(""),
  maritalStatus: z.string().default(""),
  numDependents: z.number().int().default(0),
  passportNumber: z.string().default(""),
  iqamaNumber: z.string().default(""),
  occupation: z.string().default(""),
  companyName: z.string().default(""),
  mobileSaudi: z.string().default(""),
  mobileIndia: z.string().default(""),
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
  emergencyNameIndia: z.string().default(""),
  emergencyMobileIndia: z.string().default(""),
  nomineeName: z.string().default(""),
  nomineeRelation: z.string().default(""),
  nomineeMobile: z.string().default(""),
  status: z.enum(["submitted", "under_review", "approved", "rejected", "completed"]).default("submitted"),
  photoUrl: z.string().optional().nullable(),
  notes: z.string().default(""),
  dependents: z.array(DependentInput).default([]),
});

async function nextFrfNumber(): Promise<string> {
  const result = await db.execute(sql`SELECT next_frf_number() AS num`);
  return (result.rows[0] as any).num as string;
}

function membershipToApi(m: typeof frfMembershipsTable.$inferSelect) {
  return {
    id: m.id,
    frfNumber: m.frfNumber,
    memberId: m.memberId,
    fullName: m.fullName,
    dateOfBirth: m.dateOfBirth,
    bloodGroup: m.bloodGroup,
    maritalStatus: m.maritalStatus,
    numDependents: m.numDependents,
    passportNumber: m.passportNumber,
    iqamaNumber: m.iqamaNumber,
    occupation: m.occupation,
    companyName: m.companyName,
    mobileSaudi: m.mobileSaudi,
    mobileIndia: m.mobileIndia,
    email: m.email,
    areaSaudi: m.areaSaudi,
    poBox: m.poBox,
    businessPhone: m.businessPhone,
    emergencyNameSaudi: m.emergencyNameSaudi,
    emergencyMobileSaudi: m.emergencyMobileSaudi,
    houseName: m.houseName,
    postalAddress: m.postalAddress,
    district: m.district,
    nearestJamaath: m.nearestJamaath,
    homePhone: m.homePhone,
    emergencyNameIndia: m.emergencyNameIndia,
    emergencyMobileIndia: m.emergencyMobileIndia,
    nomineeName: m.nomineeName,
    nomineeRelation: m.nomineeRelation,
    nomineeMobile: m.nomineeMobile,
    status: m.status,
    photoUrl: m.photoUrl,
    notes: m.notes,
    membershipDate: m.membershipDate,
    renewalDate: m.renewalDate,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

// Public endpoint — no auth required, for the public FRF apply page
router.post("/frf/memberships/apply", async (req, res): Promise<void> => {
  const parsed = FrfMembershipInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const frfNumber = await nextFrfNumber();
  const { dependents, ...fields } = parsed.data;

  const [created] = await db
    .insert(frfMembershipsTable)
    .values({
      frfNumber,
      memberId: fields.memberId ?? null,
      fullName: fields.fullName,
      dateOfBirth: fields.dateOfBirth ?? null,
      bloodGroup: fields.bloodGroup,
      maritalStatus: fields.maritalStatus,
      numDependents: fields.numDependents,
      passportNumber: fields.passportNumber,
      iqamaNumber: fields.iqamaNumber,
      occupation: fields.occupation,
      companyName: fields.companyName,
      mobileSaudi: fields.mobileSaudi,
      mobileIndia: fields.mobileIndia,
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
      emergencyNameIndia: fields.emergencyNameIndia,
      emergencyMobileIndia: fields.emergencyMobileIndia,
      nomineeName: fields.nomineeName,
      nomineeRelation: fields.nomineeRelation,
      nomineeMobile: fields.nomineeMobile,
      status: "submitted",
      photoUrl: fields.photoUrl ?? null,
      notes: fields.notes,
    })
    .returning();

  if (dependents.length > 0) {
    await db.insert(frfDependentsTable).values(
      dependents.map((d) => ({
        frfMembershipId: created!.id,
        fullName: d.fullName,
        relation: d.relation,
        age: d.age ?? null,
      })),
    );
  }

  res.status(201).json(membershipToApi(created!));
});

// Public endpoint — track application by FRF number or mobile
router.get("/frf/memberships/track", async (req, res): Promise<void> => {
  const { frfNumber, mobile } = req.query;
  if (!frfNumber && !mobile) {
    res.status(400).json({ error: "Provide frfNumber or mobile" });
    return;
  }

  let rows = [];
  if (frfNumber) {
    rows = await db
      .select()
      .from(frfMembershipsTable)
      .where(eq(frfMembershipsTable.frfNumber, String(frfNumber)));
  } else {
    rows = await db
      .select()
      .from(frfMembershipsTable)
      .where(
        or(
          eq(frfMembershipsTable.mobileSaudi, String(mobile)),
          eq(frfMembershipsTable.mobileIndia, String(mobile)),
        )!,
      );
  }

  res.json(
    rows.map((r) => ({
      frfNumber: r.frfNumber,
      fullName: r.fullName,
      status: r.status,
      membershipDate: r.membershipDate,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

// All routes below require auth
router.use(requireAuth);

router.get("/frf/memberships", async (req, res): Promise<void> => {
  const { search, status } = req.query;
  let rows = await db
    .select()
    .from(frfMembershipsTable)
    .orderBy(desc(frfMembershipsTable.createdAt));

  if (status && typeof status === "string") {
    rows = rows.filter((r) => r.status === status);
  }

  if (search && typeof search === "string") {
    const q = search.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.frfNumber.toLowerCase().includes(q) ||
        r.fullName.toLowerCase().includes(q) ||
        r.mobileSaudi.includes(q) ||
        r.mobileIndia.includes(q) ||
        r.passportNumber.toLowerCase().includes(q) ||
        r.iqamaNumber.toLowerCase().includes(q),
    );
  }

  res.json(rows.map(membershipToApi));
});

router.post("/frf/memberships", async (req, res): Promise<void> => {
  const parsed = FrfMembershipInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const frfNumber = await nextFrfNumber();
  const { dependents, ...fields } = parsed.data;

  const [created] = await db
    .insert(frfMembershipsTable)
    .values({
      frfNumber,
      memberId: fields.memberId ?? null,
      fullName: fields.fullName,
      dateOfBirth: fields.dateOfBirth ?? null,
      bloodGroup: fields.bloodGroup,
      maritalStatus: fields.maritalStatus,
      numDependents: fields.numDependents,
      passportNumber: fields.passportNumber,
      iqamaNumber: fields.iqamaNumber,
      occupation: fields.occupation,
      companyName: fields.companyName,
      mobileSaudi: fields.mobileSaudi,
      mobileIndia: fields.mobileIndia,
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
      emergencyNameIndia: fields.emergencyNameIndia,
      emergencyMobileIndia: fields.emergencyMobileIndia,
      nomineeName: fields.nomineeName,
      nomineeRelation: fields.nomineeRelation,
      nomineeMobile: fields.nomineeMobile,
      status: fields.status,
      photoUrl: fields.photoUrl ?? null,
      notes: fields.notes,
    })
    .returning();

  if (dependents.length > 0) {
    await db.insert(frfDependentsTable).values(
      dependents.map((d) => ({
        frfMembershipId: created!.id,
        fullName: d.fullName,
        relation: d.relation,
        age: d.age ?? null,
      })),
    );
  }

  res.status(201).json(membershipToApi(created!));
});

router.get("/frf/memberships/stats", async (req, res): Promise<void> => {
  const rows = await db.select().from(frfMembershipsTable);
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

router.get("/frf/memberships/:id", async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  const rows = await db.select().from(frfMembershipsTable).where(eq(frfMembershipsTable.id, id));
  if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }

  const dependents = await db
    .select()
    .from(frfDependentsTable)
    .where(eq(frfDependentsTable.frfMembershipId, id));

  res.json({
    ...membershipToApi(rows[0]),
    dependents: dependents.map((d) => ({
      id: d.id, fullName: d.fullName, relation: d.relation, age: d.age, createdAt: d.createdAt.toISOString(),
    })),
  });
});

router.patch("/frf/memberships/:id", async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  const parsed = FrfMembershipInput.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { dependents, ...fields } = parsed.data;

  const [updated] = await db
    .update(frfMembershipsTable)
    .set({
      ...(fields.fullName !== undefined && { fullName: fields.fullName }),
      ...(fields.dateOfBirth !== undefined && { dateOfBirth: fields.dateOfBirth ?? null }),
      ...(fields.bloodGroup !== undefined && { bloodGroup: fields.bloodGroup }),
      ...(fields.maritalStatus !== undefined && { maritalStatus: fields.maritalStatus }),
      ...(fields.numDependents !== undefined && { numDependents: fields.numDependents }),
      ...(fields.passportNumber !== undefined && { passportNumber: fields.passportNumber }),
      ...(fields.iqamaNumber !== undefined && { iqamaNumber: fields.iqamaNumber }),
      ...(fields.occupation !== undefined && { occupation: fields.occupation }),
      ...(fields.companyName !== undefined && { companyName: fields.companyName }),
      ...(fields.mobileSaudi !== undefined && { mobileSaudi: fields.mobileSaudi }),
      ...(fields.mobileIndia !== undefined && { mobileIndia: fields.mobileIndia }),
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
      ...(fields.emergencyNameIndia !== undefined && { emergencyNameIndia: fields.emergencyNameIndia }),
      ...(fields.emergencyMobileIndia !== undefined && { emergencyMobileIndia: fields.emergencyMobileIndia }),
      ...(fields.nomineeName !== undefined && { nomineeName: fields.nomineeName }),
      ...(fields.nomineeRelation !== undefined && { nomineeRelation: fields.nomineeRelation }),
      ...(fields.nomineeMobile !== undefined && { nomineeMobile: fields.nomineeMobile }),
      ...(fields.status !== undefined && { status: fields.status }),
      ...(fields.photoUrl !== undefined && { photoUrl: fields.photoUrl ?? null }),
      ...(fields.notes !== undefined && { notes: fields.notes }),
      updatedAt: new Date(),
    })
    .where(eq(frfMembershipsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(membershipToApi(updated));
});

router.delete("/frf/memberships/:id", async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  await db.delete(frfMembershipsTable).where(eq(frfMembershipsTable.id, id));
  res.status(204).end();
});

router.post("/frf/memberships/:id/dependents", async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  const parsed = DependentInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [dep] = await db
    .insert(frfDependentsTable)
    .values({ frfMembershipId: id, fullName: parsed.data.fullName, relation: parsed.data.relation, age: parsed.data.age ?? null })
    .returning();

  res.status(201).json({ id: dep!.id, fullName: dep!.fullName, relation: dep!.relation, age: dep!.age, createdAt: dep!.createdAt.toISOString() });
});

router.delete("/frf/dependents/:id", async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  await db.delete(frfDependentsTable).where(eq(frfDependentsTable.id, id));
  res.status(204).end();
});

export default router;
