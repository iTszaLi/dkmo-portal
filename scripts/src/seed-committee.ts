import {
  committeeAssignmentsTable,
  committeeTermsTable,
  db,
  membersTable,
  pool,
} from "@workspace/db";
import { and, eq, inArray, lt, ne, sql } from "drizzle-orm";

const TERM = {
  committeeYear: "2026-27",
  startDate: "2026-01-01",
  endDate: "2027-12-31",
  isActive: true,
} as const;

type RosterEntry = {
  fullName: string;
  position: string;
  existingMembershipId?: string;
};

// This is the authoritative 2026–27 committee list. Existing identities are
// matched by their preserved DKMO ID; names not present in the member registry
// receive a new DKMO identity in the same transaction, without duplicating any
// existing committee member.
const ROSTER: RosterEntry[] = [
  { fullName: "Fazlurrahman Kolkar", position: "President" },
  { fullName: "Mohammed Asif Kannur", position: "Vice President", existingMembershipId: "DKMO-0072" },
  { fullName: "Irshad Bajpe", position: "General Secretary" },
  { fullName: "Abdul Rahiman Sulaiman", position: "Treasurer" },
  { fullName: "Sameen Khan Ummer", position: "Joint Secretary", existingMembershipId: "DKMO-0984" },
  { fullName: "Abdul Azeez Bajpe", position: "Overseas Convenor", existingMembershipId: "DKMO-1115" },
  { fullName: "Salman Noor", position: "Advisor", existingMembershipId: "DKMO-0200" },
  { fullName: "G.K. Shaikh", position: "Advisor" },
  { fullName: "Haneef B.K.", position: "Advisor" },
  { fullName: "Ghani Ahmed Mulki", position: "Loan Convenor", existingMembershipId: "DKMO-0247" },
  { fullName: "Shamsuddin Addoor", position: "Loan Convenor (Recovery)" },
  { fullName: "Yousuf Addoor", position: "Auditor" },
  { fullName: "Irfan Shaikh", position: "Verification Team Leader" },
  { fullName: "Ashraf Kozhikan", position: "Event Organizer" },
  { fullName: "Shareef Thokur", position: "Event Organizer", existingMembershipId: "DKMO-0105" },
  { fullName: "Hameed Nazeer", position: "Event Organizer" },
  { fullName: "Nazeer Hassan", position: "Event Organizer" },
  { fullName: "Sadiq Ahmed Udupi", position: "Employment Scheme" },
  { fullName: "Akhil Ganjimutt", position: "Employment Scheme" },
  { fullName: "Ashraf Sheikh Koteshwar", position: "FRF Convenor" },
  { fullName: "Mohammed Haris Byndoor", position: "FRF Convenor" },
  { fullName: "Haneef N.S.", position: "Executive Member", existingMembershipId: "DKMO-0068" },
  { fullName: "Zia Ganjimutt", position: "Executive Member" },
  { fullName: "Razik Bajpe", position: "Executive Member" },
  { fullName: "Yousuf Kalanjibail", position: "Executive Member", existingMembershipId: "DKMO-1159" },
  { fullName: "Shaul Hameed", position: "Executive Member" },
  { fullName: "Nayaz Ahmed", position: "Executive Member" },
  { fullName: "Abdul Majeed Vittal", position: "Executive Member" },
  { fullName: "Rafee Hameed Uchchila", position: "Executive Member" },
  { fullName: "Mohammed Ali Kolkar", position: "Executive Member" },
];

const permissionsFor = (position: string): string[] => {
  const permissions = ["committee_participation", "meetings", "committee_records"];
  if (position.includes("Loan")) permissions.push("loans");
  if (position === "Treasurer" || position === "Auditor") permissions.push("finance");
  if (position === "Event Organizer") permissions.push("events");
  if (position === "Overseas Convenor") permissions.push("overseas_coordination");
  if (position === "FRF Convenor") permissions.push("frf");
  if (position === "Employment Scheme") permissions.push("employment_scheme");
  return permissions;
};

async function nextMembershipId(tx: any): Promise<string> {
  const result = await tx.execute(sql`SELECT next_dkmo_number() AS membership_id`);
  const value = (result as { rows?: Array<{ membership_id?: string }> }).rows?.[0]?.membership_id;
  if (!value) throw new Error("Unable to allocate a DKMO membership ID");
  return value;
}

async function main() {
  if (ROSTER.length !== 30) throw new Error(`Expected 30 committee members, found ${ROSTER.length}`);

  await db.transaction(async (tx) => {
    const activeTerms = await tx
      .select({
        committeeYear: committeeTermsTable.committeeYear,
        startDate: committeeTermsTable.startDate,
      })
      .from(committeeTermsTable)
      .where(eq(committeeTermsTable.isActive, true));
    const newerActiveTerm = activeTerms.find(
      (term) => term.committeeYear !== TERM.committeeYear && term.startDate >= TERM.startDate,
    );
    if (newerActiveTerm) {
      throw new Error(
        `Refusing to reactivate ${TERM.committeeYear}; newer active term `
        + `${newerActiveTerm.committeeYear} starts ${newerActiveTerm.startDate}`,
      );
    }

    await tx
      .update(committeeTermsTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        ne(committeeTermsTable.committeeYear, TERM.committeeYear),
        lt(committeeTermsTable.startDate, TERM.startDate),
      ));

    const [term] = await tx
      .insert(committeeTermsTable)
      .values(TERM)
      .onConflictDoUpdate({
        target: committeeTermsTable.committeeYear,
        set: { ...TERM, updatedAt: new Date() },
      })
      .returning();
    if (!term) throw new Error("Failed to upsert committee term 2026-27");

    const existingIds = ROSTER
      .map((entry) => entry.existingMembershipId)
      .filter((id): id is string => Boolean(id));
    const existingByMembershipId = new Map(
      (await tx
        .select({ id: membersTable.id, membershipId: membersTable.membershipId, fullName: membersTable.fullName })
        .from(membersTable)
        .where(inArray(membersTable.membershipId, existingIds)))
        .map((member) => [member.membershipId, member]),
    );

    for (const entry of ROSTER) {
      let member = entry.existingMembershipId
        ? existingByMembershipId.get(entry.existingMembershipId)
        : undefined;
      if (entry.existingMembershipId && !member) {
        throw new Error(`Expected existing member ${entry.existingMembershipId} for ${entry.fullName}`);
      }

      if (!member) {
        const [sameName] = await tx
          .select({ id: membersTable.id, membershipId: membersTable.membershipId, fullName: membersTable.fullName })
          .from(membersTable)
          .where(eq(membersTable.fullName, entry.fullName))
          .limit(1);
        member = sameName;
      }

      if (!member) {
        const membershipId = await nextMembershipId(tx);
        [member] = await tx
          .insert(membersTable)
          .values({
            fullName: entry.fullName,
            mobileNumber: "",
            membershipId,
            designation: entry.position,
            membershipFee: "0",
            feeStatus: "not_applicable",
            notes: "Authoritative 2026–27 committee record; created without Access member history.",
          })
          .returning({
            id: membersTable.id,
            membershipId: membersTable.membershipId,
            fullName: membersTable.fullName,
          });
      } else if (member.fullName !== entry.fullName) {
        // The eight previously confirmed records had minor display-name
        // differences. Keep their identity/ID and align the committee display
        // name with the latest authoritative roster.
        [member] = await tx
          .update(membersTable)
          .set({ fullName: entry.fullName, designation: entry.position, updatedAt: new Date() })
          .where(eq(membersTable.id, member.id))
          .returning({
            id: membersTable.id,
            membershipId: membersTable.membershipId,
            fullName: membersTable.fullName,
          });
      }

      await tx
        .insert(committeeAssignmentsTable)
        .values({
          memberId: member.id,
          position: entry.position,
          permissions: permissionsFor(entry.position),
          termId: term.id,
          startDate: TERM.startDate,
          endDate: TERM.endDate,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: [committeeAssignmentsTable.termId, committeeAssignmentsTable.memberId],
          set: {
            position: entry.position,
            startDate: TERM.startDate,
            endDate: TERM.endDate,
            isActive: true,
            permissions: permissionsFor(entry.position),
            updatedAt: new Date(),
          },
        });
    }
  });
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error("Committee seed failed:", error);
    await pool.end();
    process.exit(1);
  });