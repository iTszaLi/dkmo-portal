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
  dkmoMembershipsTable,
  committeeTermsTable,
  committeeAssignmentsTable,
  meetingsTable,
  meetingAttendanceTable,
  loanPaymentsTable,
  tasksTable,
  documentsTable,
  auditLogsTable,
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
  // membership fees are lifetime ledger records, not monthly collections.
  void parsed.data.month;

  const members = await db.select().from(membersTable);

  let paidCount = 0;
  let pendingCount = 0;
  let unpaidCount = 0;
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
    } else if (m.feeStatus === "pending" || m.feeStatus === "partial") {
      pendingCount++;
      outstandingFees += fee;
    } else if (m.feeStatus === "exempt" || m.feeStatus === "not_applicable" || m.feeStatus === "review") {
      // Exempt/no-evidence/review records are not an assessed outstanding fee.
    } else {
      unpaidCount++;
      outstandingFees += fee;
    }
    const status = m.feeStatus === "paid" ? "active" : "inactive";
    if (status === "inactive") inactiveCount++;
    else activeCount++;
  }

  const [membershipPaymentAgg] = await db
    .select({
      total: sql<string>`coalesce(sum(${paymentsTable.amountPaid}) filter (where ${paymentsTable.status} = 'paid'), 0)::text`,
    })
    .from(paymentsTable)
    .where(eq(paymentsTable.paymentType, "membership_fee"));

  const [loanOutstandingAgg] = (
    await db.execute(sql`
      WITH repayment_totals AS (
        SELECT loan_id, COALESCE(SUM(amount), 0)::numeric AS total_paid
        FROM loan_payments
        GROUP BY loan_id
      )
      SELECT COALESCE(SUM(
        GREATEST(
          l.principal_amount
          - LEAST(
              l.principal_amount,
              (l.emi_amount * l.paid_emis) + COALESCE(rt.total_paid, 0)
            ),
          0
        )
      ), 0)::numeric AS outstanding
      FROM loans l
      LEFT JOIN repayment_totals rt ON rt.loan_id = l.id
      WHERE l.member_id IS NOT NULL
        AND l.disbursed_date IS NOT NULL
        AND l.status NOT IN ('cancelled', 'rejected')
    `)
  ).rows as Array<{ outstanding: string | number }>;

  // FRF aggregates: pending/collected contribution totals for the single
  // active collection case and currently eligible members.
  const [frfAgg] = (
    await db.execute(sql`
      WITH active_case AS (
        SELECT id
        FROM frf_claims
        WHERE status = 'approved'
        ORDER BY approved_date DESC NULLS LAST, created_at DESC
        LIMIT 1
      )
      SELECT
        COALESCE(SUM(GREATEST(fc.amount - fc.amount_paid, 0)) FILTER (WHERE fc.status IN ('pending', 'partial')), 0) AS pending_total,
        COALESCE(SUM(fc.amount_paid) FILTER (WHERE fc.status NOT IN ('cancelled')), 0) AS collected_total,
        COALESCE(SUM(fc.amount) FILTER (WHERE fc.status NOT IN ('cancelled', 'exempt')), 0) AS committed_total,
        COUNT(DISTINCT fc.member_id) FILTER (WHERE fc.status = 'pending') AS members_pending,
        COUNT(DISTINCT fc.member_id) FILTER (WHERE fc.status = 'partial') AS members_partial,
        COUNT(DISTINCT fc.member_id) FILTER (WHERE fc.status = 'paid') AS members_paid
      FROM frf_contributions fc
      INNER JOIN active_case ac ON ac.id = fc.claim_id
      INNER JOIN frf_claims frf ON frf.id = fc.claim_id AND frf.status = 'approved'
      INNER JOIN members m ON m.id = fc.member_id AND m.fee_status = 'paid'
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
      WITH active_case AS (
        SELECT status, amount_requested
        FROM frf_claims
        WHERE status = 'approved'
        ORDER BY approved_date DESC NULLS LAST, created_at DESC
        LIMIT 1
      )
      SELECT
        (SELECT COUNT(*) FROM active_case) AS open_count,
        (SELECT COUNT(*) FROM frf_claims WHERE status IN ('disbursed', 'rejected')) AS closed_count,
        COALESCE((SELECT SUM(amount_requested) FROM active_case), 0) AS target_total
    `)
  ).rows as Array<{ open_count: string | number; closed_count: string | number; target_total: string | number }>;

  const totalMembershipFeesCollected = Number(membershipPaymentAgg?.total ?? 0);
  res.json({
    totalMembers: members.length,
    paidMembersCount: paidCount,
    pendingMembersCount: pendingCount,
    unpaidMembersCount: unpaidCount,
    totalFeesCollected: totalMembershipFeesCollected,
    totalMembershipFeesCollected,
    loanMoneyOutstanding: Number(loanOutstandingAgg?.outstanding ?? 0),
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

router.get("/dashboard/command-center", async (req, res): Promise<void> => {
  const now = new Date();
  const dayFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const monthFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
  });
  const dayKey = (value: Date | string | null | undefined) =>
    value ? dayFormatter.format(value instanceof Date ? value : new Date(value)) : "";
  const monthKey = (value: Date | string | null | undefined) =>
    value ? monthFormatter.format(value instanceof Date ? value : new Date(value)) : "";
  const dateOnly = (value: Date | string | null | undefined) =>
    value ? String(value).slice(0, 10) : "";
  const numberValue = (value: string | number | null | undefined) => Number(value ?? 0);
  const startOfToday = new Date(`${dayKey(now)}T00:00:00+03:00`);
  const today = dayKey(now);
  const currentMonth = monthKey(now);

  try {
    const [
      members,
      membershipApplications,
      payments,
      claims,
      contributionRows,
      committeeTerms,
      committeeAssignments,
      meetings,
      attendance,
      sponsors,
      loans,
      loanPayments,
      events,
      tasks,
      welfare,
      documents,
      auditRows,
    ] = await Promise.all([
      db.select({
        id: membersTable.id,
        fullName: membersTable.fullName,
        membershipId: membersTable.membershipId,
        membershipFee: membersTable.membershipFee,
        feeStatus: membersTable.feeStatus,
        refMemberId: membersTable.refMemberId,
        refMemberName: membersTable.refMemberName,
        membershipDate: membersTable.membershipDate,
        legacyEntryDate: membersTable.legacyEntryDate,
        importBatchId: membersTable.importBatchId,
        createdAt: membersTable.createdAt,
      }).from(membersTable),
      db.select({
        status: dkmoMembershipsTable.status,
        createdAt: dkmoMembershipsTable.createdAt,
      }).from(dkmoMembershipsTable),
      db.select({
        paymentType: paymentsTable.paymentType,
        status: paymentsTable.status,
        amountPaid: paymentsTable.amountPaid,
      }).from(paymentsTable),
      db.select().from(frfClaimsTable),
      db.select({
        contribution: frfContributionsTable,
        memberFeeStatus: membersTable.feeStatus,
      }).from(frfContributionsTable)
        .innerJoin(membersTable, eq(frfContributionsTable.memberId, membersTable.id)),
      db.select().from(committeeTermsTable),
      db.select().from(committeeAssignmentsTable),
      db.select().from(meetingsTable),
      db.select().from(meetingAttendanceTable),
      db.select().from(sponsorsTable),
      db.select().from(loansTable),
      db.select().from(loanPaymentsTable),
      db.select({
        id: eventsTable.id,
        name: eventsTable.name,
        eventDate: eventsTable.eventDate,
        status: eventsTable.status,
      }).from(eventsTable),
      db.select({
        id: tasksTable.id,
        title: tasksTable.title,
        dueDate: tasksTable.dueDate,
        status: tasksTable.status,
        priority: tasksTable.priority,
        updatedAt: tasksTable.updatedAt,
      }).from(tasksTable),
      db.select({
        status: welfareRequestsTable.status,
        serviceType: welfareRequestsTable.serviceType,
        memberId: welfareRequestsTable.memberId,
        amountApproved: welfareRequestsTable.amountApproved,
      }).from(welfareRequestsTable),
      db.select({
        id: documentsTable.id,
        title: documentsTable.title,
        status: documentsTable.status,
        expiryDate: documentsTable.expiryDate,
        updatedAt: documentsTable.updatedAt,
      }).from(documentsTable),
      db.select({
        id: auditLogsTable.id,
        action: auditLogsTable.action,
        module: auditLogsTable.module,
        entityName: auditLogsTable.entityName,
        details: auditLogsTable.details,
        userName: auditLogsTable.userName,
        createdAt: auditLogsTable.createdAt,
      }).from(auditLogsTable).orderBy(desc(auditLogsTable.createdAt)).limit(25),
    ]);

    const paidMembers = members.filter((m) => m.feeStatus === "paid");
    const assessedMembers = members.filter((m) =>
      ["paid", "pending", "partial", "unpaid"].includes(m.feeStatus),
    );
    const unpaidFeeMembers = assessedMembers.filter((m) => m.feeStatus !== "paid");
    const unassessedFeeMembers = members.filter((m) =>
      ["exempt", "not_applicable", "review"].includes(m.feeStatus),
    );
    const membershipPaidAmount = payments
      .filter((p) => p.paymentType === "membership_fee" && p.status === "paid")
      .reduce((total, p) => total + numberValue(p.amountPaid), 0);
    const membershipOutstanding = members
      .filter((m) => ["pending", "partial", "unpaid"].includes(m.feeStatus))
      .reduce((total, member) => total + numberValue(member.membershipFee), 0);
    const memberActivityMonth = (member: typeof members[number]) => {
      if (member.importBatchId) {
        const importedDate = member.membershipDate || member.legacyEntryDate;
        return /^\d{4}-\d{2}-\d{2}$/.test(importedDate) ? importedDate.slice(0, 7) : "";
      }
      return dayKey(member.createdAt).slice(0, 7);
    };

    const growthBuckets: { month: string; count: number }[] = [];
    const currentMonthDate = new Date(`${currentMonth}-01T00:00:00+03:00`);
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(currentMonthDate);
      d.setMonth(d.getMonth() - i);
      const key = monthKey(d);
      growthBuckets.push({
        month: key,
        count: members.filter((m) => memberActivityMonth(m) === key).length,
      });
    }

    const memberById = new Map(members.map((m) => [m.id, m]));
    const referralMap = new Map<string, { member: typeof members[number]; referred: typeof members }>();
    for (const member of members) {
      if (!member.refMemberId || !memberById.has(member.refMemberId)) continue;
      const referrer = memberById.get(member.refMemberId)!;
      const current = referralMap.get(referrer.id) ?? { member: referrer, referred: [] };
      current.referred.push(member);
      referralMap.set(referrer.id, current);
    }
    const referralRows = [...referralMap.values()]
      .map(({ member, referred }) => ({
        memberId: member.id,
        fullName: member.fullName,
        membershipId: member.membershipId,
        count: referred.length,
        activeCount: referred.filter((m) => m.feeStatus === "paid").length,
        referrerActive: member.feeStatus === "paid",
      }))
      .sort((a, b) => b.count - a.count || a.fullName.localeCompare(b.fullName));

    const approvedClaims = claims
      .filter((claim) => claim.status === "approved")
      .sort((a, b) =>
        numberValue(b.approvedDate ? new Date(b.approvedDate).getTime() : 0)
        - numberValue(a.approvedDate ? new Date(a.approvedDate).getTime() : 0),
      );
    const activeClaim = approvedClaims[0] ?? null;
    const activeContributions = activeClaim
      ? contributionRows.filter((row) => row.contribution.claimId === activeClaim.id && row.memberFeeStatus === "paid")
      : [];
    const eligibleFrfMembers = new Set(
      activeContributions
        .filter((row) => !["cancelled", "exempt"].includes(row.contribution.status))
        .map((row) => row.contribution.memberId),
    );
    const frfCollected = activeContributions
      .filter((row) => !["cancelled", "exempt"].includes(row.contribution.status))
      .reduce((total, row) => total + Math.min(numberValue(row.contribution.amountPaid), numberValue(row.contribution.amount)), 0);
    const frfCommitted = activeContributions
      .filter((row) => !["cancelled", "exempt"].includes(row.contribution.status))
      .reduce((total, row) => total + numberValue(row.contribution.amount), 0);
    const frfPaidMembers = new Set(
      activeContributions
        .filter((row) => row.contribution.status === "paid")
        .map((row) => row.contribution.memberId),
    );

    const activeTerm = committeeTerms.find((term) => term.isActive) ?? null;
    const currentAssignments = activeTerm
      ? committeeAssignments.filter((assignment) => assignment.termId === activeTerm.id && assignment.isActive)
      : [];
    const committeeMemberIds = new Set(currentAssignments.map((assignment) => assignment.memberId));
    const termMeetings = activeTerm
      ? meetings.filter((meeting) => meeting.committeeTermId === activeTerm.id)
      : [];
    const upcomingMeeting = [...termMeetings]
      .filter((meeting) => meeting.meetingDate > now)
      .sort((a, b) => a.meetingDate.getTime() - b.meetingDate.getTime())[0] ?? null;
    const lastMeeting = [...termMeetings]
      .filter((meeting) => meeting.meetingDate <= now)
      .sort((a, b) => b.meetingDate.getTime() - a.meetingDate.getTime())[0] ?? null;
    const lastMeetingAttendance = lastMeeting
      ? attendance.filter((row) => row.meetingId === lastMeeting.id && committeeMemberIds.has(row.memberId))
      : [];
    const lastMeetingPresent = lastMeetingAttendance.filter((row) => row.status === "present").length;

    const loanPaymentTotals = new Map<string, number>();
    for (const payment of loanPayments) {
      loanPaymentTotals.set(payment.loanId, (loanPaymentTotals.get(payment.loanId) ?? 0) + numberValue(payment.amount));
    }
    const activeLoans = loans.filter((loan) => ["active", "overdue"].includes(loan.status) && loan.memberId);
    const loanOutstanding = activeLoans.reduce((total, loan) => {
      const paid = numberValue(loan.emiAmount) * loan.paidEmis + (loanPaymentTotals.get(loan.id) ?? 0);
      return total + Math.max(0, numberValue(loan.principalAmount) - Math.min(numberValue(loan.principalAmount), paid));
    }, 0);
    const pendingLoans = loans.filter((loan) =>
      !loan.disbursedDate && !["rejected", "cancelled", "closed"].includes(loan.status),
    );

    const completedTaskStatuses = new Set(["completed", "cancelled"]);
    const tasksWithDueDate = tasks.filter((task) => task.dueDate);
    const overdueTasks = tasksWithDueDate.filter((task) =>
      !completedTaskStatuses.has(task.status) && dateOnly(task.dueDate) < today,
    );
    const dueTodayTasks = tasksWithDueDate.filter((task) =>
      !completedTaskStatuses.has(task.status) && dateOnly(task.dueDate) === today,
    );
    const weekEnd = new Date(startOfToday);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const dueThisWeekTasks = tasksWithDueDate.filter((task) => {
      if (completedTaskStatuses.has(task.status) || !task.dueDate) return false;
      const due = new Date(task.dueDate);
      return due >= startOfToday && due <= weekEnd;
    });
    const recentlyCompletedTasks = tasks.filter((task) =>
      task.status === "completed" && new Date(task.updatedAt).getTime() >= now.getTime() - 7 * 24 * 60 * 60 * 1000,
    );
    const taskItems = [...tasksWithDueDate]
      .filter((task) => !completedTaskStatuses.has(task.status))
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
      .slice(0, 8)
      .map((task) => ({
        id: task.id,
        title: task.title,
        date: new Date(task.dueDate!).toISOString(),
        status: task.status,
        priority: task.priority,
        href: `/tasks/${task.id}`,
      }));

    const upcoming = [
      ...events
        .filter((event) => event.eventDate && new Date(event.eventDate) >= now && event.status !== "cancelled")
         .map((event) => ({ id: `event:${event.id}`, title: event.name, date: new Date(event.eventDate!).toISOString(), kind: "Event", href: `/events/${event.id}` })),
      ...termMeetings
        .filter((meeting) => meeting.meetingDate >= now)
         .map((meeting) => ({ id: `meeting:${meeting.id}`, title: meeting.title, date: meeting.meetingDate.toISOString(), kind: "Meeting", href: "/meetings" })),
       ...taskItems.map((task) => ({ id: `task:${task.id}`, title: task.title, date: task.date, kind: "Task due", href: task.href })),
      ...sponsors
        .filter((sponsor) => sponsor.dueDate && sponsor.dueDate >= now && sponsor.status !== "paid")
         .map((sponsor) => ({ id: `sponsor:${sponsor.id}`, title: `${sponsor.sponsorName} follow-up`, date: sponsor.dueDate!.toISOString(), kind: "Sponsor", href: `/sponsors/${sponsor.id}` })),
      ...documents
        .filter((document) => document.expiryDate && document.expiryDate >= today && document.expiryDate <= dateOnly(new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)))
         .map((document) => ({ id: `document:${document.id}`, title: `${document.title} expires`, date: `${document.expiryDate}T00:00:00.000Z`, kind: "Document", href: "/documents" })),
    ]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8);

    const documentExpiringSoon = documents.filter((document) =>
      document.expiryDate && document.expiryDate >= today && document.expiryDate <= dateOnly(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)),
    ).length;
    const documentExpired = documents.filter((document) => document.expiryDate && document.expiryDate < today).length;
    const documentPendingReview = documents.filter((document) => ["pending", "review"].includes(document.status)).length;

    const activeWelfareStatuses = new Set(["pending", "under_review", "approved", "in_progress"]);
    const completedWelfareStatuses = new Set(["completed"]);
    const activeWelfare = welfare.filter((request) => activeWelfareStatuses.has(request.status));
    const completedWelfare = welfare.filter((request) => completedWelfareStatuses.has(request.status));
    const welfareBeneficiaries = new Set(
      welfare.filter((request) => request.memberId && ["approved", "completed"].includes(request.status)).map((request) => request.memberId),
    );
    const auditActivity = auditRows
      .filter((row) => !["login", "logout"].includes(row.action))
      .slice(0, 10)
      .map((row) => ({
        id: row.id,
        action: row.action,
        module: row.module,
        entityName: row.entityName ?? "",
        details: row.details ?? "",
        userName: row.userName,
        createdAt: row.createdAt.toISOString(),
      }));

    res.json({
      membership: {
        total: members.length,
        active: paidMembers.length,
        inactive: members.length - paidMembers.length,
        paidFees: paidMembers.length,
        unpaidFees: unpaidFeeMembers.length,
        unassessedFees: unassessedFeeMembers.length,
        newThisMonth: members.filter((member) => memberActivityMonth(member) === currentMonth).length,
        awaitingApproval: membershipApplications.filter((application) => ["submitted", "under_review", "review"].includes(application.status)).length,
        collectionRate: assessedMembers.length > 0 ? Math.round((paidMembers.length / assessedMembers.length) * 100) : 0,
        growth: growthBuckets,
      },
      referrals: {
        totalReferred: referralRows.reduce((total, row) => total + row.count, 0),
        activeReferred: referralRows.reduce((total, row) => total + row.activeCount, 0),
        activeReferrers: referralRows.filter((row) => row.referrerActive).length,
        topReferrers: referralRows.slice(0, 5),
      },
      frf: {
        pendingClaims: claims.filter((claim) => ["pending", "under_review"].includes(claim.status)).length,
        activeCase: activeClaim ? {
          id: activeClaim.id,
          title: activeClaim.description || activeClaim.claimType,
          approvedDate: activeClaim.approvedDate?.toISOString() ?? null,
          targetAmount: frfCommitted,
        } : null,
        collected: activeClaim ? frfCollected : 0,
        outstanding: activeClaim ? Math.max(0, frfCommitted - frfCollected) : 0,
        eligibleMembers: activeClaim ? eligibleFrfMembers.size : 0,
        paidMembers: activeClaim ? frfPaidMembers.size : 0,
        unpaidMembers: activeClaim ? Math.max(0, eligibleFrfMembers.size - frfPaidMembers.size) : 0,
        collectionPercentage: activeClaim && frfCommitted > 0 ? Math.round((frfCollected / frfCommitted) * 100) : 0,
      },
      committee: {
        memberCount: committeeMemberIds.size,
        term: activeTerm?.committeeYear ?? null,
        startDate: activeTerm?.startDate ?? null,
        endDate: activeTerm?.endDate ?? null,
        upcomingMeeting: upcomingMeeting ? {
          id: upcomingMeeting.id,
          title: upcomingMeeting.title,
          meetingDate: upcomingMeeting.meetingDate.toISOString(),
        } : null,
        lastMeeting: lastMeeting ? {
          id: lastMeeting.id,
          title: lastMeeting.title,
          meetingDate: lastMeeting.meetingDate.toISOString(),
          present: lastMeetingPresent,
          eligible: committeeMemberIds.size,
          attendanceRecorded: lastMeetingAttendance.length > 0,
          attendancePercentage: committeeMemberIds.size > 0 ? Math.round((lastMeetingPresent / committeeMemberIds.size) * 100) : 0,
        } : null,
      },
      finance: {
        membershipCollected: membershipPaidAmount,
        membershipOutstanding,
        frfCollected,
        frfOutstanding: activeClaim ? Math.max(0, frfCommitted - frfCollected) : 0,
        activeLoans: activeLoans.length,
        loanOutstanding,
        pendingLoanApplications: pendingLoans.length,
        sponsorCollected: sponsors.reduce((total, sponsor) => total + numberValue(sponsor.paidAmount), 0),
        sponsorPledged: sponsors.reduce((total, sponsor) => total + numberValue(sponsor.totalAmount), 0),
        sponsorOutstanding: sponsors.reduce((total, sponsor) => total + Math.max(0, numberValue(sponsor.totalAmount) - numberValue(sponsor.paidAmount)), 0),
        totalSponsors: sponsors.length,
      },
      upcoming,
      tasks: {
        overdue: overdueTasks.length,
        dueToday: dueTodayTasks.length,
        dueThisWeek: dueThisWeekTasks.length,
        recentlyCompleted: recentlyCompletedTasks.length,
        items: taskItems,
      },
      welfare: {
        activePrograms: new Set(activeWelfare.map((request) => request.serviceType)).size,
        pendingApplications: welfare.filter((request) => ["pending", "under_review"].includes(request.status)).length,
        activeCases: activeWelfare.length,
        completedCases: completedWelfare.length,
        beneficiaries: welfareBeneficiaries.size,
        amountDistributed: completedWelfare.reduce((total, request) => total + numberValue(request.amountApproved), 0),
      },
      documents: {
        pendingReview: documentPendingReview,
        expiringSoon: documentExpiringSoon,
        expired: documentExpired,
      },
      recentActivity: auditActivity,
    });
  } catch (err) {
    req.log.error({ err }, "dashboard command center failed");
    res.status(500).json({ error: "Failed to load dashboard command center" });
  }
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
    if (m.feeStatus === "paid" || m.feeStatus === "exempt" || m.feeStatus === "not_applicable" || m.feeStatus === "review") continue;
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
    else if (!["exempt", "not_applicable", "review"].includes(m.feeStatus)) feesOutstanding += fee;
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

  const [
    membersAll,
    paymentsAll,
    sponsorRows,
    membershipApplications,
    frfClaimsAll,
    frfContributionsAll,
    documentRows,
    taskRows,
    loanRows,
    loanPaymentRows,
    committeeTermRows,
    meetingRows,
    meetingAttendanceRows,
  ] = await Promise.all([
    db.select().from(membersTable),
    db.select().from(paymentsTable),
    db.select().from(sponsorsTable),
    db.select().from(dkmoMembershipsTable).where(eq(dkmoMembershipsTable.status, "submitted")),
    db.select().from(frfClaimsTable),
    db.select().from(frfContributionsTable),
    db.select().from(documentsTable),
    db.select().from(tasksTable),
    db.select().from(loansTable),
    db.select().from(loanPaymentsTable),
    db.select().from(committeeTermsTable),
    db.select().from(meetingsTable),
    db.select().from(meetingAttendanceTable),
  ]);

  // New public membership applications stay visible in the notification bell
  // until an administrator moves them into review or approves/rejects them.
  if (membershipApplications.length > 0) {
    alerts.push({
      id: "new-membership-applications",
      severity: "warning",
      type: "new_membership_application",
      title: "New membership applications",
      description: `${membershipApplications.length} new member application${membershipApplications.length === 1 ? "" : "s"} awaiting review.`,
      count: membershipApplications.length,
      link: "/dkmo-memberships",
    });
  }

  // Membership payments are shown as one actionable queue item. Keeping
  // unpaid and pending/partial members together avoids duplicating the same
  // admin task in the dashboard.
  const unpaidMembers = membersAll.filter((m) => m.feeStatus === "unpaid");
  const pendingMembers = membersAll.filter((m) => m.feeStatus === "pending" || m.feeStatus === "partial");
  const membershipPaymentCount = unpaidMembers.length + pendingMembers.length;
  if (membershipPaymentCount > 0) {
    alerts.push({
      id: "pending-membership-payments",
      severity: "warning",
      type: "pending_payment",
      title: "Membership payments pending",
      description: `${membershipPaymentCount} member${membershipPaymentCount === 1 ? "" : "s"} need membership payment review.`,
      count: membershipPaymentCount,
      link: "/payments?view=unpaid",
    });
  }

  const pendingFrfClaims = frfClaimsAll.filter(
    (claim) => claim.status === "pending" || claim.status === "under_review",
  );
  if (pendingFrfClaims.length > 0) {
    alerts.push({
      id: "pending-frf-claims",
      severity: "warning",
      type: "frf_claim_review",
      title: "Pending FRF claims",
      description: `${pendingFrfClaims.length} FRF claim${pendingFrfClaims.length === 1 ? "" : "s"} awaiting committee/admin review.`,
      count: pendingFrfClaims.length,
      link: "/frf?status=pending",
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

  // FRF contribution alerts are for the current approved collection case only.
  // Closed/rejected cases and exempt/cancelled rows are historical ledger data,
  // not current work for the dashboard.
  const memberFeeStatus = new Map(membersAll.map((member) => [member.id, member.feeStatus]));
  const activeFrfClaim = frfClaimsAll
    .filter((claim) => claim.status === "approved")
    .sort((a, b) => {
      const aDate = a.approvedDate?.getTime() ?? a.createdAt.getTime();
      const bDate = b.approvedDate?.getTime() ?? b.createdAt.getTime();
      return bDate - aDate;
    })[0];
  const nowFrf = new Date();
  let frfPendingCount = 0;
  let frfOverdueCount = 0;
  let frfOutstandingAmount = 0;
  if (activeFrfClaim) {
    for (const c of frfContributionsAll.filter((row) => row.claimId === activeFrfClaim.id)) {
      if (memberFeeStatus.get(c.memberId) !== "paid") continue;
      const st = deriveContributionStatus(c, activeFrfClaim.approvedDate, nowFrf);
      if (st === "cancelled" || st === "exempt") continue;
      const remaining = Math.max(Number(c.amount) - Number(c.amountPaid), 0);
      if (st === "pending" && remaining > 0) { frfPendingCount++; frfOutstandingAmount += remaining; }
      else if (st === "overdue" && remaining > 0) { frfOverdueCount++; frfOutstandingAmount += remaining; }
    }
  }
  if (frfOverdueCount > 0) {
    alerts.push({
      id: "frf-overdue-contributions",
      severity: "critical",
      type: "frf_overdue",
      title: "Overdue FRF contributions",
      description: `${frfOverdueCount} FRF contribution${frfOverdueCount === 1 ? " is" : "s are"} overdue (30+ days since claim approval).`,
      count: frfOverdueCount,
      link: "/payments?tab=frf&frfStatus=overdue",
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
      link: "/payments?tab=frf&frfStatus=pending",
    });
  }

  const riyadhDateKey = (value: Date): string =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
  const today = riyadhDateKey(new Date());
  const in30Days = riyadhDateKey(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

  const expiredDocuments = documentRows.filter(
    (document) =>
      document.status !== "archived" &&
      (document.status === "expired" || Boolean(document.expiryDate && document.expiryDate < today)),
  );
  const expiringDocuments = documentRows.filter(
    (document) =>
      document.status === "active" &&
      Boolean(document.expiryDate && document.expiryDate >= today && document.expiryDate <= in30Days),
  );
  if (expiredDocuments.length > 0) {
    alerts.push({
      id: "expired-documents",
      severity: "critical",
      type: "document_expiry",
      title: "Expired documents",
      description: `${expiredDocuments.length} document${expiredDocuments.length === 1 ? "" : "s"} need renewal or review.`,
      count: expiredDocuments.length,
      link: "/documents?status=expired",
    });
  }
  if (expiringDocuments.length > 0) {
    alerts.push({
      id: "expiring-documents",
      severity: "warning",
      type: "document_expiry",
      title: "Documents expiring soon",
      description: `${expiringDocuments.length} document${expiringDocuments.length === 1 ? "" : "s"} expire within 30 days.`,
      count: expiringDocuments.length,
      link: "/documents?expiring=true",
    });
  }
  const activeTasks = taskRows.filter((task) => task.status === "pending" || task.status === "in_progress");
  const overdueTasks = activeTasks.filter((task) => task.dueDate && task.dueDate < now);
  const dueTodayTasks = activeTasks.filter(
    (task) => task.dueDate && riyadhDateKey(task.dueDate) === today,
  );
  const urgentTasks = activeTasks.filter((task) => task.priority === "urgent");
  if (overdueTasks.length > 0) {
    alerts.push({
      id: "overdue-tasks",
      severity: "critical",
      type: "task_overdue",
      title: "Overdue tasks",
      description: `${overdueTasks.length} task${overdueTasks.length === 1 ? "" : "s"} are past due and need follow-through.`,
      count: overdueTasks.length,
      link: "/tasks?status=active&sort=dueAsc",
    });
  }
  if (dueTodayTasks.length > 0) {
    alerts.push({
      id: "tasks-due-today",
      severity: "warning",
      type: "task_due",
      title: "Tasks due today",
      description: `${dueTodayTasks.length} task${dueTodayTasks.length === 1 ? "" : "s"} are due today.`,
      count: dueTodayTasks.length,
      link: "/tasks?status=active&sort=dueAsc",
    });
  }
  if (urgentTasks.length > 0) {
    alerts.push({
      id: "urgent-tasks",
      severity: "warning",
      type: "task_urgent",
      title: "Urgent tasks",
      description: `${urgentTasks.length} urgent task${urgentTasks.length === 1 ? "" : "s"} remain open.`,
      count: urgentTasks.length,
      link: "/tasks?status=active&sort=priority",
    });
  }

  const paymentTotalsByLoan = new Map<string, number>();
  for (const payment of loanPaymentRows) {
    paymentTotalsByLoan.set(
      payment.loanId,
      (paymentTotalsByLoan.get(payment.loanId) ?? 0) + Number(payment.amount),
    );
  }
  const expectedInstallments = (loan: typeof loansTable.$inferSelect, emiCount: number): number => {
    if (!loan.disbursedDate) return 0;
    const start = new Date(loan.disbursedDate);
    if (Number.isNaN(start.getTime())) return 0;
    let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    if (now.getDate() < start.getDate()) months -= 1;
    return Math.max(0, Math.min(months, emiCount));
  };
  const overdueLoans = loanRows.filter((loan) => {
    const principal = Number(loan.principalAmount);
    const emi = Number(loan.emiAmount);
    const totalPaid = Math.min(emi * loan.paidEmis + (paymentTotalsByLoan.get(loan.id) ?? 0), principal);
    const outstanding = Math.max(principal - totalPaid, 0);
    const emiCount = loan.emiCount > 0 ? loan.emiCount : emi > 0 ? Math.ceil(principal / emi) : 0;
    const paidInstallments = emi > 0 ? Math.min(Math.floor(totalPaid / emi + 1e-9), emiCount) : 0;
    return (
      loan.status === "defaulted" ||
      (outstanding > 0 && expectedInstallments(loan, emiCount) > paidInstallments)
    );
  });
  if (overdueLoans.length > 0) {
    alerts.push({
      id: "overdue-loans",
      severity: "critical",
      type: "loan_overdue",
      title: "Overdue loans",
      description: `${overdueLoans.length} loan${overdueLoans.length === 1 ? "" : "s"} have missed repayments.`,
      count: overdueLoans.length,
      link: "/loans?status=overdue",
    });
  }

  const activeCommitteeTerm = committeeTermRows.find((term) => term.isActive);
  const upcomingMeetings = meetingRows.filter(
    (meeting) => meeting.meetingDate > now && (!activeCommitteeTerm || meeting.committeeTermId === activeCommitteeTerm.id),
  );
  const meetingsWithAttendance = new Set(meetingAttendanceRows.map((attendance) => attendance.meetingId));
  const meetingsMissingAttendance = meetingRows.filter(
    (meeting) =>
      meeting.meetingDate <= now &&
      (!activeCommitteeTerm || meeting.committeeTermId === activeCommitteeTerm.id) &&
      !meetingsWithAttendance.has(meeting.id),
  );
  if (meetingsMissingAttendance.length > 0) {
    alerts.push({
      id: "meetings-missing-attendance",
      severity: "warning",
      type: "meeting_follow_up",
      title: "Meetings need follow-through",
      description: `${meetingsMissingAttendance.length} past committee meeting${meetingsMissingAttendance.length === 1 ? "" : "s"} need attendance follow-up.`,
      count: meetingsMissingAttendance.length,
      link: "/meetings",
    });
  }
  if (activeCommitteeTerm && upcomingMeetings.length === 0 && meetingRows.length === 0) {
    alerts.push({
      id: "committee-no-meetings",
      severity: "info",
      type: "committee_planning",
      title: "No committee meetings scheduled",
      description: "Schedule the next committee meeting for the active term.",
      count: 0,
      link: "/meetings",
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
    .filter((c) => c.status === "disbursed")
    .reduce((s, c) => s + Number(c.disbursedAmount ?? c.amountApproved), 0);

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

const FRF_GRANTED = ["disbursed"];
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
      if (m.feeStatus === "paid") recruiter.frfReferred += 1;
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
      sourceType: "frf_claim",
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
      sourceType: "welfare_request",
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
      sourceType: "loan",
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
        .select({
          contribution: frfContributionsTable,
          approvedDate: frfClaimsTable.approvedDate,
          memberFeeStatus: membersTable.feeStatus,
        })
        .from(frfContributionsTable)
        .innerJoin(frfClaimsTable, eq(frfContributionsTable.claimId, frfClaimsTable.id))
        .innerJoin(membersTable, eq(frfContributionsTable.memberId, membersTable.id)),
      db.select().from(membersTable),
    ]);

    const approvedClaims = claims.filter((c) => c.status === "approved").length;

    const now = new Date();
    let expectedTotal = 0;
    let collectedTotal = 0;
    const outstandingByMember = new Map<string, { outstanding: number; pendingClaims: number }>();

    for (const { contribution: c, approvedDate, memberFeeStatus } of ledger) {
      if (memberFeeStatus !== "paid") continue;
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
