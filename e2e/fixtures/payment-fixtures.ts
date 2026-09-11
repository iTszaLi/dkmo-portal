import type { Page, Route } from "@playwright/test";

export const paymentFixtureNow = "2026-09-10T10:00:00.000Z";

export type ContributionStatus =
  | "pending"
  | "partial"
  | "overdue"
  | "paid"
  | "exempt"
  | "cancelled";

export type PaymentMember = {
  id: string;
  fullName: string;
  mobileNumber: string;
  membershipId: string;
  feeStatus: "paid" | "unpaid";
  membershipFee: number;
  feePaidAt: string | null;
  city: string;
  country: string;
  refMemberId: string;
  refMemberName: string;
  createdAt: string;
  updatedAt: string;
};

export type PaymentClaim = {
  id: string;
  title: string;
  claimantName: string;
  membershipId: string;
  status: "approved" | "disbursed";
  claimType: string;
  amountRequested: number;
  amountApproved: number;
  contributionAmount: number;
  claimDate: string;
  approvedDate: string;
  createdAt: string;
  updatedAt: string;
};

export type PaymentContribution = {
  contributionId: string;
  memberId: string;
  fullName: string;
  membershipId: string;
  mobileNumber: string;
  photoUrl: null;
  refMemberName: string;
  amount: number;
  amountPaid: number;
  balance: number;
  status: ContributionStatus;
  paidAt: string | null;
  receiptNumber: string | null;
  paymentMethod: string | null;
  remarks: null;
};

export type PaymentHistoryItem = PaymentContribution & {
  claimId: string;
  title: string;
  claimType: string;
  approvedDate: string;
};

export type PaymentCollection = {
  claim: PaymentClaim;
  totalMembers: number;
  expectedAmount: number;
  collectedAmount: number;
  outstandingAmount: number;
  targetAmount: number;
  remainingToTarget: number;
  targetProgress: number;
  collectionRate: number;
  lastPaymentAt: string | null;
  paidCount: number;
  partialCount: number;
  pendingCount: number;
  overdueCount: number;
  cancelledCount: number;
  exemptCount: number;
  contributors: PaymentContribution[];
};

export type PaymentFixtures = {
  now: string;
  activeClaim: PaymentClaim;
  historicalClaim: PaymentClaim;
  members: {
    active: PaymentMember;
    paid: PaymentMember;
    invalidMobile: PaymentMember;
    unpaidMembership: PaymentMember;
    partial: PaymentMember;
    overdue: PaymentMember;
    history: PaymentMember;
    exempt: PaymentMember;
    cancelled: PaymentMember;
  };
  contributions: {
    pending: PaymentContribution;
    paid: PaymentContribution;
    invalidMobile: PaymentContribution;
    partial: PaymentContribution;
    overdue: PaymentContribution;
    historyPaid: PaymentHistoryItem;
    historyPartial: PaymentHistoryItem;
    historyExempt: PaymentHistoryItem;
    historyCancelled: PaymentHistoryItem;
    exempt: PaymentContribution;
    cancelled: PaymentContribution;
  };
  memberHistory: PaymentHistoryItem[];
  defaultActiveContributors: PaymentContribution[];
  defaultHistoricalContributors: PaymentContribution[];
};

function member(
  now: string,
  values: Pick<
    PaymentMember,
    "id" | "fullName" | "mobileNumber" | "membershipId" | "feeStatus"
  >,
): PaymentMember {
  return {
    ...values,
    membershipFee: 100,
    feePaidAt: values.feeStatus === "paid" ? now : null,
    city: "Makkah",
    country: "Saudi Arabia",
    refMemberId: "",
    refMemberName: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function createPaymentContribution(
  member: PaymentMember,
  status: ContributionStatus,
  amountPaid: number,
  now = paymentFixtureNow,
): PaymentContribution {
  const amount = 50;
  const paid = status === "paid";

  return {
    contributionId: `contribution-${member.id}`,
    memberId: member.id,
    fullName: member.fullName,
    membershipId: member.membershipId,
    mobileNumber: member.mobileNumber,
    photoUrl: null,
    refMemberName: "",
    amount,
    amountPaid,
    balance: amount - amountPaid,
    status,
    paidAt: paid ? now : null,
    receiptNumber: paid ? "DKMO-FRF-TEST" : null,
    paymentMethod: paid ? "cash" : null,
    remarks: null,
  };
}

export function createPaymentFixtures(
  now = paymentFixtureNow,
): PaymentFixtures {
  const members = {
    active: member(now, {
      id: "member-active",
      fullName: "Active Reminder Member",
      mobileNumber: "0501234567",
      membershipId: "DKMO-ACTIVE",
      feeStatus: "paid",
    }),
    paid: member(now, {
      id: "member-paid",
      fullName: "Paid FRF Member",
      mobileNumber: "0501234568",
      membershipId: "DKMO-PAID",
      feeStatus: "paid",
    }),
    invalidMobile: member(now, {
      id: "member-missing-mobile",
      fullName: "Missing Mobile Member",
      mobileNumber: "",
      membershipId: "DKMO-NOMOBILE",
      feeStatus: "paid",
    }),
    unpaidMembership: member(now, {
      id: "member-unpaid-membership",
      fullName: "Unpaid Membership Member",
      mobileNumber: "0501234569",
      membershipId: "DKMO-UNPAID",
      feeStatus: "unpaid",
    }),
    partial: member(now, {
      id: "member-partial",
      fullName: "Partial Reminder Member",
      mobileNumber: "0501234570",
      membershipId: "DKMO-PARTIAL",
      feeStatus: "paid",
    }),
    overdue: member(now, {
      id: "member-overdue",
      fullName: "Overdue Reminder Member",
      mobileNumber: "0501234571",
      membershipId: "DKMO-OVERDUE",
      feeStatus: "paid",
    }),
    history: member(now, {
      id: "member-history",
      fullName: "History Ledger Member",
      mobileNumber: "0501234572",
      membershipId: "DKMO-HISTORY",
      feeStatus: "paid",
    }),
    exempt: member(now, {
      id: "member-exempt",
      fullName: "Exempt FRF Member",
      mobileNumber: "0501234573",
      membershipId: "DKMO-EXEMPT",
      feeStatus: "paid",
    }),
    cancelled: member(now, {
      id: "member-cancelled",
      fullName: "Cancelled FRF Member",
      mobileNumber: "0501234574",
      membershipId: "DKMO-CANCELLED",
      feeStatus: "paid",
    }),
  };

  const activeClaim: PaymentClaim = {
    id: "frf-active-case",
    title: "September Family Relief Case",
    claimantName: "FRF Claimant",
    membershipId: "DKMO-CLAIM",
    status: "approved",
    claimType: "emergency",
    amountRequested: 500,
    amountApproved: 500,
    contributionAmount: 50,
    claimDate: now,
    approvedDate: now,
    createdAt: now,
    updatedAt: now,
  };

  const historicalClaim: PaymentClaim = {
    ...activeClaim,
    id: "frf-historical-case",
    title: "Closed Family Relief Case",
    status: "disbursed",
  };

  const createHistoryItem = (
    claim: PaymentClaim,
    status: ContributionStatus,
    amountPaid: number,
  ): PaymentHistoryItem => ({
    ...createPaymentContribution(members.history, status, amountPaid, now),
    contributionId: `contribution-${claim.id}-${members.history.id}`,
    claimId: claim.id,
    title: claim.title,
    claimType: claim.claimType,
    approvedDate: claim.approvedDate,
  });

  const contributions = {
    pending: createPaymentContribution(members.active, "pending", 0, now),
    paid: createPaymentContribution(members.paid, "paid", 50, now),
    invalidMobile: createPaymentContribution(
      members.invalidMobile,
      "pending",
      0,
      now,
    ),
    partial: createPaymentContribution(members.partial, "partial", 20, now),
    overdue: createPaymentContribution(members.overdue, "overdue", 35, now),
    historyPaid: createHistoryItem(activeClaim, "paid", 50),
    historyPartial: createHistoryItem(historicalClaim, "partial", 20),
    historyExempt: {
      ...createHistoryItem(activeClaim, "exempt", 0),
      contributionId: `contribution-${activeClaim.id}-${members.history.id}-exempt`,
    },
    historyCancelled: {
      ...createHistoryItem(historicalClaim, "cancelled", 0),
      contributionId: `contribution-${historicalClaim.id}-${members.history.id}-cancelled`,
    },
    exempt: createPaymentContribution(members.exempt, "exempt", 0, now),
    cancelled: createPaymentContribution(members.cancelled, "cancelled", 0, now),
  };

  const memberHistory = [
    contributions.historyPaid,
    contributions.historyPartial,
    contributions.historyExempt,
    contributions.historyCancelled,
  ];

  return {
    now,
    activeClaim,
    historicalClaim,
    members,
    contributions,
    memberHistory,
    defaultActiveContributors: [
      contributions.pending,
      contributions.paid,
      contributions.invalidMobile,
      contributions.exempt,
      contributions.cancelled,
    ],
    defaultHistoricalContributors: [contributions.pending],
  };
}

export function createPaymentFrfSummary(fixtures: PaymentFixtures) {
  const history = fixtures.memberHistory;
  const payableHistory = history.filter(
    (item) => item.status !== "exempt" && item.status !== "cancelled",
  );
  const totalDue = payableHistory.reduce((total, item) => total + item.amount, 0);
  const totalPaid = payableHistory.reduce(
    (total, item) => total + item.amountPaid,
    0,
  );

  return {
    eligibility: { status: "eligible", reason: "" },
    totalClaims: payableHistory.length,
    totalDue,
    totalPaid,
    totalOutstanding: totalDue - totalPaid,
    casesPaid: payableHistory.filter((item) => item.status === "paid").length,
    casesPending: payableHistory.filter((item) => item.status !== "paid").length,
    lastContributionAt:
      history.find((item) => item.paidAt)?.paidAt ?? null,
    history,
    beneficiaryCases: [],
    referenceCollection: {
      totalReferences: 0,
      fullyPaidCount: 0,
      pendingCount: 0,
      overdueCount: 0,
      collectionRate: 100,
      totalOutstanding: 0,
      members: [],
    },
  };
}

export function createPaymentCollection(
  claim: PaymentClaim,
  contributors: PaymentContribution[],
): PaymentCollection {
  const payableContributors = contributors.filter(
    (contribution) =>
      contribution.status !== "exempt" && contribution.status !== "cancelled",
  );
  const expectedAmount = payableContributors.reduce(
    (total, contribution) => total + contribution.amount,
    0,
  );
  const collectedAmount = payableContributors.reduce(
    (total, contribution) =>
      total + Math.min(contribution.amount, contribution.amountPaid),
    0,
  );
  const outstandingAmount = payableContributors.reduce(
    (total, contribution) =>
      total + Math.max(contribution.amount - contribution.amountPaid, 0),
    0,
  );
  const targetAmount = claim.contributionAmount;

  return {
    claim,
    totalMembers: payableContributors.length,
    expectedAmount,
    collectedAmount,
    outstandingAmount,
    targetAmount,
    remainingToTarget: Math.max(targetAmount - collectedAmount, 0),
    targetProgress:
      targetAmount === 0
        ? 0
        : Math.min(100, (collectedAmount / targetAmount) * 100),
    collectionRate:
      expectedAmount === 0 ? 0 : (collectedAmount / expectedAmount) * 100,
    lastPaymentAt: null,
    paidCount: contributors.filter(
      (contribution) => contribution.status === "paid",
    ).length,
    partialCount: contributors.filter(
      (contribution) => contribution.status === "partial",
    ).length,
    pendingCount: contributors.filter(
      (contribution) => contribution.status === "pending",
    ).length,
    overdueCount: contributors.filter(
      (contribution) => contribution.status === "overdue",
    ).length,
    cancelledCount: contributors.filter(
      (contribution) => contribution.status === "cancelled",
    ).length,
    exemptCount: contributors.filter(
      (contribution) => contribution.status === "exempt",
    ).length,
    contributors,
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export type MockPaymentsApiOptions = {
  includeActiveCase?: boolean;
  fixtures?: PaymentFixtures;
  activeContributors?: PaymentContribution[];
  historicalContributors?: PaymentContribution[];
};

export async function mockPaymentsApi(
  page: Page,
  options: MockPaymentsApiOptions = {},
) {
  const fixtures = options.fixtures ?? createPaymentFixtures();
  const includeActiveCase = options.includeActiveCase ?? true;
  const activeContributors =
    options.activeContributors ?? fixtures.defaultActiveContributors;
  const historicalContributors =
    options.historicalContributors ?? fixtures.defaultHistoricalContributors;
  const mutationRequests: string[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.method() !== "GET") {
      mutationRequests.push(`${request.method()} ${path}`);
    }
    if (path.endsWith("/api/me")) {
      return json(route, {
        userId: "e2e-user",
        username: "e2e",
        displayName: "E2E Tester",
        role: "admin",
      });
    }
    if (path.endsWith("/api/members")) {
      return json(route, Object.values(fixtures.members));
    }
    if (path.includes("/api/members/") && path.endsWith("/frf-summary")) {
      if (path.includes(`/api/members/${fixtures.members.history.id}/`)) {
        return json(route, createPaymentFrfSummary(fixtures));
      }
      return json(route, {
        totalClaims: 0,
        casesPaid: 0,
        totalPaid: 0,
        totalOutstanding: 0,
        history: [],
      });
    }
    if (path.endsWith("/api/payments")) return json(route, []);
    if (path.endsWith("/api/frf/claims")) {
      return json(
        route,
        includeActiveCase
          ? [fixtures.activeClaim, fixtures.historicalClaim]
          : [fixtures.historicalClaim],
      );
    }
    if (
      path.endsWith(`/api/frf/claims/${fixtures.activeClaim.id}/collection`)
    ) {
      return json(
        route,
        createPaymentCollection(fixtures.activeClaim, activeContributors),
      );
    }
    if (
      path.endsWith(`/api/frf/claims/${fixtures.historicalClaim.id}/collection`)
    ) {
      return json(
        route,
        createPaymentCollection(
          fixtures.historicalClaim,
          historicalContributors,
        ),
      );
    }
    return json(route, request.method() === "GET" ? [] : {});
  });

  return { fixtures, mutationRequests };
}
