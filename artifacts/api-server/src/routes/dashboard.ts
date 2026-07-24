import { Router, type IRouter } from "express";
import { eq, desc, sum, sql, lte, and, ne, gte, or } from "drizzle-orm";
import {
  db,
  membersTable,
  paymentsTable,
  sponsorsTable,
  frfClaimsTable,
  eventsTable,
  welfareRequestsTable,
  loansTable,
  frfContributionsTable,
} from "@workspace/db";
import {
  GetDashboardSummaryQueryParams,
  GetPendingMembersQueryParams,
  GetRecentPaymentsQueryParams,
  GetMonthlyCollectionQueryParams,
  GetPaymentMethodBreakdownQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { currentMonth, paymentToApi } from "../lib/serializers";
import { deriveContributionStatus } from "../lib/frf-ledger";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const parsed = GetDashboardSummaryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // `month` query param retained for API compatibility but no longer used —
  // membership fee is a one-time fee tracked on the member record.
  void parsed.data.month;

  const members = await db.select().from(membersTable);

  let paidCount = 0;
  let pendingCount = 0;
  let unpaidCount = 0;
  let totalFeesCollected = 0;
  let outstandingFees = 0;
  let membershipFeeTotal = 0;
  let activeCount = 0;
  let suspendedCount = 0;
  let inactiveCount = 0;

  for (const m of members) {
    const fee = Number(m.membershipFee);
    membershipFeeTotal += fee;
    if (m.feeStatus === "paid") {
      paidCount++;
      totalFeesCollected += fee;
    } else if (m.feeStatus === "pending" || m.feeStatus === "partial") {
      pendingCount++;
      outstandingFees += fee;
    } else if (m.feeStatus === "exempt") {
      // Exempt members owe nothing — excluded from outstanding totals.
    } else {
      unpaidCount++;
      outstandingFees += fee;
    }
    const status = m.frfStatus ?? "active";
    if (status === "suspended") suspendedCount++;
    else if (status === "inactive") inactiveCount++;
    else activeCount++;
  }

  // FRF aggregates: pending/collected contribution totals, members still
  // owing, and open (active) cases.
  const [frfAgg] = (
    await db.execute(sql`
      SELECT
        COALESCE(SUM(GREATEST(amount - amount_paid, 0)) FILTER (WHERE status IN ('pending', 'partial')), 0) AS pending_total,
        COALESCE(SUM(amount_paid) FILTER (WHERE status NOT IN ('cancelled')), 0) AS collected_total,
        COALESCE(SUM(amount) FILTER (WHERE status NOT IN ('cancelled', 'exempt')), 0) AS committed_total,
        COUNT(DISTINCT member_id) FILTER (WHERE status = 'pending') AS members_pending,
        COUNT(DISTINCT member_id) FILTER (WHERE status = 'partial') AS members_partial,
        COUNT(DISTINCT member_id) FILTER (WHERE status = 'paid') AS members_paid
      FROM frf_contributions
    `)
  ).rows as Array<{
    pending_total: string | number;
    collected_total: string | number;
    committed_total: string | number;
    members_pending: string | number;
    members_partial: string | number;
    members_paid: string | number;
  }>;

  const [caseAgg] = (
    await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('disbursed', 'rejected')) AS open_count,
        COUNT(*) FILTER (WHERE status IN ('disbursed', 'rejected')) AS closed_count,
        COALESCE(SUM(amount_requested) FILTER (WHERE status NOT IN ('rejected')), 0) AS target_total
      FROM frf_claims
    `)
  ).rows as Array<{ open_count: string | number; closed_count: string | number; target_total: string | number }>;

  res.json({
    totalMembers: members.length,
    paidMembersCount: paidCount,
    pendingMembersCount: pendingCount,
    unpaidMembersCount: unpaidCount,
    totalFeesCollected,
    outstandingFees,
    membershipFeeTotal,
    activeMembersCount: activeCount,
    suspendedMembersCount: suspendedCount,
    inactiveMembersCount: inactiveCount,
    frfOutstandingTotal: Number(frfAgg?.pending_total ?? 0),
    frfCollectedTotal: Number(frfAgg?.collected_total ?? 0),
    frfCommittedTotal: Number(frfAgg?.committed_total ?? 0),
    frfTargetTotal: Number(caseAgg?.target_total ?? 0),
    activeFrfCasesCount: Number(caseAgg?.open_count ?? 0),
    closedFrfCasesCount: Number(caseAgg?.closed_count ?? 0),
    membersPendingFrfCount: Number(frfAgg?.members_pending ?? 0),
    membersPartialFrfCount: Number(frfAgg?.members_partial ?? 0),
    membersPaidFrfCount: Number(frfAgg?.members_paid ?? 0),
  });
});

router.get("/dashboard/pending", async (req, res): Promise<void> => {
  const parsed = GetPendingMembersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // `month` query param retained for API compatibility but no longer used.
  void parsed.data.month;
  const members = await db.select().from(membersTable);

  const result = [];
  for (const m of members) {
    if (m.feeStatus === "paid" || m.feeStatus === "exempt") continue;
    result.push({
      memberId: m.id,
      fullName: m.fullName,
      mobileNumber: m.mobileNumber,
      membershipId: m.membershipId,
      city: m.city,
      country: m.country,
      membershipFee: Number(m.membershipFee),
      feeStatus: m.feeStatus === "pending" || m.feeStatus === "partial" ? "pending" : "unpaid",
      refMemberName: m.refMemberName ?? "",
      refMemberId: m.refMemberId ?? "",
    });
  }
  result.sort((a, b) => a.fullName.localeCompare(b.fullName));
  res.json(result);
});

router.get("/dashboard/recent-payments", async (req, res): Promise<void> => {
  const parsed = GetRecentPaymentsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const limit = Math.min(50, Math.max(1, parsed.data.limit ?? 10));
  const rows = await db
    .select({ payment: paymentsTable, member: membersTable })
    .from(paymentsTable)
    .innerJoin(membersTable, eq(paymentsTable.memberId, membersTable.id))
    .orderBy(desc(paymentsTable.paidAt))
    .limit(limit);

  res.json(
    rows.map((r) => {
      const api = paymentToApi(r.payment, {
        fullName: r.member.fullName,
        membershipId: r.member.membershipId,
      });
      return {
        id: api.id,
        memberId: api.memberId,
        memberName: api.memberName,
        membershipId: api.membershipId,
        paymentType: api.paymentType,
        amountPaid: api.amountPaid,
        paymentMethod: api.paymentMethod,
        receiptNumber: api.receiptNumber,
        paidAt: api.paidAt,
      };
    }),
  );
});

router.get("/dashboard/monthly-collection", async (req, res): Promise<void> => {
  const parsed = GetMonthlyCollectionQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const months = Math.min(24, Math.max(1, parsed.data.months ?? 6));
  const paymentType = parsed.data.paymentType;

  const monthExpr = sql<string>`to_char(${paymentsTable.paidAt}, 'YYYY-MM')`;
  const base = db
    .select({
      month: monthExpr,
      total: sum(paymentsTable.amountPaid),
      cnt: sql<number>`count(${paymentsTable.id})`,
    })
    .from(paymentsTable);
  const rows = await (paymentType
    ? base.where(eq(paymentsTable.paymentType, paymentType))
    : base
  ).groupBy(monthExpr);

  const map = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    map.set(r.month, { total: Number(r.total ?? 0), count: Number(r.cnt) });
  }

  const out: { month: string; total: number; paymentCount: number }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const v = map.get(key);
    out.push({
      month: key,
      total: v?.total ?? 0,
      paymentCount: v?.count ?? 0,
    });
  }
  res.json(out);
});

router.get(
  "/dashboard/payment-method-breakdown",
  async (req, res): Promise<void> => {
    const parsed = GetPaymentMethodBreakdownQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const paymentType = parsed.data.paymentType?.trim();
    const rows = await db
      .select({
        method: paymentsTable.paymentMethod,
        total: sum(paymentsTable.amountPaid),
        cnt: sql<number>`count(${paymentsTable.id})`,
      })
      .from(paymentsTable)
      .where(
        paymentType
          ? eq(paymentsTable.paymentType, paymentType)
          : undefined,
      )
      .groupBy(paymentsTable.paymentMethod);
    res.json(
      rows.map((r) => ({
        method: r.method,
        total: Number(r.total ?? 0),
        count: Number(r.cnt),
      })),
    );
  },
);

router.get("/dashboard/sponsor-pipeline", async (req, res): Promise<void> => {
  const rows = await db.select().from(sponsorsTable);

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  let totalPledged = 0;
  let totalCollected = 0;
  let overdueCount = 0;
  let upcomingDueCount = 0;

  const byTier: Record<string, { count: number; pledged: number; collected: number }> = {};

  for (const r of rows) {
    const pledged = Number(r.totalAmount);
    const collected = Number(r.paidAmount);
    totalPledged += pledged;
    totalCollected += collected;

    const tier = r.tier || "bronze";
    if (!byTier[tier]) byTier[tier] = { count: 0, pledged: 0, collected: 0 };
    byTier[tier].count++;
    byTier[tier].pledged += pledged;
    byTier[tier].collected += collected;

    if (r.status === "overdue") overdueCount++;
    if (r.dueDate && r.dueDate > now && r.dueDate <= in7Days && r.status !== "paid") {
      upcomingDueCount++;
    }
  }

  const tierBreakdown = Object.entries(byTier).map(([tier, v]) => ({
    tier,
    count: v.count,
    pledged: v.pledged,
    collected: v.collected,
    pending: Math.max(0, v.pledged - v.collected),
  }));

  res.json({
    totalSponsors: rows.length,
    totalPledged,
    totalCollected,
    totalPending: Math.max(0, totalPledged - totalCollected),
    overdueCount,
    upcomingDueCount,
    tierBreakdown,
  });
});

router.get("/dashboard/financial-summary", async (req, res): Promise<void> => {
  const { month: qMonth } = req.query;
  const month = (typeof qMonth === "string" && qMonth.trim()) || currentMonth();

  const membersAll = await db.select().from(membersTable);

  // Sponsor collections
  const sponsorRows = await db.select().from(sponsorsTable);
  let sponsorAllTime = 0;
  let sponsorPledgedAllTime = 0;
  let sponsorPendingCount = 0;
  for (const s of sponsorRows) {
    sponsorAllTime += Number(s.paidAmount);
    sponsorPledgedAllTime += Number(s.totalAmount);
    if (s.status === "overdue" || s.status === "partial" || s.status === "pending") sponsorPendingCount++;
  }

  // Membership fee collections (one-time fee per member)
  let feesCollected = 0;
  let feesOutstanding = 0;
  for (const m of membersAll) {
    const fee = Number(m.membershipFee);
    if (m.feeStatus === "paid") feesCollected += fee;
    else if (m.feeStatus !== "exempt") feesOutstanding += fee;
  }

  res.json({
    month,
    members: {
      collectedAllTime: feesCollected,
      collectedThisMonth: feesCollected,
      expectedThisMonth: feesCollected + feesOutstanding,
      pendingThisMonth: feesOutstanding,
      totalMembers: membersAll.length,
    },
    sponsors: {
      collectedAllTime: sponsorAllTime,
      pledgedAllTime: sponsorPledgedAllTime,
      pendingAllTime: Math.max(0, sponsorPledgedAllTime - sponsorAllTime),
      totalSponsors: sponsorRows.length,
      pendingCount: sponsorPendingCount,
    },
    combined: {
      collectedAllTime: feesCollected + sponsorAllTime,
      collectedThisMonth: feesCollected,
    },
  });
});

router.get("/dashboard/alerts", async (req, res): Promise<void> => {
  const alerts: {
    id: string;
    severity: "critical" | "warning" | "info";
    type: string;
    title: string;
    description: string;
    count: number;
    link: string;
  }[] = [];

  const [membersAll, paymentsAll, sponsorRows] = await Promise.all([
    db.select().from(membersTable),
    db.select().from(paymentsTable),
    db.select().from(sponsorsTable),
  ]);

  // Members with missing required fields
  const missingFields = membersAll.filter(
    (m) => !m.mobileNumber || !m.fullName || !m.membershipId,
  );
  if (missingFields.length > 0) {
    alerts.push({
      id: "missing-member-fields",
      severity: "critical",
      type: "missing_data",
      title: "Members with missing data",
      description: `${missingFields.length} member${missingFields.length === 1 ? "" : "s"} have empty required fields.`,
      count: missingFields.length,
      link: "/members",
    });
  }

  // Members who have not paid their membership fee
  const unpaidMembers = membersAll.filter((m) => m.feeStatus === "unpaid");
  if (unpaidMembers.length > 0) {
    alerts.push({
      id: "unpaid-members",
      severity: "critical",
      type: "pending_payment",
      title: "Unpaid membership fees",
      description: `${unpaidMembers.length} member${unpaidMembers.length === 1 ? "" : "s"} have not paid the membership fee.`,
      count: unpaidMembers.length,
      link: "/pending",
    });
  }

  // Members with pending membership fee
  const pendingMembers = membersAll.filter((m) => m.feeStatus === "pending" || m.feeStatus === "partial");
  if (pendingMembers.length > 0) {
    alerts.push({
      id: "pending-members",
      severity: "warning",
      type: "pending_payment",
      title: "Pending membership fees",
      description: `${pendingMembers.length} member${pendingMembers.length === 1 ? "" : "s"} have a pending membership fee.`,
      count: pendingMembers.length,
      link: "/pending",
    });
  }

  // Overdue sponsors
  const overdueSponsors = sponsorRows.filter((s) => s.status === "overdue");
  if (overdueSponsors.length > 0) {
    alerts.push({
      id: "overdue-sponsors",
      severity: "critical",
      type: "pending_payment",
      title: "Overdue sponsor payments",
      description: `${overdueSponsors.length} sponsor${overdueSponsors.length === 1 ? "" : "s"} with overdue amounts.`,
      count: overdueSponsors.length,
      link: "/sponsors",
    });
  }

  // Sponsors due within 7 days
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingSponsorDue = sponsorRows.filter(
    (s) => s.dueDate && s.dueDate > now && s.dueDate <= in7Days && s.status !== "paid",
  );
  if (upcomingSponsorDue.length > 0) {
    alerts.push({
      id: "upcoming-sponsor-due",
      severity: "warning",
      type: "upcoming_due",
      title: "Sponsors due within 7 days",
      description: `${upcomingSponsorDue.length} sponsor${upcomingSponsorDue.length === 1 ? "" : "s"} have payments due in the next week.`,
      count: upcomingSponsorDue.length,
      link: "/sponsors",
    });
  }

  // Sponsors missing contact info
  const sponsorsMissingContact = sponsorRows.filter((s) => !s.phone && !s.email);
  if (sponsorsMissingContact.length > 0) {
    alerts.push({
      id: "sponsors-missing-contact",
      severity: "warning",
      type: "missing_data",
      title: "Sponsors missing contact info",
      description: `${sponsorsMissingContact.length} sponsor${sponsorsMissingContact.length === 1 ? "" : "s"} have no phone or email.`,
      count: sponsorsMissingContact.length,
      link: "/sponsors",
    });
  }

  // Data integrity: payments with zero amount
  const zeroPayments = paymentsAll.filter((p) => Number(p.amountPaid) <= 0);
  if (zeroPayments.length > 0) {
    alerts.push({
      id: "zero-amount-payments",
      severity: "warning",
      type: "data_inconsistency",
      title: "Payments with zero amount",
      description: `${zeroPayments.length} payment record${zeroPayments.length === 1 ? "" : "s"} have zero or negative amount.`,
      count: zeroPayments.length,
      link: "/payments",
    });
  }

  // Positive info alerts
  const paidCount = membersAll.filter((m) => m.feeStatus === "paid").length;
  if (paidCount > 0) {
    alerts.push({
      id: "paid-members",
      severity: "info",
      type: "success",
      title: "Members with paid fees",
      description: `${paidCount} member${paidCount === 1 ? "" : "s"} have paid the membership fee.`,
      count: paidCount,
      link: "/payments",
    });
  }

  const paidSponsors = sponsorRows.filter((s) => s.status === "paid").length;
  if (paidSponsors > 0) {
    alerts.push({
      id: "paid-sponsors",
      severity: "info",
      type: "success",
      title: "Sponsors fully paid",
      description: `${paidSponsors} sponsor${paidSponsors === 1 ? "" : "s"} have completed their sponsorship payment.`,
      count: paidSponsors,
      link: "/sponsors",
    });
  }

  // FRF contribution alerts derived from the contribution ledger.
  const frfLedger = await db
    .select({ contribution: frfContributionsTable, approvedDate: frfClaimsTable.approvedDate })
    .from(frfContributionsTable)
    .innerJoin(frfClaimsTable, eq(frfContributionsTable.claimId, frfClaimsTable.id));
  const nowFrf = new Date();
  let frfPendingCount = 0;
  let frfOverdueCount = 0;
  let frfOutstandingAmount = 0;
  for (const { contribution: c, approvedDate } of frfLedger) {
    const st = deriveContributionStatus(c, approvedDate, nowFrf);
    if (st === "pending") { frfPendingCount++; frfOutstandingAmount += Number(c.amount); }
    else if (st === "overdue") { frfOverdueCount++; frfOutstandingAmount += Number(c.amount); }
  }
  if (frfOverdueCount > 0) {
    alerts.push({
      id: "frf-overdue-contributions",
      severity: "critical",
      type: "frf_overdue",
      title: "Overdue FRF contributions",
      description: `${frfOverdueCount} FRF contribution${frfOverdueCount === 1 ? " is" : "s are"} overdue (30+ days since claim approval).`,
      count: frfOverdueCount,
      link: "/frf",
    });
  }
  if (frfPendingCount > 0) {
    alerts.push({
      id: "frf-pending-contributions",
      severity: "warning",
      type: "frf_pending",
      title: "Pending FRF contributions",
      description: `${frfPendingCount} FRF contribution${frfPendingCount === 1 ? "" : "s"} pending, SAR ${frfOutstandingAmount.toLocaleString()} outstanding in total.`,
      count: frfPendingCount,
      link: "/frf",
    });
  }
  const recentlyApprovedClaims = await db
    .select()
    .from(frfClaimsTable)
    .where(and(eq(frfClaimsTable.status, "approved"), gte(frfClaimsTable.approvedDate, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))));
  if (recentlyApprovedClaims.length > 0) {
    alerts.push({
      id: "frf-recently-approved",
      severity: "info",
      type: "frf_approved",
      title: "Newly approved FRF claims",
      description: `${recentlyApprovedClaims.length} FRF claim${recentlyApprovedClaims.length === 1 ? " was" : "s were"} approved in the last 7 days — contributions are being collected.`,
      count: recentlyApprovedClaims.length,
      link: "/frf",
    });
  }

  // Sort: critical first, then warning, then info
  const order = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);

  res.json(alerts);
});

router.get("/dashboard/cash-flow", async (req, res): Promise<void> => {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentQuarter = Math.floor(now.getUTCMonth() / 3) + 1;

  const rawYear = parseInt(req.query.year as string, 10);
  const rawQuarter = parseInt(req.query.quarter as string, 10);
  const selectedYear = (!isNaN(rawYear) && rawYear >= 2000 && rawYear <= 2100) ? rawYear : currentYear;
  const selectedQuarter = (!isNaN(rawQuarter) && rawQuarter >= 1 && rawQuarter <= 4) ? rawQuarter : currentQuarter;

  const quarterStart = new Date(Date.UTC(selectedYear, (selectedQuarter - 1) * 3, 1));
  const quarterEnd = new Date(Date.UTC(selectedYear, selectedQuarter * 3, 0, 23, 59, 59));

  const [memberTotal, sponsorRows, frfClaims, eventsAll] = await Promise.all([
    db.select({ total: sum(paymentsTable.amountPaid) }).from(paymentsTable),
    db.select().from(sponsorsTable),
    db.select().from(frfClaimsTable),
    db.select().from(eventsTable),
  ]);

  const totalCollectedMembers = Number(memberTotal[0]?.total ?? 0);
  const totalCollectedSponsors = sponsorRows.reduce((s, r) => s + Number(r.paidAmount), 0);
  const totalCollected = totalCollectedMembers + totalCollectedSponsors;

  const totalDisbursed = frfClaims
    .filter((c) => c.status === "disbursed" || c.status === "approved")
    .reduce((s, c) => s + Number(c.amountApproved), 0);

  const netBalance = totalCollected - totalDisbursed;

  const pendingClaimsCount = frfClaims.filter((c) => c.status === "pending" || c.status === "under_review").length;

  const eventsThisQuarter = eventsAll.filter((e) => {
    const d = e.eventDate ? new Date(e.eventDate) : null;
    return d && d >= quarterStart && d <= quarterEnd;
  }).length;

  const upcomingEvents = eventsAll
    .filter((e) => e.eventDate && new Date(e.eventDate) > now)
    .sort((a, b) => new Date(a.eventDate!).getTime() - new Date(b.eventDate!).getTime())
    .slice(0, 5)
    .map((e) => ({ id: e.id, title: e.name, startDate: e.eventDate ? new Date(e.eventDate).toISOString() : null, location: e.location }));

  res.json({
    totalCollected,
    totalDisbursed,
    balance: netBalance,
    netBalance,
    pendingClaimsCount,
    eventsThisQuarter,
    selectedYear,
    selectedQuarter,
    upcomingEvents,
  });
});

const FRF_GRANTED = ["approved", "disbursed"];
const WELFARE_GRANTED = ["approved", "completed"];

router.get("/dashboard/impact", async (_req, res): Promise<void> => {
  const [members, frfClaims, welfare, loans] = await Promise.all([
    db.select().from(membersTable),
    db.select().from(frfClaimsTable),
    db.select().from(welfareRequestsTable),
    db.select().from(loansTable),
  ]);

  const frfGranted = frfClaims.filter((c) => FRF_GRANTED.includes(c.status));
  const welfareGranted = welfare.filter((w) => WELFARE_GRANTED.includes(w.status));

  const welfareOfType = (type: string) =>
    welfareGranted.filter((w) => w.serviceType === type);

  const medicalAidCases = welfareOfType("medical_aid").length;
  const emergencyReliefCases = welfareOfType("emergency_response").length;
  const generalReliefCases = welfareOfType("general_relief").length;
  const airTicketBeneficiaries =
    welfareOfType("air_ticket").length +
    frfGranted.filter((c) => c.claimType === "air_ticket").length;

  const frfAmount = frfGranted.reduce((s, c) => s + Number(c.amountApproved), 0);
  const welfareAmount = welfareGranted.reduce((s, w) => s + Number(w.amountApproved), 0);
  const loanAmount = loans.reduce((s, l) => s + Number(l.principalAmount), 0);
  const medicalAmount = welfareOfType("medical_aid").reduce((s, w) => s + Number(w.amountApproved), 0);
  const airTicketAmount =
    welfareOfType("air_ticket").reduce((s, w) => s + Number(w.amountApproved), 0) +
    frfGranted.filter((c) => c.claimType === "air_ticket").reduce((s, c) => s + Number(c.amountApproved), 0);
  const emergencyAmount = welfareOfType("emergency_response").reduce((s, w) => s + Number(w.amountApproved), 0);
  const generalAmount = welfareOfType("general_relief").reduce((s, w) => s + Number(w.amountApproved), 0);

  const totalAssistanceDistributed = frfAmount + welfareAmount + loanAmount;

  const assistanceByCategory = [
    { category: "FRF", count: frfGranted.length, amount: frfAmount },
    { category: "Medical Aid", count: medicalAidCases, amount: medicalAmount },
    { category: "Loans", count: loans.length, amount: loanAmount },
    { category: "Air Ticket", count: airTicketBeneficiaries, amount: airTicketAmount },
    { category: "Emergency Relief", count: emergencyReliefCases, amount: emergencyAmount },
    { category: "General Relief", count: generalReliefCases, amount: generalAmount },
  ];

  const welfareTypeCounts = new Map<string, number>();
  for (const w of welfare) {
    welfareTypeCounts.set(w.serviceType, (welfareTypeCounts.get(w.serviceType) ?? 0) + 1);
  }
  const welfareByType = [...welfareTypeCounts.entries()].map(([type, count]) => ({ type, count }));

  res.json({
    totalMembers: members.length,
    frfBeneficiaries: frfGranted.length,
    medicalAidCases,
    loanBeneficiaries: loans.length,
    airTicketBeneficiaries,
    emergencyReliefCases,
    generalReliefCases,
    totalWelfareRequests: welfare.length,
    totalAssistanceDistributed,
    assistanceByCategory,
    welfareByType,
  });
});

interface PerfEntry {
  name: string;
  membersRecruited: number;
  feesCollected: number;
  frfCount: number;
  frfAmount: number;
  welfareHandled: number;
  loansProcessed: number;
  medicalAidProcessed: number;
  emergencyResolved: number;
  frfReferred: number;
}

router.get("/dashboard/committee-performance", async (req, res): Promise<void> => {
  // Optional date-range filter (additive; default behavior unchanged).
  // Dates are compared as calendar days in Asia/Riyadh (the organization's
  // timezone), so "from 2026-07-01" means from the start of July 1 in KSA.
  const parseDay = (v: unknown): string | null =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  const from = parseDay(req.query.from);
  const to = parseDay(req.query.to);
  const dayFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const inRange = (d: Date | null | undefined): boolean => {
    if (!from && !to) return true;
    if (!d) return false;
    const day = dayFmt.format(d); // "YYYY-MM-DD" — lexicographically comparable
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  };

  const [members, frfClaims, welfare, loans] = await Promise.all([
    db.select().from(membersTable),
    db.select().from(frfClaimsTable),
    db.select().from(welfareRequestsTable),
    db.select().from(loansTable),
  ]);

  const map = new Map<string, PerfEntry>();
  const get = (raw: string): PerfEntry | null => {
    const name = raw.trim();
    if (!name) return null;
    let entry = map.get(name);
    if (!entry) {
      entry = {
        name,
        membersRecruited: 0,
        feesCollected: 0,
        frfCount: 0,
        frfAmount: 0,
        welfareHandled: 0,
        loansProcessed: 0,
        medicalAidProcessed: 0,
        emergencyResolved: 0,
        frfReferred: 0,
      };
      map.set(name, entry);
    }
    return entry;
  };

  for (const m of members) {
    if (!inRange(m.createdAt)) continue;
    const recruiter = get(m.refMemberName ?? "");
    if (recruiter) {
      recruiter.membersRecruited += 1;
      if (m.frfStatus === "active") recruiter.frfReferred += 1;
    }
  }

  for (const c of frfClaims) {
    if (!inRange(c.createdAt)) continue;
    if (!FRF_GRANTED.includes(c.status)) continue;
    const actor = get(c.approvedBy || c.disbursedBy);
    if (actor) {
      actor.frfCount += 1;
      actor.frfAmount += Number(c.amountApproved);
    }
  }

  for (const w of welfare) {
    if (!inRange(w.createdAt)) continue;
    if (!WELFARE_GRANTED.includes(w.status)) continue;
    const actor = get(w.approvedBy || w.completedBy || w.assignedTo);
    if (actor) {
      actor.welfareHandled += 1;
      if (w.serviceType === "medical_aid") actor.medicalAidProcessed += 1;
      if (w.serviceType === "emergency_response") actor.emergencyResolved += 1;
    }
  }

  for (const l of loans) {
    if (!inRange(l.createdAt)) continue;
    const actor = get(l.convenorName ?? "");
    if (actor) actor.loansProcessed += 1;
  }

  const entries = [...map.values()]
    .map((e) => {
      // Membership fee is fixed at SAR 100 per recruited member, so fees
      // collected are derived directly from recruitment (no manual values).
      const feesCollected = e.membersRecruited * 100;
      return {
        ...e,
        feesCollected,
        // Loans are intentionally excluded from the activity score.
        totalContributionScore:
          e.membersRecruited * 10 +
          e.frfReferred * 5 +
          e.welfareHandled * 5 +
          Math.round(feesCollected / 100),
        totalActions:
          e.membersRecruited +
          e.frfCount +
          e.welfareHandled,
      };
    })
    .sort((a, b) => b.totalContributionScore - a.totalContributionScore);

  res.json({ entries });
});

const WELFARE_CATEGORY: Record<string, string> = {
  medical_aid: "Medical Aid",
  air_ticket: "Air Ticket",
  emergency_response: "Emergency Relief",
  general_relief: "General Relief",
  india_rep: "India Repatriation",
};

const FRF_CLAIM_LABEL: Record<string, string> = {
  death_benefit: "FRF — Death Benefit",
  emergency: "FRF — Emergency",
  air_ticket: "FRF — Air Ticket",
  other: "FRF",
};

router.get("/dashboard/member-assistance/:memberId", async (req, res): Promise<void> => {
  const memberId = req.params.memberId;

  const memberRows = await db.select().from(membersTable).where(eq(membersTable.id, memberId));
  const member = memberRows[0];
  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  const mid = member.membershipId?.trim() ?? "";

  const frfWhere = mid
    ? or(eq(frfClaimsTable.memberId, memberId), eq(frfClaimsTable.membershipId, mid))
    : eq(frfClaimsTable.memberId, memberId);
  const welfareWhere = mid
    ? or(eq(welfareRequestsTable.memberId, memberId), eq(welfareRequestsTable.membershipId, mid))
    : eq(welfareRequestsTable.memberId, memberId);

  const [frfClaims, welfare, loans] = await Promise.all([
    db.select().from(frfClaimsTable).where(frfWhere),
    db.select().from(welfareRequestsTable).where(welfareWhere),
    db.select().from(loansTable).where(eq(loansTable.memberId, memberId)),
  ]);

  const items = [
    ...frfClaims.map((c) => ({
      id: c.id,
      category: FRF_CLAIM_LABEL[c.claimType] ?? "FRF",
      referenceNumber: "",
      date: c.claimDate ? c.claimDate.toISOString() : null,
      amountRequested: Number(c.amountRequested),
      amountApproved: Number(c.amountApproved),
      status: c.status,
      description: c.description ?? "",
    })),
    ...welfare.map((w) => ({
      id: w.id,
      category: WELFARE_CATEGORY[w.serviceType] ?? w.serviceType,
      referenceNumber: w.requestNumber ?? "",
      date: w.submittedAt ? w.submittedAt.toISOString() : null,
      amountRequested: Number(w.amountRequested),
      amountApproved: Number(w.amountApproved),
      status: w.status,
      description: w.description ?? "",
    })),
    ...loans.map((l) => ({
      id: l.id,
      category: "Loan",
      referenceNumber: "",
      date: l.disbursedDate ?? null,
      amountRequested: Number(l.principalAmount),
      amountApproved: Number(l.principalAmount),
      status: l.status,
      description: l.description ?? l.loanType,
    })),
  ].sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db_ = b.date ? new Date(b.date).getTime() : 0;
    return db_ - da;
  });

  const totalReceived = items.reduce((s, i) => s + i.amountApproved, 0);

  res.json({ items, totalReceived, totalCount: items.length });
});

router.get("/dashboard/frf-overview", async (req, res): Promise<void> => {
  try {
    const [claims, ledger, membersAll] = await Promise.all([
      db.select().from(frfClaimsTable),
      db
        .select({ contribution: frfContributionsTable, approvedDate: frfClaimsTable.approvedDate })
        .from(frfContributionsTable)
        .innerJoin(frfClaimsTable, eq(frfContributionsTable.claimId, frfClaimsTable.id)),
      db.select().from(membersTable),
    ]);

    const approvedClaims = claims.filter(
      (c) => c.status === "approved" || c.status === "disbursed",
    ).length;

    const now = new Date();
    let expectedTotal = 0;
    let collectedTotal = 0;
    const outstandingByMember = new Map<string, { outstanding: number; pendingClaims: number }>();

    for (const { contribution: c, approvedDate } of ledger) {
      const status = deriveContributionStatus(c, approvedDate, now);
      if (status === "cancelled" || status === "exempt") continue;
      const amount = Number(c.amount);
      const paid = Math.min(Number(c.amountPaid), amount);
      expectedTotal += amount;
      collectedTotal += paid;
      const remaining = amount - paid;
      if (remaining > 0) {
        const cur = outstandingByMember.get(c.memberId) ?? { outstanding: 0, pendingClaims: 0 };
        cur.outstanding += remaining;
        cur.pendingClaims += 1;
        outstandingByMember.set(c.memberId, cur);
      }
    }

    const memberById = new Map(membersAll.map((m) => [m.id, m]));
    const topOutstandingMembers = [...outstandingByMember.entries()]
      .sort((a, b) => b[1].outstanding - a[1].outstanding)
      .slice(0, 8)
      .flatMap(([memberId, agg]) => {
        const m = memberById.get(memberId);
        if (!m) return [];
        return [{
          memberId,
          fullName: m.fullName,
          membershipId: m.membershipId,
          photoUrl: m.photoUrl ?? null,
          outstanding: agg.outstanding,
          pendingClaims: agg.pendingClaims,
        }];
      });

    res.json({
      approvedClaims,
      expectedTotal,
      collectedTotal,
      outstandingTotal: expectedTotal - collectedTotal,
      collectionRate: expectedTotal > 0 ? Math.round((collectedTotal / expectedTotal) * 100) : 0,
      topOutstandingMembers,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get FRF overview" });
  }
});

export default router;
