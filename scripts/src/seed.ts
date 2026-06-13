import { db, pool } from "@workspace/db";
import {
  membersTable,
  paymentsTable,
  eventsTable,
  sponsorsTable,
  tasksTable,
  frfClaimsTable,
  frfMembershipsTable,
  frfDependentsTable,
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
function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── 1. MEMBERS ────────────────────────────────────────────────────────────────
const memberRows = [
  { fullName: "Fazlurrahman Kolkar",     designation: "President",                    city: "Kolkar",       country: "Saudi Arabia", monthlyAmount: "500", mobileNumber: "+919844100001" },
  { fullName: "Asif Kannur",             designation: "Vice President",               city: "Kannur",       country: "Saudi Arabia", monthlyAmount: "500", mobileNumber: "+919844100002" },
  { fullName: "Irshad Bajpe",            designation: "General Secretary",            city: "Bajpe",        country: "Saudi Arabia", monthlyAmount: "300", mobileNumber: "+919844100003" },
  { fullName: "Abdul Rahiman Sulaiman",  designation: "Treasurer",                    city: "Mangalore",    country: "Saudi Arabia", monthlyAmount: "300", mobileNumber: "+919844100004" },
  { fullName: "Sameen Khan Ummer",       designation: "Joint Secretary",              city: "Mangalore",    country: "Saudi Arabia", monthlyAmount: "300", mobileNumber: "+919844100005" },
  { fullName: "Abdul Azeez Bajpe",       designation: "Overseas Convenor",            city: "Bajpe",        country: "Saudi Arabia", monthlyAmount: "300", mobileNumber: "+919844100006" },
  { fullName: "Salman Noor",             designation: "Advisor",                      city: "Mangalore",    country: "Saudi Arabia", monthlyAmount: "200", mobileNumber: "+919844100007" },
  { fullName: "G.K. Shaikh",             designation: "Advisor",                      city: "Mangalore",    country: "India",        monthlyAmount: "200", mobileNumber: "+919844100008" },
  { fullName: "Haneef B.K.",             designation: "Advisor",                      city: "Mangalore",    country: "India",        monthlyAmount: "200", mobileNumber: "+919844100009" },
  { fullName: "Ghani Ahmed Mulki",       designation: "Loan Convenor",               city: "Mulki",        country: "Saudi Arabia", monthlyAmount: "250", mobileNumber: "+919844100010" },
  { fullName: "Shamsuddin Addoor",       designation: "Loan Convenor (Recovery)",    city: "Addoor",       country: "Saudi Arabia", monthlyAmount: "250", mobileNumber: "+919844100011" },
  { fullName: "Yousuf Addoor",           designation: "Auditor",                      city: "Addoor",       country: "Saudi Arabia", monthlyAmount: "200", mobileNumber: "+919844100012" },
  { fullName: "Irfan Shaikh",            designation: "Verification Team Leader",    city: "Mangalore",    country: "Saudi Arabia", monthlyAmount: "200", mobileNumber: "+919844100013" },
  { fullName: "Ashraf Kozhikan",         designation: "Event Organizer",             city: "Kozhikode",    country: "Saudi Arabia", monthlyAmount: "200", mobileNumber: "+919844100014" },
  { fullName: "Shareef Thokur",          designation: "Event Organizer",             city: "Thokur",       country: "Saudi Arabia", monthlyAmount: "200", mobileNumber: "+919844100015" },
  { fullName: "Hameed Nazeer",           designation: "Event Organizer",             city: "Mangalore",    country: "Saudi Arabia", monthlyAmount: "200", mobileNumber: "+919844100016" },
  { fullName: "Nazeer Hassan",           designation: "Event Organizer",             city: "Mangalore",    country: "Saudi Arabia", monthlyAmount: "200", mobileNumber: "+919844100017" },
  { fullName: "Sadiq Ahmed Udupi",       designation: "Employment Scheme",           city: "Udupi",        country: "Saudi Arabia", monthlyAmount: "200", mobileNumber: "+919844100018" },
  { fullName: "Akhil Ganjimutt",         designation: "Employment Scheme",           city: "Ganjimutt",    country: "Saudi Arabia", monthlyAmount: "200", mobileNumber: "+919844100019" },
  { fullName: "Ashraf Sheikh Koteshwar", designation: "FRF Convenor",               city: "Koteshwar",    country: "Saudi Arabia", monthlyAmount: "250", mobileNumber: "+919844100020" },
  { fullName: "Mohammed Haris Byndoor",  designation: "FRF Convenor",               city: "Byndoor",      country: "Saudi Arabia", monthlyAmount: "250", mobileNumber: "+919844100021" },
  { fullName: "Haneef N.S.",             designation: "Executive Member",            city: "Mangalore",    country: "Saudi Arabia", monthlyAmount: "150", mobileNumber: "+919844100022" },
  { fullName: "Zia Ganjimutt",           designation: "Executive Member",            city: "Ganjimutt",    country: "Saudi Arabia", monthlyAmount: "150", mobileNumber: "+919844100023" },
  { fullName: "Razik Bajpe",             designation: "Executive Member",            city: "Bajpe",        country: "Saudi Arabia", monthlyAmount: "150", mobileNumber: "+919844100024" },
  { fullName: "Yousuf Kalanjibail",      designation: "Executive Member",            city: "Kalanjibail",  country: "Saudi Arabia", monthlyAmount: "150", mobileNumber: "+919844100025" },
  { fullName: "Shaul Hameed",            designation: "Executive Member",            city: "Mangalore",    country: "Saudi Arabia", monthlyAmount: "150", mobileNumber: "+919844100026" },
  { fullName: "Nayaz Ahmed",             designation: "Executive Member",            city: "Mangalore",    country: "Saudi Arabia", monthlyAmount: "150", mobileNumber: "+919844100027" },
  { fullName: "Abdul Majeed Vittal",     designation: "Executive Member",            city: "Vittal",       country: "Saudi Arabia", monthlyAmount: "150", mobileNumber: "+919844100028" },
  { fullName: "Rafee Hameed Uchchila",   designation: "Executive Member",            city: "Uchchila",     country: "Saudi Arabia", monthlyAmount: "150", mobileNumber: "+919844100029" },
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
    linkedEvent: "DKMO Sports Day 2026",
    notes: "Contract signed; awaiting first payment.",
  },
];

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱  Seeding DKMO database…");

  // ── Clear existing data (order respects FK constraints) ──────────────────
  console.log("  ↳ clearing old data…");
  await db.delete(frfDependentsTable);
  await db.delete(frfMembershipsTable);
  await db.delete(frfClaimsTable);
  await db.delete(tasksTable);
  await db.delete(sponsorsTable);
  await db.delete(eventsTable);
  await db.delete(paymentsTable);
  await db.delete(membersTable);

  // ── Members ──────────────────────────────────────────────────────────────
  console.log("  ↳ inserting members…");
  const insertedMembers = await db
    .insert(membersTable)
    .values(
      memberRows.map((m, i) => ({
        ...m,
        membershipId: `DKMO-${String(i + 1).padStart(4, "0")}`,
      }))
    )
    .returning();

  // ── Payments (last 6 months for all members, with some gaps) ─────────────
  console.log("  ↳ inserting payments…");
  const paymentMethods = ["cash", "bank_transfer", "upi", "cheque"] as const;
  const paymentInserts = [];
  let receiptCounter = 1000;

  for (const member of insertedMembers) {
    const monthlyAmt = parseFloat(member.monthlyAmount ?? "0");
    // Each member gets payments for most months; a few members have gaps/partial
    for (let mo = 5; mo >= 0; mo--) {
      const roll = Math.random();
      // 15% chance of no payment this month (creates pending records)
      if (roll < 0.15) continue;
      // 10% chance of partial payment
      const partial = roll > 0.85;
      const amountPaid = partial
        ? parseFloat((monthlyAmt * (0.4 + Math.random() * 0.4)).toFixed(2))
        : monthlyAmt;

      paymentInserts.push({
        memberId: member.id,
        month: monthsBack(mo),
        amountPaid: String(amountPaid),
        paymentMethod: rand([...paymentMethods]),
        receiptNumber: `RCP-${receiptCounter++}`,
        notes: partial ? "Partial payment received" : "",
        paidAt: daysAgo(mo * 28 + Math.floor(Math.random() * 10)),
      });
    }
  }
  await db.insert(paymentsTable).values(paymentInserts);

  // ── Events ────────────────────────────────────────────────────────────────
  console.log("  ↳ inserting events…");
  const insertedEvents = await db.insert(eventsTable).values(eventRows).returning();

  // ── Sponsors ──────────────────────────────────────────────────────────────
  console.log("  ↳ inserting sponsors…");
  const insertedSponsors = await db.insert(sponsorsTable).values(sponsorRows).returning();

  // ── Tasks ─────────────────────────────────────────────────────────────────
  console.log("  ↳ inserting tasks…");
  const taskRows = [
    {
      title: "Book community hall for AGM",
      description: "Confirm booking and deposit for Mangalore Community Hall.",
      assignedTo: "Ashraf Kozhikan",
      priority: "high",
      status: "completed",
      dueDate: new Date("2025-11-30"),
      eventId: insertedEvents[0].id,
    },
    {
      title: "Prepare financial report FY 2024-25",
      description: "Compile member contribution data and FRF disbursements.",
      assignedTo: "Abdul Rahiman Sulaiman",
      priority: "high",
      status: "completed",
      dueDate: new Date("2025-12-01"),
      eventId: insertedEvents[0].id,
    },
    {
      title: "Design Eid Milad banners",
      description: "Create bilingual Arabic-English banner artwork for the event.",
      assignedTo: "Zia Ganjimutt",
      priority: "medium",
      status: "in_progress",
      dueDate: daysFromNow(20),
      eventId: insertedEvents[1].id,
    },
    {
      title: "Invite guest speakers for Eid Milad",
      description: "Reach out to 3 scholars and confirm travel arrangements.",
      assignedTo: "Irshad Bajpe",
      priority: "high",
      status: "pending",
      dueDate: daysFromNow(30),
      eventId: insertedEvents[1].id,
    },
    {
      title: "Recruit volunteer doctors – Medical Camp",
      description: "Coordinate with 5 local doctors for the free health camp.",
      assignedTo: "Sadiq Ahmed Udupi",
      priority: "high",
      status: "completed",
      dueDate: new Date("2026-03-15"),
      eventId: insertedEvents[2].id,
    },
    {
      title: "Purchase medical supplies",
      description: "Procure glucometers, BP monitors and basic medicines.",
      assignedTo: "Akhil Ganjimutt",
      priority: "medium",
      status: "completed",
      dueDate: new Date("2026-03-18"),
      eventId: insertedEvents[2].id,
    },
    {
      title: "Confirm workshop trainers",
      description: "Finalise trainers for IT and construction trades sessions.",
      assignedTo: "Sadiq Ahmed Udupi",
      priority: "high",
      status: "in_progress",
      dueDate: daysFromNow(15),
      eventId: insertedEvents[3].id,
    },
    {
      title: "Print workshop materials",
      description: "Print 100 sets of handouts and course booklets.",
      assignedTo: "Haneef N.S.",
      priority: "low",
      status: "pending",
      dueDate: daysFromNow(35),
      eventId: insertedEvents[3].id,
    },
    {
      title: "Compile beneficiary list – Ramadan baskets",
      description: "Gather verified list of 300 families from local jamaaths.",
      assignedTo: "Shamsuddin Addoor",
      priority: "high",
      status: "completed",
      dueDate: new Date("2026-02-20"),
      eventId: insertedEvents[4].id,
    },
    {
      title: "Coordinate with Coastal Caterers",
      description: "Sign catering contract and finalise menu for Eid event.",
      assignedTo: "Shareef Thokur",
      priority: "medium",
      status: "completed",
      dueDate: new Date("2026-08-25"),
      sponsorId: insertedSponsors[4].id,
      eventId: insertedEvents[1].id,
    },
    {
      title: "Follow up Gulf Constructions payment",
      description: "Send reminder for second instalment of SAR 15,000.",
      assignedTo: "Irfan Shaikh",
      priority: "high",
      status: "in_progress",
      dueDate: daysFromNow(7),
      sponsorId: insertedSponsors[2].id,
    },
    {
      title: "Sports Day venue inspection",
      description: "Visit Karnataka Ground and confirm pitch, lighting and parking.",
      assignedTo: "Hameed Nazeer",
      priority: "medium",
      status: "pending",
      dueDate: daysFromNow(60),
      eventId: insertedEvents[5].id,
    },
    {
      title: "Collect Riyadh Electronics first payment",
      description: "Ensure signed contract payment is processed before deadline.",
      assignedTo: "Salman Noor",
      priority: "high",
      status: "pending",
      dueDate: daysFromNow(10),
      sponsorId: insertedSponsors[5].id,
    },
    {
      title: "Update member database post-AGM",
      description: "Record newly elected office-bearers and revised monthly amounts.",
      assignedTo: "Irshad Bajpe",
      priority: "medium",
      status: "completed",
      dueDate: new Date("2026-01-05"),
    },
    {
      title: "Send contribution reminders – June 2026",
      description: "WhatsApp reminders to all members with outstanding June dues.",
      assignedTo: "Sameen Khan Ummer",
      priority: "medium",
      status: "pending",
      dueDate: daysFromNow(5),
    },
  ];
  await db.insert(tasksTable).values(taskRows);

  // ── FRF Memberships ───────────────────────────────────────────────────────
  console.log("  ↳ inserting FRF memberships…");
  const frfStatuses = ["approved", "approved", "approved", "submitted", "under_review"] as const;
  const bloodGroups = ["O+", "A+", "B+", "AB+", "O-", "A-"];
  const frfMembershipInserts = [];

  for (let i = 0; i < 18; i++) {
    const member = insertedMembers[i];
    frfMembershipInserts.push({
      frfNumber: `FRF-${String(2400 + i + 1).padStart(4, "0")}`,
      memberId: member.id,
      fullName: member.fullName,
      dateOfBirth: `${1970 + (i % 20)}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
      bloodGroup: bloodGroups[i % bloodGroups.length],
      maritalStatus: i < 14 ? "married" : "single",
      numDependents: i < 14 ? (1 + (i % 4)) : 0,
      iqamaNumber: `10${String(23456789 + i * 7)}`,
      passportNumber: `Z${String(1234567 + i * 13)}`,
      occupation: rand(["Engineer", "Accountant", "Sales Manager", "Driver", "Technician", "Supervisor"]),
      companyName: rand(["Saudi Aramco", "Al-Rajhi Bank", "SABIC", "Al-Futtaim Group", "Gulf Contractors"]),
      mobileSaudi: `+9665${String(10000000 + i * 99997)}`,
      mobileIndia: member.mobileNumber,
      email: `${member.fullName.toLowerCase().replace(/[^a-z]/g, ".")}@gmail.com`,
      areaSaudi: rand(["Riyadh", "Jeddah", "Dammam", "Makkah", "Madinah"]),
      district: rand(["Dakshina Kannada", "Udupi"]),
      nearestJamaath: rand(["Bajpe Masjid", "Mangalore Jumma Masjid", "Mulki Jame Masjid", "Udupi Masjid"]),
      nomineeName: `Nominee of ${member.fullName}`,
      nomineeRelation: i < 14 ? "spouse" : "parent",
      nomineeMobile: `+9198441${String(10000 + i * 3).padStart(5, "0")}`,
      status: frfStatuses[i % frfStatuses.length],
      membershipDate: "2024-01-01",
      renewalDate: "2025-01-01",
    });
  }
  const insertedFrfMemberships = await db.insert(frfMembershipsTable).values(frfMembershipInserts).returning();

  // ── FRF Dependents ────────────────────────────────────────────────────────
  console.log("  ↳ inserting FRF dependents…");
  const dependentRelations = ["spouse", "son", "daughter", "mother", "father"];
  const dependentInserts = [];
  for (const fm of insertedFrfMemberships) {
    if (fm.numDependents > 0) {
      for (let d = 0; d < fm.numDependents; d++) {
        dependentInserts.push({
          frfMembershipId: fm.id,
          fullName: `Dependent ${d + 1} of ${fm.fullName}`,
          relation: dependentRelations[d % dependentRelations.length],
          age: 5 + d * 8,
        });
      }
    }
  }
  if (dependentInserts.length > 0) {
    await db.insert(frfDependentsTable).values(dependentInserts);
  }

  // ── FRF Claims ────────────────────────────────────────────────────────────
  console.log("  ↳ inserting FRF claims…");
  const claimTypes = ["death_benefit", "medical", "education", "marriage", "emergency"] as const;
  const claimStatuses = ["approved", "approved", "pending", "under_review", "rejected"] as const;
  const frfClaimInserts = [
    {
      memberId: insertedMembers[6].id,
      claimantName: insertedMembers[6].fullName,
      membershipId: insertedMembers[6].membershipId,
      claimType: "death_benefit",
      amountRequested: "50000",
      amountApproved: "50000",
      status: "approved",
      claimDate: daysAgo(120),
      approvedDate: daysAgo(100),
      approvedBy: "Fazlurrahman Kolkar",
      beneficiaryName: "Noor Salman",
      beneficiaryRelation: "spouse",
      description: "Death benefit claim following the passing of member's father.",
      notes: "Verified by FRF Convenor. Disbursed in full.",
    },
    {
      memberId: insertedMembers[9].id,
      claimantName: insertedMembers[9].fullName,
      membershipId: insertedMembers[9].membershipId,
      claimType: "medical",
      amountRequested: "25000",
      amountApproved: "20000",
      status: "approved",
      claimDate: daysAgo(60),
      approvedDate: daysAgo(45),
      approvedBy: "Abdul Rahiman Sulaiman",
      beneficiaryName: "Ghani Ahmed Mulki",
      beneficiaryRelation: "self",
      description: "Cardiac surgery expenses – Al-Hamidi Hospital, Riyadh.",
      notes: "Partial approval; remaining 5,000 from personal contribution.",
    },
    {
      memberId: insertedMembers[14].id,
      claimantName: insertedMembers[14].fullName,
      membershipId: insertedMembers[14].membershipId,
      claimType: "education",
      amountRequested: "15000",
      amountApproved: "0",
      status: "pending",
      claimDate: daysAgo(10),
      approvedBy: "",
      beneficiaryName: "Shareef Thokur Jr.",
      beneficiaryRelation: "son",
      description: "Engineering college admission fee for son.",
      notes: "Awaiting academic documents.",
    },
    {
      memberId: insertedMembers[19].id,
      claimantName: insertedMembers[19].fullName,
      membershipId: insertedMembers[19].membershipId,
      claimType: "marriage",
      amountRequested: "20000",
      amountApproved: "0",
      status: "under_review",
      claimDate: daysAgo(20),
      approvedBy: "",
      beneficiaryName: "Ashraf Sheikh Koteshwar",
      beneficiaryRelation: "self",
      description: "Marriage assistance grant.",
      notes: "Documents submitted; under FRF committee review.",
    },
    {
      memberId: insertedMembers[2].id,
      claimantName: insertedMembers[2].fullName,
      membershipId: insertedMembers[2].membershipId,
      claimType: "emergency",
      amountRequested: "10000",
      amountApproved: "10000",
      status: "approved",
      claimDate: daysAgo(80),
      approvedDate: daysAgo(72),
      approvedBy: "Fazlurrahman Kolkar",
      beneficiaryName: "Irshad Bajpe",
      beneficiaryRelation: "self",
      description: "Emergency travel expenses – family bereavement in India.",
      notes: "Fast-tracked under emergency protocol.",
    },
    {
      memberId: insertedMembers[22].id,
      claimantName: insertedMembers[22].fullName,
      membershipId: insertedMembers[22].membershipId,
      claimType: "medical",
      amountRequested: "8000",
      amountApproved: "0",
      status: "rejected",
      claimDate: daysAgo(45),
      approvedBy: "Yousuf Addoor",
      beneficiaryName: "Zia Ganjimutt",
      beneficiaryRelation: "self",
      description: "Dental treatment claim.",
      notes: "Rejected: dental treatment not covered under current FRF policy.",
    },
    {
      memberId: insertedMembers[4].id,
      claimantName: insertedMembers[4].fullName,
      membershipId: insertedMembers[4].membershipId,
      claimType: "education",
      amountRequested: "12000",
      amountApproved: "12000",
      status: "approved",
      claimDate: daysAgo(150),
      approvedDate: daysAgo(135),
      approvedBy: "Abdul Rahiman Sulaiman",
      beneficiaryName: "Sara Khan",
      beneficiaryRelation: "daughter",
      description: "Nursing course fees for daughter at Wenlock Institute.",
      notes: "All documents verified.",
    },
    {
      memberId: insertedMembers[27].id,
      claimantName: insertedMembers[27].fullName,
      membershipId: insertedMembers[27].membershipId,
      claimType: "death_benefit",
      amountRequested: "50000",
      amountApproved: "0",
      status: "under_review",
      claimDate: daysAgo(5),
      approvedBy: "",
      beneficiaryName: "Fatima Majeed",
      beneficiaryRelation: "spouse",
      description: "Death benefit following member's hospitalisation and passing.",
      notes: "Death certificate submitted; final verification pending.",
    },
  ];
  await db.insert(frfClaimsTable).values(frfClaimInserts);

  console.log("✅  Seed complete!");
  console.log(`   Members:         ${insertedMembers.length}`);
  console.log(`   Payments:        ${paymentInserts.length}`);
  console.log(`   Events:          ${insertedEvents.length}`);
  console.log(`   Sponsors:        ${insertedSponsors.length}`);
  console.log(`   Tasks:           ${taskRows.length}`);
  console.log(`   FRF Memberships: ${insertedFrfMemberships.length}`);
  console.log(`   FRF Dependents:  ${dependentInserts.length}`);
  console.log(`   FRF Claims:      ${frfClaimInserts.length}`);

  await pool.end();
}

main().catch((err) => {
  console.error("❌  Seed failed:", err);
  process.exit(1);
});
