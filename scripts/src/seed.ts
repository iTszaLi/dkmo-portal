import { eq } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import {
  membersTable,
  paymentsTable,
  eventsTable,
  sponsorsTable,
  tasksTable,
  frfClaimsTable,
  frfContributionsTable,
  loansTable,
  receiptsTable,
  eventSponsorsTable,
  eventExpensesTable,
  eventTicketBookletsTable,
  eventTicketsTable,
  auditLogsTable,
  meetingsTable,
  meetingAttendanceTable,
} from "@workspace/db";

// ── helpers ──────────────────────────────────────────────────────────────────
function monthsBack(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function dateStrAgo(n: number): string {
  return daysAgo(n).toISOString().split("T")[0];
}
function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Maps a designation to seeded committee membership. Executive Committee and
// Core Committee are two fully independent flags. Office-bearers and the literal
// "Executive Member" role are seeded as both Executive + Core; any other real
// committee role (convenors, advisors, auditors, leads) is seeded as Core only;
// plain "Member" (or blank) is on neither committee. Admins can freely toggle
// each flag afterwards — there is no enforced link between them.
const EXECUTIVE_DESIGNATIONS = new Set([
  "President",
  "Vice President",
  "General Secretary",
  "Joint Secretary",
  "Treasurer",
  "Executive Member",
]);
function committeeStatusForDesignation(designation: string): {
  isExecutiveCommittee: boolean;
  isCoreCommittee: boolean;
} {
  const d = (designation ?? "").trim();
  if (EXECUTIVE_DESIGNATIONS.has(d)) {
    return { isExecutiveCommittee: true, isCoreCommittee: true };
  }
  if (d === "" || d.toLowerCase() === "member") {
    return { isExecutiveCommittee: false, isCoreCommittee: false };
  }
  return { isExecutiveCommittee: false, isCoreCommittee: true };
}

// ── 1. MEMBERS ────────────────────────────────────────────────────────────────
const memberRows = [
  { fullName: "Fazlurrahman Kolkar",     designation: "President",                 city: "Kolkar",       country: "Saudi Arabia", mobileNumber: "+919844100001" },
  { fullName: "Asif Kannur",             designation: "Vice President",            city: "Kannur",       country: "Saudi Arabia", mobileNumber: "+919844100002" },
  { fullName: "Irshad Bajpe",            designation: "General Secretary",         city: "Bajpe",        country: "Saudi Arabia", mobileNumber: "+919844100003" },
  { fullName: "Abdul Rahiman Sulaiman",  designation: "Treasurer",                 city: "Mangalore",    country: "Saudi Arabia", mobileNumber: "+919844100004" },
  { fullName: "Sameen Khan Ummer",       designation: "Joint Secretary",           city: "Mangalore",    country: "Saudi Arabia", mobileNumber: "+919844100005" },
  { fullName: "Abdul Azeez Bajpe",       designation: "Overseas Convenor",         city: "Bajpe",        country: "Saudi Arabia", mobileNumber: "+919844100006" },
  { fullName: "Salman Noor",             designation: "Advisor",                   city: "Mangalore",    country: "Saudi Arabia", mobileNumber: "+919844100007" },
  { fullName: "G.K. Shaikh",             designation: "Advisor",                   city: "Mangalore",    country: "India",        mobileNumber: "+919844100008" },
  { fullName: "Haneef B.K.",             designation: "Advisor",                   city: "Mangalore",    country: "India",        mobileNumber: "+919844100009" },
  { fullName: "Ghani Ahmed Mulki",       designation: "Loan Convenor",            city: "Mulki",        country: "Saudi Arabia", mobileNumber: "+919844100010" },
  { fullName: "Shamsuddin Addoor",       designation: "Loan Convenor (Recovery)", city: "Addoor",       country: "Saudi Arabia", mobileNumber: "+919844100011" },
  { fullName: "Yousuf Addoor",           designation: "Auditor",                   city: "Addoor",       country: "Saudi Arabia", mobileNumber: "+919844100012" },
  { fullName: "Irfan Shaikh",            designation: "Verification Team Leader", city: "Mangalore",    country: "Saudi Arabia", mobileNumber: "+919844100013" },
  { fullName: "Ashraf Kozhikan",         designation: "Event Organizer",          city: "Kozhikode",    country: "Saudi Arabia", mobileNumber: "+919844100014" },
  { fullName: "Shareef Thokur",          designation: "Event Organizer",          city: "Thokur",       country: "Saudi Arabia", mobileNumber: "+919844100015" },
  { fullName: "Hameed Nazeer",           designation: "Event Organizer",          city: "Mangalore",    country: "Saudi Arabia", mobileNumber: "+919844100016" },
  { fullName: "Nazeer Hassan",           designation: "Event Organizer",          city: "Mangalore",    country: "Saudi Arabia", mobileNumber: "+919844100017" },
  { fullName: "Sadiq Ahmed Udupi",       designation: "Employment Scheme",        city: "Udupi",        country: "Saudi Arabia", mobileNumber: "+919844100018" },
  { fullName: "Akhil Ganjimutt",         designation: "Employment Scheme",        city: "Ganjimutt",    country: "Saudi Arabia", mobileNumber: "+919844100019" },
  { fullName: "Ashraf Sheikh Koteshwar", designation: "FRF Convenor",             city: "Koteshwar",    country: "Saudi Arabia", mobileNumber: "+919844100020" },
  { fullName: "Mohammed Haris Byndoor",  designation: "FRF Convenor",             city: "Byndoor",      country: "Saudi Arabia", mobileNumber: "+919844100021" },
  { fullName: "Haneef N.S.",             designation: "Executive Member",         city: "Mangalore",    country: "Saudi Arabia", mobileNumber: "+919844100022" },
  { fullName: "Zia Ganjimutt",           designation: "Executive Member",         city: "Ganjimutt",    country: "Saudi Arabia", mobileNumber: "+919844100023" },
  { fullName: "Razik Bajpe",             designation: "Executive Member",         city: "Bajpe",        country: "Saudi Arabia", mobileNumber: "+919844100024" },
  { fullName: "Yousuf Kalanjibail",      designation: "Executive Member",         city: "Kalanjibail",  country: "Saudi Arabia", mobileNumber: "+919844100025" },
  { fullName: "Shaul Hameed",            designation: "Executive Member",         city: "Mangalore",    country: "Saudi Arabia", mobileNumber: "+919844100026" },
  { fullName: "Nayaz Ahmed",             designation: "Executive Member",         city: "Mangalore",    country: "Saudi Arabia", mobileNumber: "+919844100027" },
  { fullName: "Abdul Majeed Vittal",     designation: "Executive Member",         city: "Vittal",       country: "Saudi Arabia", mobileNumber: "+919844100028" },
  { fullName: "Rafee Hameed Uchchila",   designation: "Executive Member",         city: "Uchchila",     country: "Saudi Arabia", mobileNumber: "+919844100029" },
];

// ── 2. EVENTS ─────────────────────────────────────────────────────────────────
const eventRows = [
  {
    name: "DKMO Annual General Meeting 2025",
    eventDate: new Date("2025-12-15T10:00:00Z"),
    location: "Mangalore Community Hall, Mangalore",
    budget: "75000",
    description: "Annual gathering of all DKMO members with elections, financial review and community welfare updates.",
    status: "completed",
  },
  {
    name: "Eid Milad-un-Nabi Celebration",
    eventDate: new Date("2026-09-05T18:00:00Z"),
    location: "Al-Madinah Hall, Riyadh",
    budget: "45000",
    description: "Community celebration of the Prophet's birthday with Naat, lectures and communal iftar.",
    status: "upcoming",
  },
  {
    name: "DKMO Medical Camp – Mangalore",
    eventDate: new Date("2026-03-22T09:00:00Z"),
    location: "Govt. Wenlock Hospital Grounds, Mangalore",
    budget: "30000",
    description: "Free health check-up camp covering diabetes, BP, eye and dental screenings for underprivileged members.",
    status: "completed",
  },
  {
    name: "Employment Skill Development Workshop",
    eventDate: daysFromNow(45),
    location: "DKMO Office, Jeddah",
    budget: "20000",
    description: "Hands-on training in IT, construction trades and hospitality for job-seeking members.",
    status: "upcoming",
  },
  {
    name: "Ramadan Food Basket Distribution",
    eventDate: new Date("2026-02-28T08:00:00Z"),
    location: "Multiple locations – Mangalore, Udupi, Bajpe",
    budget: "60000",
    description: "Distribution of grocery baskets to 300 needy families ahead of Ramadan.",
    status: "completed",
  },
  {
    name: "DKMO Sports Day 2026",
    eventDate: daysFromNow(90),
    location: "Karnataka Ground, Mangalore",
    budget: "15000",
    description: "Inter-city cricket and football tournament for DKMO member families.",
    status: "upcoming",
  },
  {
    name: "DKMO Quarterly Community Meeting — Q2 2026",
    eventDate: new Date("2026-05-10T10:00:00Z"),
    location: "DKMO Office, Riyadh",
    budget: "8000",
    description: "Quarterly review meeting covering FRF disbursements, membership updates and upcoming events planning.",
    status: "completed",
  },
  {
    name: "DKMO Welfare Committee Meeting — June 2026",
    eventDate: new Date("2026-06-12T09:30:00Z"),
    location: "Al-Noor Community Centre, Riyadh",
    budget: "5000",
    description: "Meeting to review FRF applications, approve welfare claims and plan community support initiatives.",
    status: "upcoming",
  },
];

// ── 3. SPONSORS ───────────────────────────────────────────────────────────────
const sponsorRows = [
  {
    sponsorName: "Al-Khaleej Trading Co.",
    company: "Al-Khaleej Group",
    contactPerson: "Mohammed Al-Rashid",
    phone: "+966501234567",
    email: "sponsor@alkhaleej.sa",
    tier: "platinum",
    totalAmount: "100000",
    paidAmount: "100000",
    status: "completed",
    assignedStaff: "Abdul Azeez Bajpe",
    transferMethod: "bank_transfer",
    linkedEvent: "DKMO Annual General Meeting 2025",
    notes: "Reliable platinum partner for 3 consecutive years.",
  },
  {
    sponsorName: "Hind Exports Ltd.",
    company: "Hind Exports",
    contactPerson: "Ravi Kumar",
    phone: "+919876543210",
    email: "ravi@hindexports.in",
    tier: "gold",
    totalAmount: "50000",
    paidAmount: "50000",
    status: "completed",
    assignedStaff: "Ghani Ahmed Mulki",
    transferMethod: "bank_transfer",
    linkedEvent: "Ramadan Food Basket Distribution",
    notes: "Sponsored food baskets in full.",
  },
  {
    sponsorName: "Gulf Constructions LLC",
    company: "Gulf Constructions",
    contactPerson: "Ibrahim Nasser",
    phone: "+966557654321",
    email: "ibrahim@gulfconstructions.com",
    tier: "silver",
    totalAmount: "30000",
    paidAmount: "15000",
    status: "partial",
    assignedStaff: "Irfan Shaikh",
    transferMethod: "cheque",
    linkedEvent: "Employment Skill Development Workshop",
    notes: "Second instalment due next month.",
  },
  {
    sponsorName: "Noor Pharmacy Group",
    company: "Noor Pharmacy",
    contactPerson: "Dr. Yusuf Noor",
    phone: "+919844777888",
    email: "dr.yusuf@noorpharmacy.in",
    tier: "gold",
    totalAmount: "40000",
    paidAmount: "40000",
    status: "completed",
    assignedStaff: "Ashraf Kozhikan",
    transferMethod: "cash",
    linkedEvent: "DKMO Medical Camp – Mangalore",
    notes: "Provided medicines and medical staff.",
  },
  {
    sponsorName: "Coastal Caterers",
    company: "Coastal Caterers Pvt Ltd",
    contactPerson: "Suresh Shetty",
    phone: "+919833445566",
    email: "coastal@catering.in",
    tier: "bronze",
    totalAmount: "12000",
    paidAmount: "12000",
    status: "completed",
    assignedStaff: "Shareef Thokur",
    transferMethod: "cash",
    linkedEvent: "Eid Milad-un-Nabi Celebration",
    notes: "Catering for 500 guests.",
  },
  {
    sponsorName: "Riyadh Electronics Mart",
    company: "Riyadh Electronics",
    contactPerson: "Khalid Farooq",
    phone: "+966512233445",
    email: "khalid@riyadelec.sa",
    tier: "silver",
    totalAmount: "25000",
    paidAmount: "0",
    status: "pending",
    assignedStaff: "Salman Noor",
    transferMethod: "bank_transfer",
    linkedEvent: "DKMO Sports Day 2026",
    notes: "Contract signed; awaiting first payment.",
  },
  {
    sponsorName: "Mangalore Steel Industries",
    company: "Mangalore Steel",
    contactPerson: "Prakash Rao",
    phone: "+919844556677",
    email: "prakash@mangaloresteel.in",
    tier: "bronze",
    totalAmount: "8000",
    paidAmount: "8000",
    status: "completed",
    assignedStaff: "Hameed Nazeer",
    transferMethod: "cash",
    linkedEvent: "DKMO Sports Day 2026",
    notes: "Sponsored sports equipment and trophies.",
  },
  {
    sponsorName: "Al-Baraka Finance House",
    company: "Al-Baraka Group",
    contactPerson: "Abdullah Al-Baraka",
    phone: "+966509876543",
    email: "abdullaha@albaraka.sa",
    tier: "platinum",
    totalAmount: "75000",
    paidAmount: "37500",
    status: "partial",
    assignedStaff: "Fazlurrahman Kolkar",
    transferMethod: "bank_transfer",
    linkedEvent: "Eid Milad-un-Nabi Celebration",
    dueDate: daysFromNow(30),
    notes: "Committed to two equal instalments. First received.",
  },
];

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error(
      "Refusing to run the destructive demo seed. Set ALLOW_DEMO_SEED=true only against an intentionally disposable database.",
    );
  }
  console.log("🌱  Seeding DKMO database…");

  // ── Clear existing data (order respects FK constraints) ──────────────────
  console.log("  ↳ clearing old data…");
  await db.delete(meetingAttendanceTable);
  await db.delete(meetingsTable);
  await db.delete(eventTicketsTable);
  await db.delete(eventTicketBookletsTable);
  await db.delete(eventExpensesTable);
  await db.delete(eventSponsorsTable);
  await db.delete(frfClaimsTable);
  await db.delete(loansTable);
  await db.delete(receiptsTable);
  await db.delete(tasksTable);
  await db.delete(sponsorsTable);
  await db.delete(eventsTable);
  await db.delete(paymentsTable);
  await db.delete(auditLogsTable);
  await db.delete(membersTable);

  // ── Members ──────────────────────────────────────────────────────────────
  console.log("  ↳ inserting members…");

  // Sequential, collision-free generators shared across every member so that
  // membership IDs, application numbers, Iqama numbers and mobiles are unique.
  let membershipSeq = 0;
  const nextMembershipId = () => `DKMO-${String(++membershipSeq).padStart(4, "0")}`;
  let appSeq = 1000;
  const nextApplicationNumber = () => `APP-${++appSeq}`;
  let iqamaSeq = 2100000000;
  const nextIqamaNumber = () => `${(iqamaSeq += 173)}`;
  // KSA mobile format: leading 0 + 9 digits → e.g. 0502260256 (no +91).
  let mobileSeq = 502260256;
  const nextMobile = () => `0${mobileSeq++}`;

  const jamaathOptions = [
    "Mangalore Jamaath",
    "Ullal Jamaath",
    "Bantwal Jamaath",
    "Puttur Jamaath",
    "Kasaragod Jamaath",
    "Mukkam Jamaath",
    "Surathkal Jamaath",
    "Moodbidri Jamaath",
  ];

  // Name pools for generated (referred + standalone) members. Iterating with the
  // first name varying fastest makes the first thousands of combos unique.
  const FIRST = [
    "Bilal", "Mohsin", "Junaid", "Arshad", "Faheem", "Tahir", "Zubair", "Imran",
    "Arafath", "Basheer", "Mubarak", "Rizwan", "Saleem", "Naveed", "Anwar",
    "Firoz", "Shahid", "Aslam", "Kareem", "Mansoor", "Nadeem", "Owais", "Parvez",
    "Qadir", "Rasheed", "Sajid", "Tariq", "Usman", "Wasim", "Yaseen", "Zahid",
    "Adil", "Bashir", "Dilshad", "Ejaz", "Faisal", "Gulzar", "Haroon", "Ibrahim",
    "Jamal", "Kamran", "Latif", "Maqbool", "Noman", "Osman", "Rafiq", "Sohail",
    "Tauseef", "Umar", "Waheed",
  ];
  const MIDDLE = [
    "Ahmed", "Hussain", "Rashid", "Salim", "Abdul", "Mohammed", "Khan", "Ali",
    "Hassan", "Yusuf", "Ibrahim", "Farooq",
  ];
  const PLACE = [
    "Surathkal", "Belman", "Kottara", "Ullal", "Bantwal", "Puttur", "Kundapur",
    "Shirva", "Padubidri", "Thokkottu", "Mulki", "Vittal", "Uchchila",
    "Kalanjibail", "Ganjimutt", "Koteshwar", "Byndoor", "Thokur", "Moodbidri",
    "Karkala", "Hebri", "Belthangady", "Sullia", "Venoor", "Kadaba",
    "Kinnigoli", "Mangalore", "Mangaluru", "Bajpe", "Addoor",
  ];
  let nameSeq = 0;
  const usedNames = new Set<string>();
  const nextPerson = (): { fullName: string; city: string } => {
    for (;;) {
      const idx = nameSeq++;
      const first = FIRST[idx % FIRST.length];
      const mid = MIDDLE[Math.floor(idx / FIRST.length) % MIDDLE.length];
      const place = PLACE[Math.floor(idx / (FIRST.length * MIDDLE.length)) % PLACE.length];
      const fullName = `${first} ${mid} ${place}`;
      if (!usedNames.has(fullName)) {
        usedNames.add(fullName);
        return { fullName, city: place };
      }
    }
  };

  type SeedMember = typeof membersTable.$inferInsert & { __refCommitteeIndex?: number };
  const allRows: SeedMember[] = [];

  // 1) Committee / executive members — top-level (no reference), PAID + ACTIVE
  //    membership and ACTIVE FRF. Order preserved so they occupy indices 0..28.
  memberRows.forEach((m, i) => {
    allRows.push({
      fullName: m.fullName,
      designation: m.designation,
      ...committeeStatusForDesignation(m.designation),
      city: m.city,
      country: m.country,
      mobileNumber: nextMobile(),
      membershipId: nextMembershipId(),
      applicationNumber: nextApplicationNumber(),
      iqamaNumber: nextIqamaNumber(),
      jamaath: jamaathOptions[i % jamaathOptions.length],
      membershipFee: "100",
      feeStatus: "paid",
      feePaidAt: daysAgo(30 + (i % 60)),
      feeUpdatedBy: "Abdul Rahiman Sulaiman",
      frfStatus: "active",
      refMemberName: "",
      refMemberId: "",
    });
  });

  // 2) Referred members — a VARYING number of regular members under each
  //    committee member so the recruitment leaderboard reflects a real ranking
  //    (not a uniform count). Some committee members intentionally have 0
  //    referrals to prove the leaderboard shows 0 when no referrals exist.
  //    Each generated person appears under exactly one reference.
  // Keep the demo dataset small & clean: only a handful of referred members so
  // the recruitment leaderboard still shows a real (varied) ranking. Total
  // members stay at 40 (29 committee + 8 referred + 3 standalone).
  const REFERRAL_DISTRIBUTION = [
    3, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0,
  ];
  const referralCountFor = (ci: number): number =>
    REFERRAL_DISTRIBUTION[ci] ?? 0;
  let refIdx = 0;
  memberRows.forEach((committee, ci) => {
    const count = referralCountFor(ci);
    for (let r = 0; r < count; r++) {
      const person = nextPerson();
      const k = refIdx++;
      // Vary status for realism so pending/unpaid views are populated.
      const feeStatus: "paid" | "pending" | "unpaid" =
        k % 9 === 0 ? "unpaid" : k % 4 === 0 ? "pending" : "paid";
      const frfStatus: "active" | "suspended" | "inactive" =
        k % 17 === 0 ? "inactive" : k % 13 === 0 ? "suspended" : "active";
      allRows.push({
        fullName: person.fullName,
        designation: "Member",
        city: person.city,
        country: k % 5 === 0 ? "India" : "Saudi Arabia",
        mobileNumber: nextMobile(),
        membershipId: nextMembershipId(),
        applicationNumber: nextApplicationNumber(),
        iqamaNumber: nextIqamaNumber(),
        jamaath: jamaathOptions[k % jamaathOptions.length],
        membershipFee: "100",
        feeStatus,
        feePaidAt: feeStatus === "paid" ? daysAgo(20 + (k % 90)) : null,
        feeUpdatedBy: feeStatus === "paid" ? "Abdul Rahiman Sulaiman" : "",
        frfStatus,
        refMemberName: committee.fullName,
        refMemberId: "",
        __refCommitteeIndex: ci,
      });
    }
  });

  // 3) Standalone members — 3 independent members (no reference), PAID + ACTIVE
  //    membership and ACTIVE FRF.
  for (let s = 0; s < 3; s++) {
    const person = nextPerson();
    allRows.push({
      fullName: person.fullName,
      designation: "Member",
      city: person.city,
      country: "Saudi Arabia",
      mobileNumber: nextMobile(),
      membershipId: nextMembershipId(),
      applicationNumber: nextApplicationNumber(),
      iqamaNumber: nextIqamaNumber(),
      jamaath: jamaathOptions[s % jamaathOptions.length],
      membershipFee: "100",
      feeStatus: "paid",
      feePaidAt: daysAgo(15 + s * 3),
      feeUpdatedBy: "Abdul Rahiman Sulaiman",
      frfStatus: "active",
      refMemberName: "",
      refMemberId: "",
    });
  }

  const insertedMembers = await db
    .insert(membersTable)
    .values(allRows.map(({ __refCommitteeIndex: _drop, ...row }) => row))
    .returning();

  // Link referral UUIDs now that members have ids. Committee members occupy the
  // same indices (0..28) in insertedMembers as in memberRows.
  for (let i = 0; i < allRows.length; i++) {
    const ci = allRows[i].__refCommitteeIndex;
    if (ci === undefined) continue;
    await db
      .update(membersTable)
      .set({ refMemberId: insertedMembers[ci].id })
      .where(eq(membersTable.id, insertedMembers[i].id));
  }

  // ── Events ────────────────────────────────────────────────────────────────
  console.log("  ↳ inserting events…");
  const insertedEvents = await db.insert(eventsTable).values(eventRows).returning();

  // ── Sponsors ──────────────────────────────────────────────────────────────
  console.log("  ↳ inserting sponsors…");
  const insertedSponsors = await db.insert(sponsorsTable).values(sponsorRows).returning();

  // ── Meetings & Attendance ──────────────────────────────────────────────────
  // Meeting Attendance intentionally starts empty. The cleanup near the start
  // of this seed removes old demo records while preserving committee members.
  console.log("  ↳ leaving meetings and attendance empty…");
  const insertedMeetings: never[] = [];

  // ── Tasks ─────────────────────────────────────────────────────────────────
  console.log("  ↳ inserting tasks…");
  const taskRows = [
    { title: "Book community hall for AGM", description: "Confirm booking and deposit for Mangalore Community Hall.", assignedTo: "Ashraf Kozhikan", priority: "high", status: "completed", dueDate: new Date("2025-11-30"), eventId: insertedEvents[0].id },
    { title: "Prepare financial report FY 2024-25", description: "Compile member contribution data and FRF disbursements.", assignedTo: "Abdul Rahiman Sulaiman", priority: "high", status: "completed", dueDate: new Date("2025-12-01"), eventId: insertedEvents[0].id },
    { title: "Design Eid Milad banners", description: "Create bilingual Arabic-English banner artwork for the event.", assignedTo: "Zia Ganjimutt", priority: "medium", status: "in_progress", dueDate: daysFromNow(20), eventId: insertedEvents[1].id },
    { title: "Invite guest speakers for Eid Milad", description: "Reach out to 3 scholars and confirm travel arrangements.", assignedTo: "Irshad Bajpe", priority: "high", status: "pending", dueDate: daysFromNow(30), eventId: insertedEvents[1].id },
    { title: "Recruit volunteer doctors – Medical Camp", description: "Coordinate with 5 local doctors for the free health camp.", assignedTo: "Sadiq Ahmed Udupi", priority: "high", status: "completed", dueDate: new Date("2026-03-15"), eventId: insertedEvents[2].id },
    { title: "Purchase medical supplies", description: "Procure glucometers, BP monitors and basic medicines.", assignedTo: "Akhil Ganjimutt", priority: "medium", status: "completed", dueDate: new Date("2026-03-18"), eventId: insertedEvents[2].id },
    { title: "Confirm workshop trainers", description: "Finalise trainers for IT and construction trades sessions.", assignedTo: "Sadiq Ahmed Udupi", priority: "high", status: "in_progress", dueDate: daysFromNow(15), eventId: insertedEvents[3].id },
    { title: "Print workshop materials", description: "Print 100 sets of handouts and course booklets.", assignedTo: "Haneef N.S.", priority: "low", status: "pending", dueDate: daysFromNow(35), eventId: insertedEvents[3].id },
    { title: "Compile beneficiary list – Ramadan baskets", description: "Gather verified list of 300 families from local jamaaths.", assignedTo: "Shamsuddin Addoor", priority: "high", status: "completed", dueDate: new Date("2026-02-20"), eventId: insertedEvents[4].id },
    { title: "Coordinate with Coastal Caterers", description: "Sign catering contract and finalise menu for Eid event.", assignedTo: "Shareef Thokur", priority: "medium", status: "completed", dueDate: new Date("2026-08-25"), sponsorId: insertedSponsors[4].id, eventId: insertedEvents[1].id },
    { title: "Follow up Gulf Constructions payment", description: "Send reminder for second instalment of SAR 15,000.", assignedTo: "Irfan Shaikh", priority: "high", status: "in_progress", dueDate: daysFromNow(7), sponsorId: insertedSponsors[2].id },
    { title: "Sports Day venue inspection", description: "Visit Karnataka Ground and confirm pitch, lighting and parking.", assignedTo: "Hameed Nazeer", priority: "medium", status: "pending", dueDate: daysFromNow(60), eventId: insertedEvents[5].id },
    { title: "Collect Riyadh Electronics first payment", description: "Ensure signed contract payment is processed before deadline.", assignedTo: "Salman Noor", priority: "high", status: "pending", dueDate: daysFromNow(10), sponsorId: insertedSponsors[5].id },
    { title: "Update member database post-AGM", description: "Record newly elected office-bearers and confirm membership fee status.", assignedTo: "Irshad Bajpe", priority: "medium", status: "completed", dueDate: new Date("2026-01-05") },
    { title: "Send membership fee reminders", description: "WhatsApp reminders to all members with pending or unpaid membership fees.", assignedTo: "Sameen Khan Ummer", priority: "medium", status: "pending", dueDate: daysFromNow(5) },
    { title: "Order trophies and medals – Sports Day", description: "Source 20 trophies and 60 medals from sports supplier.", assignedTo: "Nazeer Hassan", priority: "low", status: "pending", dueDate: daysFromNow(55), eventId: insertedEvents[5].id },
    { title: "Verify FRF claims – Q2 batch", description: "Review 8 pending FRF applications and submit committee report.", assignedTo: "Ashraf Sheikh Koteshwar", priority: "high", status: "in_progress", dueDate: daysFromNow(8) },
    { title: "Al-Baraka Finance follow-up", description: "Confirm second instalment schedule and send invoice copy.", assignedTo: "Fazlurrahman Kolkar", priority: "medium", status: "pending", dueDate: daysFromNow(28), sponsorId: insertedSponsors[7].id },
  ];
  await db.insert(tasksTable).values(taskRows);

  // ── Loans ─────────────────────────────────────────────────────────────────
  console.log("  ↳ inserting loans…");
  const loanData = [
    { memberId: insertedMembers[3].id,  loanType: "personal",    principalAmount: "15000", disbursedDate: dateStrAgo(365), emiAmount: "1500", emiCount: 12, paidEmis: 10, status: "active",   convenorName: "Ghani Ahmed Mulki",   description: "Personal loan for home renovation",                     notes: "2 EMIs remaining" },
    { memberId: insertedMembers[7].id,  loanType: "medical",     principalAmount: "25000", disbursedDate: dateStrAgo(420), emiAmount: "2500", emiCount: 10, paidEmis: 10, status: "closed",   convenorName: "Ghani Ahmed Mulki",   description: "Medical emergency loan for cardiac surgery",             notes: "Fully repaid" },
    { memberId: insertedMembers[11].id, loanType: "education",   principalAmount: "12000", disbursedDate: dateStrAgo(180), emiAmount: "1000", emiCount: 12, paidEmis: 6,  status: "active",   convenorName: "Shamsuddin Addoor",   description: "Education loan for son's engineering fees",              notes: "On track" },
    { memberId: insertedMembers[15].id, loanType: "personal",    principalAmount: "8000",  disbursedDate: dateStrAgo(240), emiAmount: "800",  emiCount: 10, paidEmis: 8,  status: "active",   convenorName: "Shamsuddin Addoor",   description: "Loan for vehicle purchase",                              notes: "Final 2 EMIs pending" },
    { memberId: insertedMembers[19].id, loanType: "business",    principalAmount: "50000", disbursedDate: dateStrAgo(90),  emiAmount: "2500", emiCount: 20, paidEmis: 3,  status: "active",   convenorName: "Ghani Ahmed Mulki",   description: "Business startup loan for grocery store",               notes: "Regular repayment" },
    { memberId: insertedMembers[23].id, loanType: "emergency",   principalAmount: "5000",  disbursedDate: dateStrAgo(60),  emiAmount: "1000", emiCount: 5,  paidEmis: 2,  status: "active",   convenorName: "Shamsuddin Addoor",   description: "Emergency travel loan – family bereavement",             notes: "Approved under emergency protocol" },
    { memberId: insertedMembers[27].id, loanType: "personal",    principalAmount: "20000", disbursedDate: dateStrAgo(600), emiAmount: "1667", emiCount: 12, paidEmis: 12, status: "closed",   convenorName: "Ghani Ahmed Mulki",   description: "Home renovation loan",                                   notes: "Closed. No dues." },
    { memberId: insertedMembers[5].id,  loanType: "medical",     principalAmount: "18000", disbursedDate: dateStrAgo(30),  emiAmount: "1500", emiCount: 12, paidEmis: 1,  status: "active",   convenorName: "Ghani Ahmed Mulki",   description: "Medical loan for dialysis treatment",                    notes: "Freshly disbursed" },
    { memberId: insertedMembers[9].id,  loanType: "education",   principalAmount: "10000", disbursedDate: dateStrAgo(120), emiAmount: "1000", emiCount: 10, paidEmis: 4,  status: "active",   convenorName: "Shamsuddin Addoor",   description: "Daughter's nursing course fees",                         notes: "" },
    { memberId: insertedMembers[13].id, loanType: "business",    principalAmount: "35000", disbursedDate: dateStrAgo(730), emiAmount: "1750", emiCount: 20, paidEmis: 20, status: "closed",   convenorName: "Ghani Ahmed Mulki",   description: "Business loan for tailoring shop",                       notes: "Fully repaid on time" },
    { memberId: insertedMembers[17].id, loanType: "personal",    principalAmount: "6000",  disbursedDate: dateStrAgo(45),  emiAmount: "600",  emiCount: 10, paidEmis: 1,  status: "active",   convenorName: "Shamsuddin Addoor",   description: "Personal loan for household expenses",                   notes: "" },
    { memberId: insertedMembers[21].id, loanType: "emergency",   principalAmount: "3000",  disbursedDate: dateStrAgo(150), emiAmount: "1000", emiCount: 3,  paidEmis: 3,  status: "closed",   convenorName: "Ghani Ahmed Mulki",   description: "Emergency medical loan – dengue treatment",              notes: "Cleared quickly" },
    { memberId: insertedMembers[25].id, loanType: "personal",    principalAmount: "22000", disbursedDate: dateStrAgo(200), emiAmount: "1100", emiCount: 20, paidEmis: 7,  status: "active",   convenorName: "Shamsuddin Addoor",   description: "Loan for house construction",                            notes: "Repaying steadily" },
    { memberId: insertedMembers[29].id, loanType: "medical",     principalAmount: "14000", disbursedDate: dateStrAgo(300), emiAmount: "1400", emiCount: 10, paidEmis: 10, status: "closed",   convenorName: "Ghani Ahmed Mulki",   description: "Medical loan for hernia operation",                      notes: "Loan closed" },
    { memberId: insertedMembers[33].id, loanType: "education",   principalAmount: "9000",  disbursedDate: dateStrAgo(75),  emiAmount: "750",  emiCount: 12, paidEmis: 2,  status: "active",   convenorName: "Shamsuddin Addoor",   description: "Polytechnic fee support for son",                        notes: "" },
    // ── Overdue loans (missed EMIs, past due) ─────────────────────────────────
    { memberId: insertedMembers[1].id,  loanType: "personal",    principalAmount: "18000", disbursedDate: dateStrAgo(400), emiAmount: "1500", emiCount: 12, paidEmis: 5,  status: "overdue",  convenorName: "Ghani Ahmed Mulki",   description: "Personal loan for land purchase",                        notes: "Stopped paying after EMI 5. 3 months overdue. Follow-up initiated." },
    { memberId: insertedMembers[8].id,  loanType: "business",    principalAmount: "30000", disbursedDate: dateStrAgo(350), emiAmount: "2000", emiCount: 15, paidEmis: 8,  status: "overdue",  convenorName: "Shamsuddin Addoor",   description: "Business loan – shop inventory",                         notes: "Business closed. Legal notice sent. EMI 9-11 unpaid." },
    { memberId: insertedMembers[16].id, loanType: "medical",     principalAmount: "11000", disbursedDate: dateStrAgo(280), emiAmount: "1100", emiCount: 10, paidEmis: 4,  status: "overdue",  convenorName: "Ghani Ahmed Mulki",   description: "Medical loan for knee replacement surgery",              notes: "2 EMIs missed. Convenor contacted member in India." },
    { memberId: insertedMembers[36].id, loanType: "education",   principalAmount: "7500",  disbursedDate: dateStrAgo(320), emiAmount: "750",  emiCount: 10, paidEmis: 3,  status: "overdue",  convenorName: "Shamsuddin Addoor",   description: "Education loan for daughter's college admission",        notes: "Last payment 4 months ago. Contact attempts unsuccessful." },
  ];
  await db.insert(loansTable).values(loanData);

  // ── Receipts (official DKMO receipts) ─────────────────────────────────────
  console.log("  ↳ inserting receipts…");
  const jamaaths = ["Bajpe Masjid Jamaath", "Mangalore Jumma Masjid", "Mulki Jame Masjid", "Udupi Masjid", "Koteshwar Jamaath", "Addoor Masjid Jamaath", "Vittal Jame Masjid"];
  const receiptData = insertedMembers.slice(0, 20).map((mem, i) => {
    const roll = i % 5;
    const pt = {
      lifeMembership: roll === 0,
      frfCase: roll === 1 ? `FRF-${String((i % 6) + 1).padStart(3, "0")}` : "",
      voluntaryYearly: roll === 2,
      donation: roll === 3,
      loanRecovery: roll === 4,
      others: false,
    };
    const amount = roll === 0 ? "100" : roll === 1 ? "50" : roll === 4 ? "1500" : "500";
    return {
      receiptNumber: `DKMO-RC-${String(i + 1).padStart(3, "0")}`,
      receiptDate: dateStrAgo(180 - i * 5),
      memberName: mem.fullName,
      dkmoId: mem.membershipId,
      jamathName: jamaaths[i % jamaaths.length],
      mobileNumber: mem.mobileNumber,
      whatsappNumber: mem.mobileNumber,
      amount,
      paymentTypes: JSON.stringify(pt),
      createdBy: i % 2 === 0 ? "Irshad Bajpe" : "Abdul Rahiman Sulaiman",
    };
  });
  await db.insert(receiptsTable).values(receiptData);

  // ── FRF Claims ────────────────────────────────────────────────────────────
  console.log("  ↳ inserting FRF claims…");
  // One-active-case workflow: exactly ONE claim is "approved" (the active
  // collection case). Completed cases are "disbursed" (history); the rest
  // are in the review pipeline or rejected. 7 unique, realistic claims.
  const frfClaimInserts = [
    // ── History: completed & closed collection cases ──
    { title: "Death Benefit — Late Hameed Nazeer's Family", memberId: insertedMembers[16].id, claimantName: insertedMembers[16].fullName, membershipId: insertedMembers[16].membershipId, claimType: "death_benefit", amountRequested: "50000", amountApproved: "50000", status: "disbursed", claimDate: daysAgo(320), approvedDate: daysAgo(300), disbursedAt: daysAgo(230), disbursedBy: "Fazlurrahman Kolkar", approvedBy: "Fazlurrahman Kolkar", beneficiaryName: "Ayesha Nazeer", beneficiaryRelation: "spouse", description: "Death benefit for the family following the member's passing in Dammam.", notes: "Collection target reached; SAR 50,000 handed over to the family. Case closed." },
    { title: "Emergency Aid — Kolkar House Fire", memberId: insertedMembers[2].id, claimantName: insertedMembers[2].fullName, membershipId: insertedMembers[2].membershipId, claimType: "emergency", amountRequested: "12000", amountApproved: "12000", status: "disbursed", claimDate: daysAgo(210), approvedDate: daysAgo(200), disbursedAt: daysAgo(150), disbursedBy: "Abdul Rahiman Sulaiman", approvedBy: "Abdul Rahiman Sulaiman", beneficiaryName: "Irshad Bajpe", beneficiaryRelation: "self", description: "Emergency assistance after a kitchen fire damaged the member's family home in Kolkar.", notes: "Fast-tracked under emergency protocol. Fully collected and disbursed." },
    { title: "Air Ticket — Medical Escort to Mangalore", memberId: insertedMembers[11].id, claimantName: insertedMembers[11].fullName, membershipId: insertedMembers[11].membershipId, claimType: "air_ticket", amountRequested: "3500", amountApproved: "3500", status: "disbursed", claimDate: daysAgo(140), approvedDate: daysAgo(130), disbursedAt: daysAgo(95), disbursedBy: "Fazlurrahman Kolkar", approvedBy: "Fazlurrahman Kolkar", beneficiaryName: "Yousuf Addoor", beneficiaryRelation: "self", description: "Return air ticket to escort ailing mother for treatment at Wenlock Hospital, Mangalore.", notes: "Ticket booked directly by the committee. Case closed." },
    // ── The ONE active collection case ──
    { title: "Death Benefit — Late Asif Kannur's Family", memberId: insertedMembers[1].id, claimantName: insertedMembers[1].fullName, membershipId: insertedMembers[1].membershipId, claimType: "death_benefit", amountRequested: "50000", amountApproved: "50000", status: "approved", claimDate: daysAgo(40), approvedDate: daysAgo(25), approvedBy: "Fazlurrahman Kolkar", beneficiaryName: "Fathima Begum", beneficiaryRelation: "spouse", description: "Death benefit collection for the family of the late member; SAR 50 per member until the target is reached.", notes: "Active collection case — SAR 50 per member. Collection in progress." },
    // ── Review pipeline (no collection yet) ──
    { title: "Medical Emergency — Cardiac Surgery Support", memberId: insertedMembers[9].id, claimantName: insertedMembers[9].fullName, membershipId: insertedMembers[9].membershipId, claimType: "emergency", amountRequested: "20000", amountApproved: "0", status: "under_review", claimDate: daysAgo(12), approvedBy: "", beneficiaryName: "Ghani Ahmed Mulki", beneficiaryRelation: "self", description: "Support towards cardiac surgery expenses at Al-Hamidi Hospital, Riyadh.", notes: "Hospital estimate submitted; committee review in progress. Collection can open only after the current active case closes." },
    { title: "Air Ticket — Family Bereavement Travel", memberId: insertedMembers[19].id, claimantName: insertedMembers[19].fullName, membershipId: insertedMembers[19].membershipId, claimType: "air_ticket", amountRequested: "2800", amountApproved: "0", status: "pending", claimDate: daysAgo(4), approvedBy: "", beneficiaryName: "Ashraf Sheikh Koteshwar", beneficiaryRelation: "self", description: "Emergency air ticket to attend father's funeral in Udupi.", notes: "Submitted; awaiting initial screening by the FRF convenor." },
    // ── Rejected (history) ──
    { title: "Utility Dues Clearance Request", memberId: insertedMembers[22].id, claimantName: insertedMembers[22].fullName, membershipId: insertedMembers[22].membershipId, claimType: "other", amountRequested: "4500", amountApproved: "0", status: "rejected", claimDate: daysAgo(70), approvedBy: "", rejectedBy: "Yousuf Addoor", rejectedAt: daysAgo(60), beneficiaryName: "Zia Ganjimutt", beneficiaryRelation: "self", description: "Request to clear accumulated utility bill arrears.", notes: "Rejected: routine utility dues are not covered under FRF policy." },
  ];
  const insertedClaims = await db
    .insert(frfClaimsTable)
    .values(frfClaimInserts)
    .returning();

  // ── Payments (membership fees + FRF contributions) ────────────────────────
  console.log("  ↳ inserting payments…");
  const methods = ["cash", "bank_transfer", "upi", "cheque"];
  const paymentInserts: (typeof paymentsTable.$inferInsert)[] = [];
  let mfSeq = 1;
  insertedMembers.forEach((mem, i) => {
    if (mem.feeStatus === "paid") {
      paymentInserts.push({
        memberId: mem.id,
        paymentType: "membership_fee",
        amountDue: "100",
        amountPaid: "100",
        status: "paid",
        paymentMethod: methods[i % methods.length],
        receiptNumber: `DKMO-MF-${String(mfSeq++).padStart(4, "0")}`,
        notes: "One-time DKMO membership fee (SAR 100)",
        paidAt: mem.feePaidAt ?? daysAgo(30 + (i % 60)),
      });
    } else {
      paymentInserts.push({
        memberId: mem.id,
        paymentType: "membership_fee",
        amountDue: "100",
        amountPaid: "0",
        status: mem.feeStatus === "pending" ? "pending" : "overdue",
        paymentMethod: methods[i % methods.length],
        receiptNumber: `DKMO-MF-${String(mfSeq++).padStart(4, "0")}`,
        notes: "Membership fee outstanding",
        dueDate: daysFromNow(mem.feeStatus === "pending" ? 15 : -20),
      });
    }
  });

  // FRF contributions: only the ONE active (approved) collection case is
  // collecting — SAR 50 per eligible member, mixed paid/pending for the demo.
  // Completed (disbursed) cases keep a fully-paid ledger as history.
  let frfSeq = 1;
  const eligibleMembers = insertedMembers.filter(
    (m) => m.frfStatus === "active" && m.feeStatus === "paid",
  );
  const contributionInserts: (typeof frfContributionsTable.$inferInsert)[] = [];

  const activeClaim = insertedClaims.find((c) => c.status === "approved")!;
  eligibleMembers.forEach((mem, mi) => {
    const isPaid = mi % 4 !== 0; // ~75% have already paid the active case
    contributionInserts.push({
      claimId: activeClaim.id,
      memberId: mem.id,
      amount: "50",
      amountPaid: isPaid ? "50" : "0",
      status: isPaid ? "paid" : "pending",
      ...(isPaid ? { paidAt: daysAgo((mi * 3) % 24) } : {}),
    });
    paymentInserts.push({
      memberId: mem.id,
      paymentType: "frf_contribution",
      frfClaimId: activeClaim.id,
      amountDue: "50",
      amountPaid: isPaid ? "50" : "0",
      status: isPaid ? "paid" : "pending",
      paymentMethod: methods[mi % methods.length],
      receiptNumber: `DKMO-FRF-${String(frfSeq++).padStart(5, "0")}`,
      notes: `FRF contribution — ${activeClaim.title}`,
      ...(isPaid ? { paidAt: daysAgo((mi * 3) % 24) } : { dueDate: daysFromNow(12) }),
    });
  });

  // Historical ledgers for completed cases: everyone paid, case closed.
  insertedClaims
    .filter((c) => c.status === "disbursed")
    .forEach((claim, ci) => {
      eligibleMembers.forEach((mem, mi) => {
        contributionInserts.push({
          claimId: claim.id,
          memberId: mem.id,
          amount: "50",
          amountPaid: "50",
          status: "paid",
          paidAt: daysAgo(240 - ci * 60 + (mi % 20)),
        });
      });
    });

  await db.insert(paymentsTable).values(paymentInserts);
  await db.insert(frfContributionsTable).values(contributionInserts);

  // ── Event Sponsors ────────────────────────────────────────────────────────
  console.log("  ↳ inserting event sponsors…");
  await db.insert(eventSponsorsTable).values([
    { eventId: insertedEvents[0].id, sponsorName: "Al-Khaleej Trading Co.",    contactPerson: "Mohammed Al-Rashid", phone: "+966501234567", email: "sponsor@alkhaleej.sa",      amount: "60000", sponsorshipType: "cash",      sponsorshipDate: dateStrAgo(200), notes: "Main hall sponsor for AGM" },
    { eventId: insertedEvents[0].id, sponsorName: "Haneef B.K. Foundation",    contactPerson: "Haneef B.K.",        phone: "+919844100009", email: "haneef@hkfoundation.in",     amount: "10000", sponsorshipType: "kind",       sponsorshipDate: dateStrAgo(195), notes: "Refreshments and hospitality" },
    { eventId: insertedEvents[0].id, sponsorName: "Salman Electronics",        contactPerson: "Salman Noor",        phone: "+919844100007", email: "salman@electronics.in",      amount: "5000",  sponsorshipType: "kind",       sponsorshipDate: dateStrAgo(190), notes: "PA system and sound equipment" },
    { eventId: insertedEvents[1].id, sponsorName: "Al-Baraka Finance House",   contactPerson: "Abdullah Al-Baraka", phone: "+966509876543", email: "abdullaha@albaraka.sa",      amount: "30000", sponsorshipType: "cash",       sponsorshipDate: dateStrAgo(60),  notes: "Lead sponsor for Eid celebration" },
    { eventId: insertedEvents[1].id, sponsorName: "Coastal Caterers",          contactPerson: "Suresh Shetty",      phone: "+919833445566", email: "coastal@catering.in",         amount: "12000", sponsorshipType: "service",    sponsorshipDate: dateStrAgo(55),  notes: "Full catering for 500 guests" },
    { eventId: insertedEvents[2].id, sponsorName: "Noor Pharmacy Group",       contactPerson: "Dr. Yusuf Noor",     phone: "+919844777888", email: "dr.yusuf@noorpharmacy.in",   amount: "20000", sponsorshipType: "kind",       sponsorshipDate: dateStrAgo(120), notes: "Medicines, glucometers, BP monitors" },
    { eventId: insertedEvents[2].id, sponsorName: "Gulf Constructions LLC",    contactPerson: "Ibrahim Nasser",     phone: "+966557654321", email: "ibrahim@gulfconstructions.com",amount: "10000",sponsorshipType: "cash",       sponsorshipDate: dateStrAgo(115), notes: "Infrastructure setup" },
    { eventId: insertedEvents[3].id, sponsorName: "Gulf Constructions LLC",    contactPerson: "Ibrahim Nasser",     phone: "+966557654321", email: "ibrahim@gulfconstructions.com",amount: "15000",sponsorshipType: "cash",       sponsorshipDate: dateStrAgo(50),  notes: "Trainer fees and materials" },
    { eventId: insertedEvents[4].id, sponsorName: "Hind Exports Ltd.",         contactPerson: "Ravi Kumar",         phone: "+919876543210", email: "ravi@hindexports.in",         amount: "40000", sponsorshipType: "kind",       sponsorshipDate: dateStrAgo(180), notes: "Grocery items and packaging" },
    { eventId: insertedEvents[4].id, sponsorName: "Bajpe Masjid Trust",        contactPerson: "Razik Bajpe",        phone: "+919844100024", email: "bajpetrust@gmail.com",        amount: "15000", sponsorshipType: "cash",       sponsorshipDate: dateStrAgo(175), notes: "Cash contribution to basket fund" },
    { eventId: insertedEvents[5].id, sponsorName: "Riyadh Electronics Mart",  contactPerson: "Khalid Farooq",      phone: "+966512233445", email: "khalid@riyadelec.sa",         amount: "10000", sponsorshipType: "cash",       sponsorshipDate: dateStrAgo(10),  notes: "Prize money and electronics" },
    { eventId: insertedEvents[5].id, sponsorName: "Mangalore Steel Industries",contactPerson: "Prakash Rao",        phone: "+919844556677", email: "prakash@mangaloresteel.in",  amount: "5000",  sponsorshipType: "kind",       sponsorshipDate: dateStrAgo(8),   notes: "Trophies and medals" },
  ]);

  // ── Event Expenses ────────────────────────────────────────────────────────
  console.log("  ↳ inserting event expenses…");
  await db.insert(eventExpensesTable).values([
    { eventId: insertedEvents[0].id, category: "venue",       description: "Hall booking deposit and rent",            vendor: "Mangalore Community Hall",  amount: "25000", expenseDate: dateStrAgo(210), notes: "Full day booking" },
    { eventId: insertedEvents[0].id, category: "catering",    description: "Refreshments for 200 attendees",          vendor: "Bismillah Caterers",        amount: "18000", expenseDate: dateStrAgo(200), notes: "Lunch and tea" },
    { eventId: insertedEvents[0].id, category: "printing",    description: "Banners, flex boards, invitations",       vendor: "Print Zone Mangalore",      amount: "4500",  expenseDate: dateStrAgo(215), notes: "" },
    { eventId: insertedEvents[0].id, category: "transport",   description: "Fuel reimbursements for committee members",vendor: "Various",                   amount: "3200",  expenseDate: dateStrAgo(200), notes: "" },
    { eventId: insertedEvents[0].id, category: "av",          description: "Projector, mic and PA system rental",     vendor: "Sound Express",             amount: "7500",  expenseDate: dateStrAgo(205), notes: "" },
    { eventId: insertedEvents[2].id, category: "medical",     description: "Glucometers, strips and medicines",       vendor: "Noor Pharmacy",             amount: "12000", expenseDate: dateStrAgo(125), notes: "300 test kits" },
    { eventId: insertedEvents[2].id, category: "venue",       description: "Tents and seating arrangement",           vendor: "Wenlock Ground Ops",        amount: "8000",  expenseDate: dateStrAgo(122), notes: "" },
    { eventId: insertedEvents[2].id, category: "staff",       description: "Honorarium for volunteer doctors",        vendor: "Various",                   amount: "10000", expenseDate: dateStrAgo(120), notes: "5 doctors × SAR 2000" },
    { eventId: insertedEvents[4].id, category: "procurement", description: "Grocery items – 300 family baskets",      vendor: "Reliance Fresh Wholesale",  amount: "42000", expenseDate: dateStrAgo(185), notes: "Rice, dal, oil, sugar per basket" },
    { eventId: insertedEvents[4].id, category: "packaging",   description: "Cardboard boxes and plastic bags",        vendor: "Mangalore Packaging Co.",   amount: "4500",  expenseDate: dateStrAgo(182), notes: "" },
    { eventId: insertedEvents[4].id, category: "transport",   description: "Delivery vehicles – 3 locations",        vendor: "Rayan Logistics",           amount: "6000",  expenseDate: dateStrAgo(180), notes: "Mangalore, Udupi, Bajpe" },
    { eventId: insertedEvents[3].id, category: "training",    description: "Trainer fees – IT & construction",        vendor: "Skill India Centre",        amount: "8000",  expenseDate: dateStrAgo(20),  notes: "2 trainers × 4 sessions" },
    { eventId: insertedEvents[3].id, category: "printing",    description: "Course booklets and handouts – 100 sets", vendor: "Print Plus Jeddah",         amount: "3500",  expenseDate: dateStrAgo(18),  notes: "" },
    { eventId: insertedEvents[5].id, category: "venue",       description: "Karnataka Ground booking",                vendor: "Mangalore Municipal Corp.", amount: "5000",  expenseDate: dateStrAgo(15),  notes: "Full-day booking" },
    { eventId: insertedEvents[5].id, category: "prizes",      description: "Trophies and medals",                    vendor: "Mangalore Steel Industries",amount: "3800",  expenseDate: dateStrAgo(12),  notes: "20 trophies, 60 medals" },
  ]);

  // ── Event Ticket Booklets & Tickets (ALL events) ──────────────────────────
  console.log("  ↳ inserting ticket booklets and tickets…");

  const buyerNames  = ["Khalid Farooq", "Ravi Kumar", "Mohammed Al-Rashid", "Suresh Shetty", "Dr. Yusuf Noor", "Ibrahim Nasser", "Prakash Rao", "Abdullah Al-Baraka", "Suhail Ahmed", "Bilal Hussain", "Tariq Mehmood", "Saleem Ansari", "Faisal Khan", "Noor Mohammed", "Hasan Siddiqui", "Arshad Ali", "Waqar Ahmed", "Imtiaz Baig", "Zubair Shaikh", "Rafeeq Hassan"];
  const buyerPhones = ["+966512233445", "+919876543210", "+966501234567", "+919833445566", "+919844777888", "+966557654321", "+919844556677", "+966509876543", "+919844112233", "+919844100030", "+966512344567", "+919844556781", "+966523456789", "+919844100031", "+919844100032", "+966598765432", "+919844100033", "+919844100034", "+966511223344", "+919844100035"];

  const bookletInserts = [
    // AGM 2025 (events[0]) – completed, sold out
    { eventId: insertedEvents[0].id, bookletNumber: "AGM-BK-01", ticketRangeStart: 1,   ticketRangeEnd: 50,  assignedTo: "Ashraf Kozhikan",   assignedDate: dateStrAgo(230), ticketAmount: "500", status: "sold_out" },
    { eventId: insertedEvents[0].id, bookletNumber: "AGM-BK-02", ticketRangeStart: 51,  ticketRangeEnd: 100, assignedTo: "Shareef Thokur",    assignedDate: dateStrAgo(228), ticketAmount: "500", status: "sold_out" },
    { eventId: insertedEvents[0].id, bookletNumber: "AGM-BK-03", ticketRangeStart: 101, ticketRangeEnd: 150, assignedTo: "Hameed Nazeer",     assignedDate: dateStrAgo(225), ticketAmount: "500", status: "partial"  },
    // Eid Milad (events[1]) – upcoming, partial sales
    { eventId: insertedEvents[1].id, bookletNumber: "EID-BK-01", ticketRangeStart: 1,   ticketRangeEnd: 50,  assignedTo: "Haneef N.S.",       assignedDate: dateStrAgo(25),  ticketAmount: "300", status: "partial"  },
    { eventId: insertedEvents[1].id, bookletNumber: "EID-BK-02", ticketRangeStart: 51,  ticketRangeEnd: 100, assignedTo: "Zia Ganjimutt",     assignedDate: dateStrAgo(22),  ticketAmount: "300", status: "active"   },
    { eventId: insertedEvents[1].id, bookletNumber: "EID-BK-03", ticketRangeStart: 101, ticketRangeEnd: 150, assignedTo: "Razik Bajpe",       assignedDate: dateStrAgo(18),  ticketAmount: "300", status: "active"   },
    // Medical Camp (events[2]) – completed, sold out
    { eventId: insertedEvents[2].id, bookletNumber: "MED-BK-01", ticketRangeStart: 1,   ticketRangeEnd: 40,  assignedTo: "Sadiq Ahmed Udupi", assignedDate: dateStrAgo(145), ticketAmount: "0",   status: "sold_out" },
    { eventId: insertedEvents[2].id, bookletNumber: "MED-BK-02", ticketRangeStart: 41,  ticketRangeEnd: 80,  assignedTo: "Akhil Ganjimutt",  assignedDate: dateStrAgo(143), ticketAmount: "0",   status: "sold_out" },
    // Employment Workshop (events[3]) – upcoming, partial
    { eventId: insertedEvents[3].id, bookletNumber: "WRK-BK-01", ticketRangeStart: 1,   ticketRangeEnd: 60,  assignedTo: "Sadiq Ahmed Udupi", assignedDate: dateStrAgo(30),  ticketAmount: "100", status: "partial"  },
    // Ramadan Distribution (events[4]) – completed (pass tickets), all taken
    { eventId: insertedEvents[4].id, bookletNumber: "RAM-BK-01", ticketRangeStart: 1,   ticketRangeEnd: 100, assignedTo: "Shamsuddin Addoor", assignedDate: dateStrAgo(200), ticketAmount: "0",   status: "sold_out" },
    { eventId: insertedEvents[4].id, bookletNumber: "RAM-BK-02", ticketRangeStart: 101, ticketRangeEnd: 200, assignedTo: "Yousuf Addoor",     assignedDate: dateStrAgo(198), ticketAmount: "0",   status: "sold_out" },
    // Sports Day (events[5]) – upcoming, partial sales
    { eventId: insertedEvents[5].id, bookletNumber: "SPT-BK-01", ticketRangeStart: 1,   ticketRangeEnd: 50,  assignedTo: "Nazeer Hassan",     assignedDate: dateStrAgo(20),  ticketAmount: "200", status: "partial"  },
    { eventId: insertedEvents[5].id, bookletNumber: "SPT-BK-02", ticketRangeStart: 51,  ticketRangeEnd: 100, assignedTo: "Zia Ganjimutt",     assignedDate: dateStrAgo(18),  ticketAmount: "200", status: "active"   },
    { eventId: insertedEvents[5].id, bookletNumber: "SPT-BK-03", ticketRangeStart: 101, ticketRangeEnd: 150, assignedTo: "Hameed Nazeer",     assignedDate: dateStrAgo(15),  ticketAmount: "200", status: "active"   },
  ];
  const insertedBooklets = await db.insert(eventTicketBookletsTable).values(bookletInserts).returning();

  // Helper to generate tickets for a booklet
  function genTickets(booklet: typeof insertedBooklets[0], soldCount: number, daysAgoBase: number) {
    const tickets = [];
    const total = booklet.ticketRangeEnd - booklet.ticketRangeStart + 1;
    for (let t = 0; t < total; t++) {
      const ticketNum = booklet.ticketRangeStart + t;
      const isSold = t < soldCount;
      const bi = t % buyerNames.length;
      tickets.push({
        bookletId: booklet.id,
        eventId: booklet.eventId,
        ticketNumber: ticketNum,
        isSold,
        soldBy: isSold ? booklet.assignedTo : "",
        buyerName: isSold ? buyerNames[bi] : "",
        buyerPhone: isSold ? buyerPhones[bi] : "",
        saleDate: isSold ? dateStrAgo(daysAgoBase - (t % 8)) : "",
        amount: isSold ? booklet.ticketAmount : "0",
      });
    }
    return tickets;
  }

  const ticketInserts = [
    // AGM: BK-01 all sold (50), BK-02 all sold (50), BK-03 partial (30/50)
    ...genTickets(insertedBooklets[0],  50, 215),
    ...genTickets(insertedBooklets[1],  50, 212),
    ...genTickets(insertedBooklets[2],  30, 208),
    // Eid Milad: BK-01 partial (32/50), BK-02 early sales (12/50), BK-03 few (5/50)
    ...genTickets(insertedBooklets[3],  32, 20),
    ...genTickets(insertedBooklets[4],  12, 18),
    ...genTickets(insertedBooklets[5],   5, 15),
    // Medical Camp: BK-01 all (40), BK-02 all (40) – free entry passes
    ...genTickets(insertedBooklets[6],  40, 140),
    ...genTickets(insertedBooklets[7],  40, 138),
    // Workshop: BK-01 partial (22/60)
    ...genTickets(insertedBooklets[8],  22, 28),
    // Ramadan Distribution: BK-01 all (100), BK-02 all (100) – beneficiary passes
    ...genTickets(insertedBooklets[9],  100, 195),
    ...genTickets(insertedBooklets[10], 100, 193),
    // Sports Day: BK-01 partial (18/50), BK-02 few (8/50), BK-03 few (4/50)
    ...genTickets(insertedBooklets[11], 18, 16),
    ...genTickets(insertedBooklets[12],  8, 13),
    ...genTickets(insertedBooklets[13],  4, 10),
  ];
  await db.insert(eventTicketsTable).values(ticketInserts);

  // ── Audit trail (sample activity log) ─────────────────────────────────────
  console.log("  ↳ inserting audit logs…");
  const auditInserts: (typeof auditLogsTable.$inferInsert)[] = [
    {
      userId: "u_admin1",
      userName: "Administrator",
      action: "login",
      module: "auth",
      entityId: "u_admin1",
      entityName: "Administrator",
      details: "Signed in to the DKMO management portal.",
      ipAddress: "37.224.18.42",
      createdAt: daysAgo(2),
    },
    {
      userId: "u_admin1",
      userName: "Administrator",
      action: "member_created",
      module: "members",
      entityId: insertedMembers[3].id,
      entityName: insertedMembers[3].fullName,
      details: `Added new member ${insertedMembers[3].fullName} (${insertedMembers[3].membershipId}).`,
      ipAddress: "37.224.18.42",
      createdAt: daysAgo(2),
    },
    {
      userId: "u_finance1",
      userName: "Finance Lead",
      action: "payment_created",
      module: "payments",
      entityId: insertedMembers[5].id,
      entityName: insertedMembers[5].fullName,
      details: `Recorded one-time membership fee (SAR 100) for ${insertedMembers[5].fullName}.`,
      ipAddress: "5.42.190.77",
      createdAt: daysAgo(1),
    },
    {
      userId: "u_finance1",
      userName: "Finance Lead",
      action: "claim_approved",
      module: "frf",
      entityId: insertedClaims[0].id,
      entityName: insertedClaims[0].claimantName,
      details: `Approved FRF ${insertedClaims[0].claimType.replace(/_/g, " ")} claim for ${insertedClaims[0].claimantName} (SAR ${insertedClaims[0].amountApproved}).`,
      ipAddress: "5.42.190.77",
      createdAt: daysAgo(1),
    },
  ];
  await db.insert(auditLogsTable).values(auditInserts);

  console.log("✅  Seed complete!");
  console.log(`   Members:          ${insertedMembers.length}`);
  console.log(`   Events:           ${insertedEvents.length}`);
  console.log(`   Sponsors:         ${insertedSponsors.length}`);
  console.log(`   Meetings:         ${insertedMeetings.length} (with attendance)`);
  console.log(`   Tasks:            ${taskRows.length}`);
  console.log(`   Loans:            ${loanData.length} (incl. 4 overdue)`);
  console.log(`   Receipts:         ${receiptData.length}`);
  console.log(`   FRF Claims:       ${frfClaimInserts.length}`);
  console.log(`   Event Sponsors:   12`);
  console.log(`   Event Expenses:   15`);
  console.log(`   Ticket Booklets:  ${insertedBooklets.length} (all 6 events)`);
  console.log(`   Tickets:          ${ticketInserts.length}`);
  console.log(`   Audit Logs:       ${auditInserts.length}`);

  await pool.end();
}

main().catch((err) => {
  console.error("❌  Seed failed:", err);
  process.exit(1);
});
