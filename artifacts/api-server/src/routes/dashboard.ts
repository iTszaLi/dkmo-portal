import { Router, type IRouter } from "express";
import { eq, desc, sum, sql, lte, and, ne, gte } from "drizzle-orm";
import { db, membersTable, paymentsTable, sponsorsTable, frfClaimsTable, eventsTable } from "@workspace/db";
import {
  GetDashboardSummaryQueryParams,
  GetPendingMembersQueryParams,
  GetRecentPaymentsQueryParams,
  GetMonthlyCollectionQueryParams,
  GetPaymentMethodBreakdownQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { currentMonth, paymentToApi } from "../lib/serializers";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const parsed = GetDashboardSummaryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const month = parsed.data.month?.trim() || currentMonth();

  const members = await db.select().from(membersTable);
  const paymentsThisMonth = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.month, month));

  const allPayments = await db
    .select({ total: sum(paymentsTable.amountPaid) })
    .from(paymentsTable);

  const paidByMember = new Map<string, number>();
  for (const p of paymentsThisMonth) {
    const prev = paidByMember.get(p.memberId) ?? 0;
    paidByMember.set(p.memberId, prev + Number(p.amountPaid));
  }

  let totalCollectedThisMonth = 0;
  let expectedThisMonth = 0;
  let paidCount = 0;
  let partialCount = 0;
  let unpaidCount = 0;

  for (const m of members) {
    const monthly = Number(m.monthlyAmount);
    expectedThisMonth += monthly;
    const paid = paidByMember.get(m.id) ?? 0;
    totalCollectedThisMonth += paid;
    if (paid <= 0) unpaidCount++;
    else if (paid < monthly) partialCount++;
    else paidCount++;
  }

  const pendingAmount = Math.max(0, expectedThisMonth - totalCollectedThisMonth);

  res.json({
    month,
    totalMembers: members.length,
    totalCollectedThisMonth,
    expectedThisMonth,
    pendingAmount,
    paidMembersCount: paidCount,
    partialMembersCount: partialCount,
    unpaidMembersCount: unpaidCount,
    totalCollectedAllTime: Number(allPayments[0]?.total ?? 0),
  });
});

router.get("/dashboard/pending", async (req, res): Promise<void> => {
  const parsed = GetPendingMembersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const month = parsed.data.month?.trim() || currentMonth();
  const members = await db.select().from(membersTable);
  const monthPayments = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.month, month));

  const paidByMember = new Map<string, number>();
  for (const p of monthPayments) {
    const prev = paidByMember.get(p.memberId) ?? 0;
    paidByMember.set(p.memberId, prev + Number(p.amountPaid));
  }

  const result = [];
  for (const m of members) {
    const monthly = Number(m.monthlyAmount);
    const paid = paidByMember.get(m.id) ?? 0;
    if (paid >= monthly && monthly > 0) continue;
    if (monthly === 0 && paid === 0) {
      // include but mark as unpaid since they owe 0
    }
    result.push({
      memberId: m.id,
      fullName: m.fullName,
      mobileNumber: m.mobileNumber,
      membershipId: m.membershipId,
      city: m.city,
      country: m.country,
      monthlyAmount: monthly,
      amountPaid: paid,
      amountDue: Math.max(0, monthly - paid),
      status: paid > 0 ? "partial" : "unpaid",
    });
  }
  result.sort((a, b) => b.amountDue - a.amountDue);
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
        month: api.month,
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

  const rows = await db
    .select({
      month: paymentsTable.month,
      total: sum(paymentsTable.amountPaid),
      cnt: sql<number>`count(${paymentsTable.id})`,
    })
    .from(paymentsTable)
    .groupBy(paymentsTable.month);

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
    const month = parsed.data.month?.trim() || currentMonth();
    const rows = await db
      .select({
        method: paymentsTable.paymentMethod,
        total: sum(paymentsTable.amountPaid),
        cnt: sql<number>`count(${paymentsTable.id})`,
      })
      .from(paymentsTable)
      .where(eq(paymentsTable.month, month))
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

  // Member collections
  const [memberAllTime, memberThisMonth, membersAll] = await Promise.all([
    db.select({ total: sum(paymentsTable.amountPaid) }).from(paymentsTable),
    db.select({ total: sum(paymentsTable.amountPaid) }).from(paymentsTable).where(eq(paymentsTable.month, month)),
    db.select().from(membersTable),
  ]);

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

  const memberTotal = Number(memberAllTime[0]?.total ?? 0);
  const memberMonth = Number(memberThisMonth[0]?.total ?? 0);

  // Expected member amount this month
  const expectedMonth = membersAll.reduce((s, m) => s + Number(m.monthlyAmount), 0);

  res.json({
    month,
    members: {
      collectedAllTime: memberTotal,
      collectedThisMonth: memberMonth,
      expectedThisMonth: expectedMonth,
      pendingThisMonth: Math.max(0, expectedMonth - memberMonth),
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
      collectedAllTime: memberTotal + sponsorAllTime,
      collectedThisMonth: memberMonth,
    },
  });
});

router.get("/dashboard/alerts", async (req, res): Promise<void> => {
  const month = currentMonth();
  const alerts: {
    id: string;
    severity: "critical" | "warning" | "info";
    type: string;
    title: string;
    description: string;
    count: number;
    link: string;
  }[] = [];

  const [membersAll, paymentsThisMonth, paymentsAll, sponsorRows] = await Promise.all([
    db.select().from(membersTable),
    db.select().from(paymentsTable).where(eq(paymentsTable.month, month)),
    db.select().from(paymentsTable),
    db.select().from(sponsorsTable),
  ]);

  // Build paid-this-month map
  const paidMap = new Map<string, number>();
  for (const p of paymentsThisMonth) {
    paidMap.set(p.memberId, (paidMap.get(p.memberId) ?? 0) + Number(p.amountPaid));
  }

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

  // Members unpaid this month
  const unpaidMembers = membersAll.filter((m) => {
    const paid = paidMap.get(m.id) ?? 0;
    return paid === 0 && Number(m.monthlyAmount) > 0;
  });
  if (unpaidMembers.length > 0) {
    alerts.push({
      id: "unpaid-members",
      severity: "critical",
      type: "pending_payment",
      title: "Members unpaid this month",
      description: `${unpaidMembers.length} member${unpaidMembers.length === 1 ? "" : "s"} have not paid for ${month}.`,
      count: unpaidMembers.length,
      link: "/pending",
    });
  }

  // Members with partial payment this month
  const partialMembers = membersAll.filter((m) => {
    const paid = paidMap.get(m.id) ?? 0;
    const due = Number(m.monthlyAmount);
    return paid > 0 && paid < due;
  });
  if (partialMembers.length > 0) {
    alerts.push({
      id: "partial-members",
      severity: "warning",
      type: "pending_payment",
      title: "Partial payments this month",
      description: `${partialMembers.length} member${partialMembers.length === 1 ? "" : "s"} have only paid partially for ${month}.`,
      count: partialMembers.length,
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
  const paidCount = membersAll.filter((m) => {
    const paid = paidMap.get(m.id) ?? 0;
    return paid >= Number(m.monthlyAmount) && Number(m.monthlyAmount) > 0;
  }).length;
  if (paidCount > 0) {
    alerts.push({
      id: "paid-members",
      severity: "info",
      type: "success",
      title: "Members paid this month",
      description: `${paidCount} member${paidCount === 1 ? "" : "s"} have fully paid for ${month}.`,
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

export default router;
