import { expect, test, type Page, type Route } from "@playwright/test";

const dashboardPayload = {
  membership: {
    total: 3,
    active: 2,
    inactive: 1,
    paidFees: 2,
    unpaidFees: 1,
    unassessedFees: 0,
    newThisMonth: 1,
    awaitingApproval: 0,
    collectionRate: 67,
    growth: [{ month: "2026-09", count: 1 }],
  },
  referrals: {
    totalReferred: 0,
    activeReferred: 0,
    activeReferrers: 0,
    topReferrers: [],
  },
  frf: {
    pendingClaims: 0,
    activeCase: {
      id: "case-1",
      title: "Dashboard Test Case",
      approvedDate: "2026-09-01T00:00:00.000Z",
      targetAmount: 100,
    },
    collected: 50,
    outstanding: 50,
    eligibleMembers: 2,
    paidMembers: 1,
    unpaidMembers: 1,
    collectionPercentage: 50,
  },
  committee: {
    memberCount: 2,
    term: "2026-27",
    startDate: "2026-04-01",
    endDate: "2027-03-31",
    upcomingMeeting: null,
    lastMeeting: null,
  },
  finance: {
    membershipCollected: 200,
    membershipOutstanding: 100,
    frfCollected: 50,
    frfOutstanding: 50,
    activeLoans: 0,
    loanOutstanding: 0,
    pendingLoanApplications: 0,
    sponsorCollected: 0,
    sponsorPledged: 0,
    sponsorOutstanding: 0,
    totalSponsors: 0,
  },
  upcoming: [
    {
      id: "task:task-1",
      title: "Review dashboard task",
      date: "2026-09-15T00:00:00.000Z",
      kind: "Task due",
      href: "/tasks/task-1",
    },
  ],
  tasks: {
    overdue: 0,
    dueToday: 0,
    dueThisWeek: 1,
    recentlyCompleted: 0,
    items: [
      {
        id: "task-1",
        title: "Review dashboard task",
        date: "2026-09-15T00:00:00.000Z",
        status: "pending",
        priority: "high",
        href: "/tasks/task-1",
      },
    ],
  },
  welfare: {
    activePrograms: 0,
    pendingApplications: 0,
    activeCases: 0,
    completedCases: 0,
    beneficiaries: 0,
    amountDistributed: 0,
  },
  documents: {
    pendingReview: 0,
    expiringSoon: 0,
    expired: 0,
  },
  recentActivity: [
    {
      id: "audit-1",
      action: "payment_created",
      module: "payments",
      entityName: "Dashboard Test Member",
      details: "Membership fee recorded",
      userName: "Administrator",
      createdAt: "2026-09-10T10:00:00.000Z",
    },
  ],
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockDashboard(
  page: Page,
  commandCenterStatus = 200,
  alertsStatus = 200,
  alertsPayload?: unknown[] | ((requestNumber: number) => unknown[]),
) {
  let commandCenterRequests = 0;
  let alertRequests = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/api/me")) {
      return json(route, {
        userId: "dashboard-e2e-user",
        username: "dashboard-e2e",
        displayName: "Dashboard Tester",
        role: "admin",
      });
    }
    if (path.endsWith("/api/dashboard/command-center")) {
      commandCenterRequests += 1;
      return json(route, dashboardPayload, commandCenterStatus);
    }
    if (path.endsWith("/api/dashboard/alerts")) {
      alertRequests += 1;
      const payload = typeof alertsPayload === "function"
        ? alertsPayload(alertRequests)
        : alertsPayload ?? [
            {
              id: "alert-1",
              severity: "warning",
              title: "Review dashboard task",
              description: "A task requires follow-through.",
              count: 1,
              link: "/tasks/task-1",
            },
          ];
      return json(route, payload, alertsStatus);
    }
    return json(route, []);
  });
  return () => commandCenterRequests;
}

test("dashboard distinguishes fee, FRF and current-state signals", async ({ page }) => {
  await mockDashboard(page);
  await page.goto("/dkmo-e2e/dashboard");

  await expect(page.getByRole("heading", { name: "What needs action now" })).toBeVisible();
  await expect(page.getByText("Fee paid", { exact: true })).toBeVisible();
  await expect(page.getByText("Fee unpaid", { exact: true })).toBeVisible();
  await expect(page.getByText("Fee unassessed", { exact: true })).toBeVisible();
  await expect(page.getByText("Eligible contributors", { exact: true })).toBeVisible();
  await expect(page.getByText("Contributors unpaid", { exact: true })).toBeVisible();
  await expect(page.getByText("Membership collected · lifetime", { exact: true })).toBeVisible();
  await expect(page.getByText("No documents requiring attention.", { exact: true })).toBeVisible();
  await expect(page.getByText("No active welfare programs or cases.", { exact: true })).toBeVisible();
  await expect(page.getByText("Dashboard Test Member · Payment Created", { exact: true })).toBeVisible();
});

test("dashboard attention and operational links preserve their origin", async ({ page }) => {
  await mockDashboard(page);
  await page.goto("/dkmo-e2e/dashboard");

  await expect(page.locator('a[href*="/tasks/task-1"][href*="returnTo="]').first()).toBeVisible();
  await expect(page.locator('a[href="/dkmo-e2e/calendar"], a[href="/calendar"]').first()).toBeVisible();
  await expect(page.locator('a[href="/dkmo-e2e/welfare-programs"], a[href="/welfare-programs"]').first()).toBeVisible();
});

test("dashboard refreshes data without leaving the page", async ({ page }) => {
  const getRequestCount = await mockDashboard(page);
  await page.goto("/dkmo-e2e/dashboard");
  const before = getRequestCount();

  await page.getByRole("button", { name: "Refresh dashboard data" }).click();
  await expect.poll(getRequestCount).toBeGreaterThan(before);
  await expect(page).toHaveURL(/\/dkmo-e2e\/dashboard$/);
  await expect(page.getByText(/Last updated/)).toBeVisible();
});

test("dashboard shows an API error instead of zero-value cards", async ({ page }) => {
  await mockDashboard(page, 500);
  await page.goto("/dkmo-e2e/dashboard");

  await expect(page.getByText("Command center data is unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reload dashboard" })).toBeVisible();
});

test("attention required shows grouped actionable items with filtered links", async ({ page }) => {
  await mockDashboard(page, 200, 200, [
    { id: "membership", severity: "warning", title: "Membership payments pending", description: "2 members need membership payment review.", count: 2, link: "/payments?view=unpaid" },
    { id: "frf", severity: "critical", title: "Overdue FRF contributions", description: "3 FRF contributions are overdue.", count: 3, link: "/payments?tab=frf&frfStatus=overdue" },
    { id: "loan", severity: "critical", title: "Overdue loans", description: "1 loan has missed repayments.", count: 1, link: "/loans?status=overdue" },
    { id: "documents", severity: "warning", title: "Documents expiring soon", description: "4 documents expire within 30 days.", count: 4, link: "/documents?expiring=true" },
    { id: "tasks", severity: "critical", title: "Overdue tasks", description: "2 tasks are past due.", count: 2, link: "/tasks?status=active&sort=dueAsc" },
    { id: "meetings", severity: "warning", title: "Meetings need follow-through", description: "1 past committee meeting needs follow-up.", count: 1, link: "/meetings" },
  ]);
  await page.goto("/dkmo-e2e/dashboard");

  await expect(page.getByText("Attention Required", { exact: true })).toBeVisible();
  await expect(page.getByText("Overdue loans", { exact: true })).toBeVisible();
  await expect(page.getByText("Documents expiring soon", { exact: true })).toBeVisible();
  await expect(page.locator('a[href*="/loans?status=overdue"][href*="returnTo="]')).toBeVisible();
  await expect(page.locator('a[href*="/documents?expiring=true"][href*="returnTo="]')).toBeVisible();
  await expect(page.getByText("Everything is up to date", { exact: true })).not.toBeVisible();
});

test("attention required shows a retryable error instead of a false all-clear", async ({ page }) => {
  await mockDashboard(page, 200, 500);
  await page.goto("/dkmo-e2e/dashboard");

  await expect(page.getByText("Unable to load attention items", { exact: true })).toBeVisible();
  await expect(page.getByText("Everything is up to date", { exact: true })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("attention required refreshes to an all-clear state after items are resolved", async ({ page }) => {
  let resolved = false;
  await mockDashboard(page, 200, 200, () => resolved ? [] : [
    { id: "loan", severity: "critical", title: "Overdue loans", description: "1 loan has missed repayments.", count: 1, link: "/loans?status=overdue" },
  ]);
  await page.goto("/dkmo-e2e/dashboard");
  await expect(page.getByText("Overdue loans", { exact: true })).toBeVisible();

  resolved = true;
  await page.getByRole("button", { name: "Refresh dashboard data" }).click();
  await expect(page.getByText("Everything is up to date", { exact: true })).toBeVisible();
  await expect(page.getByText("Overdue loans", { exact: true })).not.toBeVisible();
});