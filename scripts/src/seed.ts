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
  loansTable,
  receiptsTable,
  eventSponsorsTable,
  eventExpensesTable,
  eventTicketBookletsTable,
  eventTicketsTable,
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

// ── 1. MEMBERS ────────────────────────────────────────────────────────────────
const memberRows = [
  { fullName: "Fazlurrahman Kolkar",     designation: "President",                 city: "Kolkar",       country: "Saudi Arabia", monthlyAmount: "500", mobileNumber: "+919844100001" },
  { fullName: "Asif Kannur",             designation: "Vice President",            city: "Kannur",       country: "Saudi Arabia", monthlyAmount: "500", mobileNumber: "+919844100002" },
  { fullName: "Irshad Bajpe",            designation: "General Secretary",         city: "Bajpe",        country: "Saudi Arabia", monthlyAmount: "300", mobileNumber: "+919844100003" },
  { fullName: "Abdul Rahiman Sulaiman",  designation: "Treasurer",                 city: "Mangalore",    country: "Saudi Arabia", monthlyAmount: "300", mobileNumber: "+919844100004" },
  { fullName: "Sameen Khan Ummer",       designation: "Joint Secretary",           city: "Mangalore",    country: "Saudi Arabia", monthlyAmount: "300", mobileNumber: "+919844100005" },
  { fullName: "Abdul Azeez Bajpe",       designation: "Overseas Convenor",         city: "Bajpe",        country: "Saudi Arabia", monthlyAmount: "300", mobileNumber: "+919844100006" },
  { fullName: "Salman Noor",             designation: "Advisor",                   city: "Mangalore",    country: "Saudi Arabia", monthlyAmount: "200", mobileNumber: "+919844100007" },
  { fullName: "G.K. Shaikh",             designation: "Advisor",                   city: "Mangalore",    country: "India",        monthlyAmount: "200", mobileNumber: "+919844100008" },
  { fullName: "Haneef B.K.",             designation: "Advisor",                   city: "Mangalore",    country: "India",        monthlyAmount: "200", mobileNumber: "+919844100009" },
  { fullName: "Ghani Ahmed Mulki",       designation: "Loan Convenor",            city: "Mulki",        country: "Saudi Arabia", monthlyAmount: "250", mobileNumber: "+919844100010" },
  { fullName: "Shamsuddin Addoor",       designation: "Loan Convenor (Recovery)", city: "Addoor",       country: "Saudi Arabia", monthlyAmount: "250", mobileNumber: "+919844100011" },
  { fullName: "Yousuf Addoor",           designation: "Auditor",                   city: "Addoor",       country: "Saudi Arabia", monthlyAmount: "200", mobileNumber: "+919844100012" },
  { fullName: "Irfan Shaikh",            designation: "Verification Team Leader", city: "Mangalore",    country: "Saudi Arabia", monthlyAmount: "200", mobileNumber: "+919844100013" },
  { fullName: "Ashraf Kozhikan",         designation: "Event Organizer",          city: "Kozhikode",    country: "Saudi Arabia", monthlyAmount: "200", mobileNumber: "+919844100014" },
  { fullName: "Shareef Thokur",          designation: "Event Organizer",          city: "Thokur",       country: "Saudi Arabia", monthlyAmount: "200", mobileNumber: "+919844100015" },
  { fullName: "Hameed Nazeer",           designation: "Event Organizer",          city: "Mangalore",    country: "Saudi Arabia", monthlyAmount: "200", mobileNumber: "+919844100016" },
  { fullName: "Nazeer Hassan",           designation: "Event Organizer",          city: "Mangalore",    country: "Saudi Arabia", monthlyAmount: "200", mobileNumber: "+919844100017" },
  { fullName: "Sadiq Ahmed Udupi",       designation: "Employment Scheme",        city: "Udupi",        country: "Saudi Arabia", monthlyAmount: "200", mobileNumber: "+919844100018" },
  { fullName: "Akhil Ganjimutt",         designation: "Employment Scheme",        city: "Ganjimutt",    country: "Saudi Arabia", monthlyAmount: "200", mobileNumber: "+919844100019" },
  { fullName: "Ashraf Sheikh Koteshwar", designation: "FRF Convenor",             city: "Koteshwar",    country: "Saudi Arabia", monthlyAmount: "250", mobileNumber: "+919844100020" },
  { fullName: "Mohammed Haris Byndoor",  designation: "FRF Convenor",             city: "Byndoor",      country: "Saudi Arabia", monthlyAmount: "250", mobileNumber: "+919844100021" },
  { fullName: "Haneef N.S.",             designation: "Executive Member",         city: "Mangalore",    country: "Saudi Arabia", monthlyAmount: "150", mobileNumber: "+919844100022" },
  { fullName: "Zia Ganjimutt",           designation: "Executive Member",         city: "Ganjimutt",    country: "Saudi Arabia", monthlyAmount: "150", mobileNumber: "+919844100023" },
  { fullName: "Razik Bajpe",             designation: "Executive Member",         city: "Bajpe",        country: "Saudi Arabia", monthlyAmount: "150", mobileNumber: "+919844100024" },
  { fullName: "Yousuf Kalanjibail",      designation: "Executive Member",         city: "Kalanjibail",  country: "Saudi Arabia", monthlyAmount: "150", mobileNumber: "+919844100025" },
  { fullName: "Shaul Hameed",            designation: "Executive Member",         city: "Mangalore",    country: "Saudi Arabia", monthlyAmount: "150", mobileNumber: "+919844100026" },
  { fullName: "Nayaz Ahmed",             designation: "Executive Member",         city: "Mangalore",    country: "Saudi Arabia", monthlyAmount: "150", mobileNumber: "+919844100027" },
  { fullName: "Abdul Majeed Vittal",     designation: "Executive Member",         city: "Vittal",       country: "Saudi Arabia", monthlyAmount: "150", mobileNumber: "+919844100028" },
  { fullName: "Rafee Hameed Uchchila",   designation: "Executive Member",         city: "Uchchila",     country: "Saudi Arabia", monthlyAmount: "150", mobileNumber: "+919844100029" },
  { fullName: "Bilal Hussain Surathkal", designation: "Member",                   city: "Surathkal",    country: "Saudi Arabia", monthlyAmount: "100", mobileNumber: "+919844100030" },
  { fullName: "Mohsin Ahmed Belman",     designation: "Member",                   city: "Belman",       country: "Saudi Arabia", monthlyAmount: "100", mobileNumber: "+919844100031" },
  { fullName: "Junaid Rashid Kottara",   designation: "Member",                   city: "Kottara",      country: "Saudi Arabia", monthlyAmount: "100", mobileNumber: "+919844100032" },
  { fullName: "Arshad Farooq Ullal",     designation: "Member",                   city: "Ullal",        country: "Saudi Arabia", monthlyAmount: "100", mobileNumber: "+919844100033" },
  { fullName: "Faheem Abdul Kadri",      designation: "Member",                   city: "Mangalore",    country: "Saudi Arabia", monthlyAmount: "100", mobileNumber: "+919844100034" },
  { fullName: "Tahir Mohammed Bantwal",  designation: "Member",                   city: "Bantwal",      country: "India",        monthlyAmount: "100", mobileNumber: "+919844100035" },
  { fullName: "Zubair Khan Puttur",      designation: "Member",                   city: "Puttur",       country: "India",        monthlyAmount: "100", mobileNumber: "+919844100036" },
  { fullName: "Imran Hussain Kundapur",  designation: "Member",                   city: "Kundapur",     country: "India",        monthlyAmount: "100", mobileNumber: "+919844100037" },
  { fullName: "Arafath Salim Shirva",    designation: "Member",                   city: "Shirva",       country: "Saudi Arabia", monthlyAmount: "100", mobileNumber: "+919844100038" },
  { fullName: "Basheer Ahmed Padubidri", designation: "Member",                   city: "Padubidri",    country: "Saudi Arabia", monthlyAmount: "100", mobileNumber: "+919844100039" },
  { fullName: "Mubarak Ali Thokkottu",   designation: "Member",                   city: "Thokkottu",    country: "Saudi Arabia", monthlyAmount: "100", mobileNumber: "+919844100040" },
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
    linkedEvent: "Eid Milad-un-Nabi Celebration",
    dueDate: daysFromNow(30),
    notes: "Committed to two equal instalments. First received.",
  },
];

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱  Seeding DKMO database…");

  // ── Clear existing data (order respects FK constraints) ──────────────────
  console.log("  ↳ clearing old data…");
  await db.delete(eventTicketsTable);
  await db.delete(eventTicketBookletsTable);
  await db.delete(eventExpensesTable);
  await db.delete(eventSponsorsTable);
  await db.delete(frfDependentsTable);
  await db.delete(frfMembershipsTable);
  await db.delete(frfClaimsTable);
  await db.delete(loansTable);
  await db.delete(receiptsTable);
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

  // ── Payments (last 8 months for all members, with some gaps/partials) ─────
  console.log("  ↳ inserting payments…");
  const paymentMethods = ["cash", "bank_transfer", "upi", "cheque"] as const;
  const paymentInserts = [];
  let receiptCounter = 1000;

  for (const member of insertedMembers) {
    const monthlyAmt = parseFloat(member.monthlyAmount ?? "0");
    for (let mo = 7; mo >= 0; mo--) {
      const roll = Math.random();
      if (roll < 0.12) continue;
      const partial = roll > 0.82;
      const amountPaid = partial
        ? parseFloat((monthlyAmt * (0.4 + Math.random() * 0.4)).toFixed(2))
        : monthlyAmt;

      paymentInserts.push({
        memberId: member.id,
        month: monthsBack(mo),
        amountPaid: String(amountPaid),
        paymentMethod: rand([...paymentMethods]),
        receiptNumber: `RCP-${receiptCounter++}`,
        notes: partial ? "Partial payment received" : null,
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
    { title: "Update member database post-AGM", description: "Record newly elected office-bearers and revised monthly amounts.", assignedTo: "Irshad Bajpe", priority: "medium", status: "completed", dueDate: new Date("2026-01-05") },
    { title: "Send contribution reminders – June 2026", description: "WhatsApp reminders to all members with outstanding June dues.", assignedTo: "Sameen Khan Ummer", priority: "medium", status: "pending", dueDate: daysFromNow(5) },
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
  const receiptData = [
    { receiptNumber: "DKMO-RC-001", receiptDate: dateStrAgo(180), memberName: "Fazlurrahman Kolkar",     dkmoId: "DKMO-0001", jamathName: jamaaths[0], mobileNumber: "+919844100001", whatsappNumber: "+919844100001", amount: "500",  paymentTypes: JSON.stringify({ monthlyContribution: 500 }),                         createdBy: "Irshad Bajpe" },
    { receiptNumber: "DKMO-RC-002", receiptDate: dateStrAgo(175), memberName: "Asif Kannur",             dkmoId: "DKMO-0002", jamathName: jamaaths[1], mobileNumber: "+919844100002", whatsappNumber: "+919844100002", amount: "500",  paymentTypes: JSON.stringify({ monthlyContribution: 500 }),                         createdBy: "Irshad Bajpe" },
    { receiptNumber: "DKMO-RC-003", receiptDate: dateStrAgo(170), memberName: "Irshad Bajpe",            dkmoId: "DKMO-0003", jamathName: jamaaths[0], mobileNumber: "+919844100003", whatsappNumber: "+919844100003", amount: "300",  paymentTypes: JSON.stringify({ monthlyContribution: 300 }),                         createdBy: "Abdul Rahiman Sulaiman" },
    { receiptNumber: "DKMO-RC-004", receiptDate: dateStrAgo(165), memberName: "Abdul Rahiman Sulaiman",  dkmoId: "DKMO-0004", jamathName: jamaaths[1], mobileNumber: "+919844100004", whatsappNumber: "+919844100004", amount: "600",  paymentTypes: JSON.stringify({ monthlyContribution: 300, loanRepayment: 300 }),    createdBy: "Irshad Bajpe" },
    { receiptNumber: "DKMO-RC-005", receiptDate: dateStrAgo(160), memberName: "Ghani Ahmed Mulki",       dkmoId: "DKMO-0010", jamathName: jamaaths[2], mobileNumber: "+919844100010", whatsappNumber: "+919844100010", amount: "1750", paymentTypes: JSON.stringify({ monthlyContribution: 250, loanRepayment: 1500 }),   createdBy: "Irshad Bajpe" },
    { receiptNumber: "DKMO-RC-006", receiptDate: dateStrAgo(155), memberName: "Haneef B.K.",             dkmoId: "DKMO-0009", jamathName: jamaaths[1], mobileNumber: "+919844100009", whatsappNumber: "+919844100009", amount: "200",  paymentTypes: JSON.stringify({ monthlyContribution: 200 }),                         createdBy: "Abdul Rahiman Sulaiman" },
    { receiptNumber: "DKMO-RC-007", receiptDate: dateStrAgo(150), memberName: "Ashraf Sheikh Koteshwar", dkmoId: "DKMO-0020", jamathName: jamaaths[4], mobileNumber: "+919844100020", whatsappNumber: "+919844100020", amount: "750",  paymentTypes: JSON.stringify({ monthlyContribution: 250, frfContribution: 500 }), createdBy: "Irshad Bajpe" },
    { receiptNumber: "DKMO-RC-008", receiptDate: dateStrAgo(145), memberName: "Mohammed Haris Byndoor",  dkmoId: "DKMO-0021", jamathName: jamaaths[3], mobileNumber: "+919844100021", whatsappNumber: "+919844100021", amount: "250",  paymentTypes: JSON.stringify({ monthlyContribution: 250 }),                         createdBy: "Abdul Rahiman Sulaiman" },
    { receiptNumber: "DKMO-RC-009", receiptDate: dateStrAgo(140), memberName: "Yousuf Addoor",           dkmoId: "DKMO-0012", jamathName: jamaaths[5], mobileNumber: "+919844100012", whatsappNumber: "+919844100012", amount: "400",  paymentTypes: JSON.stringify({ monthlyContribution: 200, donationGeneral: 200 }), createdBy: "Irshad Bajpe" },
    { receiptNumber: "DKMO-RC-010", receiptDate: dateStrAgo(135), memberName: "Razik Bajpe",             dkmoId: "DKMO-0024", jamathName: jamaaths[0], mobileNumber: "+919844100024", whatsappNumber: "+919844100024", amount: "150",  paymentTypes: JSON.stringify({ monthlyContribution: 150 }),                         createdBy: "Irshad Bajpe" },
    { receiptNumber: "DKMO-RC-011", receiptDate: dateStrAgo(120), memberName: "Sameen Khan Ummer",       dkmoId: "DKMO-0005", jamathName: jamaaths[1], mobileNumber: "+919844100005", whatsappNumber: "+919844100005", amount: "300",  paymentTypes: JSON.stringify({ monthlyContribution: 300 }),                         createdBy: "Abdul Rahiman Sulaiman" },
    { receiptNumber: "DKMO-RC-012", receiptDate: dateStrAgo(115), memberName: "Abdul Majeed Vittal",     dkmoId: "DKMO-0028", jamathName: jamaaths[6], mobileNumber: "+919844100028", whatsappNumber: "+919844100028", amount: "300",  paymentTypes: JSON.stringify({ monthlyContribution: 150, loanRepayment: 150 }),   createdBy: "Irshad Bajpe" },
    { receiptNumber: "DKMO-RC-013", receiptDate: dateStrAgo(110), memberName: "Nayaz Ahmed",             dkmoId: "DKMO-0027", jamathName: jamaaths[1], mobileNumber: "+919844100027", whatsappNumber: "+919844100027", amount: "150",  paymentTypes: JSON.stringify({ monthlyContribution: 150 }),                         createdBy: "Abdul Rahiman Sulaiman" },
    { receiptNumber: "DKMO-RC-014", receiptDate: dateStrAgo(105), memberName: "Irfan Shaikh",            dkmoId: "DKMO-0013", jamathName: jamaaths[1], mobileNumber: "+919844100013", whatsappNumber: "+919844100013", amount: "200",  paymentTypes: JSON.stringify({ monthlyContribution: 200 }),                         createdBy: "Irshad Bajpe" },
    { receiptNumber: "DKMO-RC-015", receiptDate: dateStrAgo(100), memberName: "Zia Ganjimutt",           dkmoId: "DKMO-0023", jamathName: jamaaths[2], mobileNumber: "+919844100023", whatsappNumber: "+919844100023", amount: "650",  paymentTypes: JSON.stringify({ monthlyContribution: 150, donationEvent: 500 }),   createdBy: "Irshad Bajpe" },
    { receiptNumber: "DKMO-RC-016", receiptDate: dateStrAgo(90),  memberName: "Shaul Hameed",            dkmoId: "DKMO-0026", jamathName: jamaaths[1], mobileNumber: "+919844100026", whatsappNumber: "+919844100026", amount: "150",  paymentTypes: JSON.stringify({ monthlyContribution: 150 }),                         createdBy: "Abdul Rahiman Sulaiman" },
    { receiptNumber: "DKMO-RC-017", receiptDate: dateStrAgo(85),  memberName: "Sadiq Ahmed Udupi",       dkmoId: "DKMO-0018", jamathName: jamaaths[3], mobileNumber: "+919844100018", whatsappNumber: "+919844100018", amount: "200",  paymentTypes: JSON.stringify({ monthlyContribution: 200 }),                         createdBy: "Irshad Bajpe" },
    { receiptNumber: "DKMO-RC-018", receiptDate: dateStrAgo(80),  memberName: "Akhil Ganjimutt",         dkmoId: "DKMO-0019", jamathName: jamaaths[2], mobileNumber: "+919844100019", whatsappNumber: "+919844100019", amount: "200",  paymentTypes: JSON.stringify({ monthlyContribution: 200 }),                         createdBy: "Abdul Rahiman Sulaiman" },
    { receiptNumber: "DKMO-RC-019", receiptDate: dateStrAgo(75),  memberName: "Bilal Hussain Surathkal", dkmoId: "DKMO-0030", jamathName: jamaaths[0], mobileNumber: "+919844100030", whatsappNumber: "+919844100030", amount: "100",  paymentTypes: JSON.stringify({ monthlyContribution: 100 }),                         createdBy: "Irshad Bajpe" },
    { receiptNumber: "DKMO-RC-020", receiptDate: dateStrAgo(70),  memberName: "Mohsin Ahmed Belman",     dkmoId: "DKMO-0031", jamathName: jamaaths[2], mobileNumber: "+919844100031", whatsappNumber: "+919844100031", amount: "100",  paymentTypes: JSON.stringify({ monthlyContribution: 100 }),                         createdBy: "Irshad Bajpe" },
    { receiptNumber: "DKMO-RC-021", receiptDate: dateStrAgo(65),  memberName: "Junaid Rashid Kottara",   dkmoId: "DKMO-0032", jamathName: jamaaths[1], mobileNumber: "+919844100032", whatsappNumber: "+919844100032", amount: "100",  paymentTypes: JSON.stringify({ monthlyContribution: 100 }),                         createdBy: "Abdul Rahiman Sulaiman" },
    { receiptNumber: "DKMO-RC-022", receiptDate: dateStrAgo(60),  memberName: "Arshad Farooq Ullal",     dkmoId: "DKMO-0033", jamathName: jamaaths[5], mobileNumber: "+919844100033", whatsappNumber: "+919844100033", amount: "100",  paymentTypes: JSON.stringify({ monthlyContribution: 100 }),                         createdBy: "Irshad Bajpe" },
    { receiptNumber: "DKMO-RC-023", receiptDate: dateStrAgo(55),  memberName: "Faheem Abdul Kadri",      dkmoId: "DKMO-0034", jamathName: jamaaths[1], mobileNumber: "+919844100034", whatsappNumber: "+919844100034", amount: "100",  paymentTypes: JSON.stringify({ monthlyContribution: 100 }),                         createdBy: "Abdul Rahiman Sulaiman" },
    { receiptNumber: "DKMO-RC-024", receiptDate: dateStrAgo(50),  memberName: "Ashraf Kozhikan",         dkmoId: "DKMO-0014", jamathName: jamaaths[3], mobileNumber: "+919844100014", whatsappNumber: "+919844100014", amount: "700",  paymentTypes: JSON.stringify({ monthlyContribution: 200, donationGeneral: 500 }), createdBy: "Irshad Bajpe" },
    { receiptNumber: "DKMO-RC-025", receiptDate: dateStrAgo(45),  memberName: "Hameed Nazeer",           dkmoId: "DKMO-0016", jamathName: jamaaths[1], mobileNumber: "+919844100016", whatsappNumber: "+919844100016", amount: "200",  paymentTypes: JSON.stringify({ monthlyContribution: 200 }),                         createdBy: "Abdul Rahiman Sulaiman" },
    { receiptNumber: "DKMO-RC-026", receiptDate: dateStrAgo(40),  memberName: "Nazeer Hassan",           dkmoId: "DKMO-0017", jamathName: jamaaths[1], mobileNumber: "+919844100017", whatsappNumber: "+919844100017", amount: "200",  paymentTypes: JSON.stringify({ monthlyContribution: 200 }),                         createdBy: "Irshad Bajpe" },
    { receiptNumber: "DKMO-RC-027", receiptDate: dateStrAgo(35),  memberName: "Haneef N.S.",             dkmoId: "DKMO-0022", jamathName: jamaaths[1], mobileNumber: "+919844100022", whatsappNumber: "+919844100022", amount: "150",  paymentTypes: JSON.stringify({ monthlyContribution: 150 }),                         createdBy: "Abdul Rahiman Sulaiman" },
    { receiptNumber: "DKMO-RC-028", receiptDate: dateStrAgo(30),  memberName: "Yousuf Kalanjibail",      dkmoId: "DKMO-0025", jamathName: jamaaths[6], mobileNumber: "+919844100025", whatsappNumber: "+919844100025", amount: "150",  paymentTypes: JSON.stringify({ monthlyContribution: 150 }),                         createdBy: "Irshad Bajpe" },
    { receiptNumber: "DKMO-RC-029", receiptDate: dateStrAgo(25),  memberName: "Rafee Hameed Uchchila",   dkmoId: "DKMO-0029", jamathName: jamaaths[4], mobileNumber: "+919844100029", whatsappNumber: "+919844100029", amount: "150",  paymentTypes: JSON.stringify({ monthlyContribution: 150 }),                         createdBy: "Abdul Rahiman Sulaiman" },
    { receiptNumber: "DKMO-RC-030", receiptDate: dateStrAgo(20),  memberName: "Fazlurrahman Kolkar",     dkmoId: "DKMO-0001", jamathName: jamaaths[0], mobileNumber: "+919844100001", whatsappNumber: "+919844100001", amount: "1000", paymentTypes: JSON.stringify({ monthlyContribution: 500, donationGeneral: 500 }), createdBy: "Irshad Bajpe" },
  ];
  await db.insert(receiptsTable).values(receiptData);

  // ── FRF Memberships ───────────────────────────────────────────────────────
  console.log("  ↳ inserting FRF memberships…");
  const frfStatuses = ["approved", "approved", "approved", "submitted", "under_review"] as const;
  const bloodGroups = ["O+", "A+", "B+", "AB+", "O-", "A-"];
  const frfMembershipInserts = [];

  for (let i = 0; i < 22; i++) {
    const member = insertedMembers[i];
    frfMembershipInserts.push({
      frfNumber: `FRF-${String(2400 + i + 1).padStart(4, "0")}`,
      memberId: member.id,
      fullName: member.fullName,
      dateOfBirth: `${1970 + (i % 20)}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
      bloodGroup: bloodGroups[i % bloodGroups.length],
      maritalStatus: i < 16 ? "married" : "single",
      numDependents: i < 16 ? (1 + (i % 4)) : 0,
      iqamaNumber: `10${String(23456789 + i * 7)}`,
      passportNumber: `Z${String(1234567 + i * 13)}`,
      occupation: rand(["Engineer", "Accountant", "Sales Manager", "Driver", "Technician", "Supervisor", "Contractor"]),
      companyName: rand(["Saudi Aramco", "Al-Rajhi Bank", "SABIC", "Al-Futtaim Group", "Gulf Contractors", "Bin Laden Group"]),
      mobileSaudi: `+9665${String(10000000 + i * 99997)}`,
      mobileIndia: member.mobileNumber,
      email: `${member.fullName.toLowerCase().replace(/[^a-z]/g, ".")}@gmail.com`,
      areaSaudi: rand(["Riyadh", "Jeddah", "Dammam", "Makkah", "Madinah", "Khobar"]),
      district: rand(["Dakshina Kannada", "Udupi"]),
      nearestJamaath: rand(jamaaths),
      nomineeName: `Nominee of ${member.fullName}`,
      nomineeRelation: i < 16 ? "spouse" : "parent",
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
  const frfClaimInserts = [
    { memberId: insertedMembers[6].id,  claimantName: insertedMembers[6].fullName,  membershipId: insertedMembers[6].membershipId,  claimType: "death_benefit", amountRequested: "50000", amountApproved: "50000", status: "approved",     claimDate: daysAgo(120), approvedDate: daysAgo(100), approvedBy: "Fazlurrahman Kolkar",      beneficiaryName: "Noor Salman",         beneficiaryRelation: "spouse", description: "Death benefit claim following the passing of member's father.", notes: "Verified by FRF Convenor. Disbursed in full." },
    { memberId: insertedMembers[9].id,  claimantName: insertedMembers[9].fullName,  membershipId: insertedMembers[9].membershipId,  claimType: "medical",       amountRequested: "25000", amountApproved: "20000", status: "approved",     claimDate: daysAgo(60),  approvedDate: daysAgo(45),  approvedBy: "Abdul Rahiman Sulaiman",  beneficiaryName: "Ghani Ahmed Mulki",   beneficiaryRelation: "self",   description: "Cardiac surgery expenses – Al-Hamidi Hospital, Riyadh.", notes: "Partial approval; remaining from personal contribution." },
    { memberId: insertedMembers[14].id, claimantName: insertedMembers[14].fullName, membershipId: insertedMembers[14].membershipId, claimType: "education",     amountRequested: "15000", amountApproved: "0",     status: "pending",      claimDate: daysAgo(10),                              approvedBy: "",                        beneficiaryName: "Shareef Thokur Jr.",  beneficiaryRelation: "son",    description: "Engineering college admission fee for son.", notes: "Awaiting academic documents." },
    { memberId: insertedMembers[19].id, claimantName: insertedMembers[19].fullName, membershipId: insertedMembers[19].membershipId, claimType: "marriage",      amountRequested: "20000", amountApproved: "0",     status: "under_review", claimDate: daysAgo(20),                              approvedBy: "",                        beneficiaryName: "Ashraf Sheikh Koteshwar", beneficiaryRelation: "self",  description: "Marriage assistance grant.", notes: "Documents submitted; under committee review." },
    { memberId: insertedMembers[2].id,  claimantName: insertedMembers[2].fullName,  membershipId: insertedMembers[2].membershipId,  claimType: "emergency",     amountRequested: "10000", amountApproved: "10000", status: "approved",     claimDate: daysAgo(80),  approvedDate: daysAgo(72),  approvedBy: "Fazlurrahman Kolkar",      beneficiaryName: "Irshad Bajpe",        beneficiaryRelation: "self",   description: "Emergency travel expenses – family bereavement in India.", notes: "Fast-tracked under emergency protocol." },
    { memberId: insertedMembers[22].id, claimantName: insertedMembers[22].fullName, membershipId: insertedMembers[22].membershipId, claimType: "medical",       amountRequested: "8000",  amountApproved: "0",     status: "rejected",     claimDate: daysAgo(45),                              approvedBy: "Yousuf Addoor",           beneficiaryName: "Zia Ganjimutt",       beneficiaryRelation: "self",   description: "Dental treatment claim.", notes: "Rejected: dental treatment not covered under current FRF policy." },
    { memberId: insertedMembers[4].id,  claimantName: insertedMembers[4].fullName,  membershipId: insertedMembers[4].membershipId,  claimType: "education",     amountRequested: "12000", amountApproved: "12000", status: "approved",     claimDate: daysAgo(150), approvedDate: daysAgo(135), approvedBy: "Abdul Rahiman Sulaiman",  beneficiaryName: "Sara Khan",           beneficiaryRelation: "daughter",description: "Nursing course fees at Wenlock Institute.", notes: "All documents verified." },
    { memberId: insertedMembers[27].id, claimantName: insertedMembers[27].fullName, membershipId: insertedMembers[27].membershipId, claimType: "death_benefit", amountRequested: "50000", amountApproved: "0",     status: "under_review", claimDate: daysAgo(5),                               approvedBy: "",                        beneficiaryName: "Fatima Majeed",       beneficiaryRelation: "spouse", description: "Death benefit following member's hospitalisation and passing.", notes: "Death certificate submitted; final verification pending." },
    { memberId: insertedMembers[11].id, claimantName: insertedMembers[11].fullName, membershipId: insertedMembers[11].membershipId, claimType: "medical",       amountRequested: "18000", amountApproved: "15000", status: "approved",     claimDate: daysAgo(200), approvedDate: daysAgo(185), approvedBy: "Fazlurrahman Kolkar",      beneficiaryName: "Yousuf Addoor",       beneficiaryRelation: "self",   description: "Kidney stone surgery – Al-Salama Hospital Jeddah.", notes: "Approved with deduction for non-covered items." },
    { memberId: insertedMembers[17].id, claimantName: insertedMembers[17].fullName, membershipId: insertedMembers[17].membershipId, claimType: "marriage",      amountRequested: "15000", amountApproved: "15000", status: "approved",     claimDate: daysAgo(300), approvedDate: daysAgo(282), approvedBy: "Abdul Rahiman Sulaiman",  beneficiaryName: "Sadiq Ahmed Udupi",   beneficiaryRelation: "self",   description: "Marriage assistance for self.", notes: "Approved under standard marriage benefit." },
    { memberId: insertedMembers[32].id, claimantName: insertedMembers[32].fullName, membershipId: insertedMembers[32].membershipId, claimType: "emergency",     amountRequested: "7000",  amountApproved: "7000",  status: "approved",     claimDate: daysAgo(35),  approvedDate: daysAgo(28),  approvedBy: "Fazlurrahman Kolkar",      beneficiaryName: "Junaid Rashid Kottara", beneficiaryRelation: "self", description: "Emergency funds for flood damage to house in Kottara.", notes: "Emergency approved. Relief disbursed." },
  ];
  await db.insert(frfClaimsTable).values(frfClaimInserts);

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

  console.log("✅  Seed complete!");
  console.log(`   Members:          ${insertedMembers.length}`);
  console.log(`   Payments:         ${paymentInserts.length}`);
  console.log(`   Events:           ${insertedEvents.length}`);
  console.log(`   Sponsors:         ${insertedSponsors.length}`);
  console.log(`   Tasks:            ${taskRows.length}`);
  console.log(`   Loans:            ${loanData.length} (incl. 4 overdue)`);
  console.log(`   Receipts:         ${receiptData.length}`);
  console.log(`   FRF Memberships:  ${insertedFrfMemberships.length}`);
  console.log(`   FRF Dependents:   ${dependentInserts.length}`);
  console.log(`   FRF Claims:       ${frfClaimInserts.length}`);
  console.log(`   Event Sponsors:   12`);
  console.log(`   Event Expenses:   15`);
  console.log(`   Ticket Booklets:  ${insertedBooklets.length} (all 6 events)`);
  console.log(`   Tickets:          ${ticketInserts.length}`);

  await pool.end();
}

main().catch((err) => {
  console.error("❌  Seed failed:", err);
  process.exit(1);
});
