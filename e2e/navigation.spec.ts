import { expect, test, type Page, type Route } from "@playwright/test";
import {
  createPaymentFixtures,
  createPaymentFrfSummary,
  mockPaymentsApi,
} from "./fixtures/payment-fixtures";

const now = "2026-01-15T10:00:00.000Z";
const paymentFixtures = createPaymentFixtures();

const member = {
  id: "member-1",
  fullName: "Navigation Test Member",
  mobileNumber: "0500000001",
  membershipId: "DKMO-0001",
  photoUrl: null,
  applicationNumber: "APP-0001",
  iqamaNumber: "1234567890",
  jamaath: "Test Jamaath",
  city: "Riyadh",
  country: "Saudi Arabia",
  feeStatus: "paid",
  frfStatus: "active",
  responsibility: "responsible",
  createdAt: now,
  updatedAt: now,
};

const historyMember = {
  ...paymentFixtures.members.history,
  photoUrl: null,
  applicationNumber: "APP-HISTORY",
  iqamaNumber: "9876543210",
  jamaath: "History Test Jamaath",
  frfStatus: "active",
  responsibility: "responsible",
};

const loan = {
  id: "loan-1",
  memberId: member.id,
  memberName: member.fullName,
  membershipId: member.membershipId,
  loanType: "personal",
  principalAmount: 1000,
  disbursedDate: "2026-01-01",
  emiAmount: 100,
  emiCount: 10,
  paidEmis: 2,
  totalPaid: 200,
  outstandingBalance: 800,
  status: "active",
  convenorName: "Test Convenor",
  responsibleCommitteeAssignmentId: null,
  responsibleStaff: null,
  description: "Navigation test loan",
  notes: "",
  createdAt: now,
  updatedAt: now,
};

const claim = {
  id: "claim-1",
  memberId: member.id,
  title: "Navigation Test Claim",
  photoUrl: null,
  supportingPhotos: [],
  caseStatus: "open",
  collectionStatus: "active",
  closingDate: null,
  claimantName: member.fullName,
  membershipId: member.membershipId,
  claimType: "emergency",
  amountRequested: 500,
  amountApproved: 500,
  contributionAmount: 50,
  collectedAmount: 0,
  collectionExpectedAmount: 50,
  collectionOutstandingAmount: 50,
  collectionRate: 0,
  status: "pending",
  claimDate: now,
  approvedDate: null,
  approvedBy: "",
  beneficiaryName: member.fullName,
  beneficiaryRelation: "Self",
  description: "Navigation test claim",
  notes: "",
  createdAt: now,
  updatedAt: now,
};

const sponsor = {
  id: "sponsor-1",
  sponsorName: "Navigation Test Sponsor",
  company: "Test Company",
  contactPerson: "Test Contact",
  phone: "0500000002",
  email: "sponsor@example.test",
  tier: "gold",
  totalAmount: 1000,
  paidAmount: 500,
  pendingAmount: 500,
  status: "partial",
  transferMethod: "cash",
  assignedStaff: "Test Staff",
  linkedEvent: "",
  dueDate: null,
  notes: "",
  createdAt: now,
  updatedAt: now,
};

const event = {
  id: "event-1",
  name: "Navigation Test Event",
  eventDate: "2026-02-01",
  location: "Riyadh",
  budget: 1000,
  description: "Navigation test event",
  status: "upcoming",
  taskCount: 0,
  createdAt: now,
  updatedAt: now,
};

const task = {
  id: "task-1",
  title: "Navigation Test Task",
  description: "Navigation test task",
  assignedTo: "Test Staff",
  priority: "high",
  status: "pending",
  dueDate: "2026-02-20",
  sponsorId: sponsor.id,
  sponsorName: sponsor.sponsorName,
  eventId: event.id,
  eventName: event.name,
  createdAt: now,
  updatedAt: now,
};

const collection = {
  claim,
  totalMembers: 1,
  expectedAmount: 50,
  collectedAmount: 0,
  outstandingAmount: 50,
  targetAmount: 50,
  remainingToTarget: 50,
  targetProgress: 0,
  collectionRate: 0,
  lastPaymentAt: null,
  paidCount: 0,
  partialCount: 0,
  pendingCount: 1,
  overdueCount: 0,
  cancelledCount: 0,
  exemptCount: 0,
  contributors: [],
};

function list<T>(items: T[]) {
  return { items, page: 1, pageSize: 50, total: items.length };
}

function applicationBack(page: Page) {
  return page.locator(
    '[aria-label="Back to previous context"], button:has-text("Back"), a:has-text("Family Relief Fund")',
  ).first();
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.endsWith("/api/me")) {
      return json(route, {
        userId: "e2e-user",
        username: "e2e",
        displayName: "E2E Tester",
        role: "admin",
      });
    }

    if (path.endsWith("/api/dkmo/memberships/track")) {
      return json(route, [{
        dkmoNumber: member.membershipId,
        fullName: member.fullName,
        status: "approved",
        declineReason: null,
        createdAt: now,
      }]);
    }

    if (path.endsWith("/api/members")) return json(route, [member, historyMember]);
    if (path.endsWith(`/api/members/${member.id}`)) return json(route, member);
    if (path.endsWith(`/api/members/${historyMember.id}`)) {
      return json(route, historyMember);
    }
    if (path.endsWith(`/api/members/${historyMember.id}/frf-summary`)) {
      return json(route, createPaymentFrfSummary(paymentFixtures));
    }
    if (path.includes("/member-assistance")) {
      return json(route, { items: [], totalReceived: 0, totalCount: 0 });
    }
    if (path.includes("/referrals")) return json(route, { members: [] });
    if (path.endsWith("/api/documents")) return json(route, list([]));
    if (path.endsWith("/api/loans")) return json(route, list([loan]));
    if (path.endsWith("/api/loans/stats")) {
      return json(route, {
        total: 1, active: 1, overdue: 0, closed: 0, totalPrincipal: 1000,
        totalOutstanding: 800, dueThisMonthAmount: 0, dueThisMonthCount: 0,
        membersWithMissedPayments: 0,
      });
    }
    if (path.endsWith(`/api/loans/${loan.id}`)) return json(route, loan);
    if (path.endsWith(`/api/loans/${loan.id}/payments`)) return json(route, []);
    if (path.endsWith("/api/frf/claims")) return json(route, [claim]);
    if (path.endsWith(`/api/frf/claims/${claim.id}/collection`)) return json(route, collection);
    if (path.endsWith("/api/frf/stats")) return json(route, {});
    if (path.endsWith("/api/sponsors")) return json(route, list([sponsor]));
    if (path.endsWith(`/api/sponsors/${sponsor.id}`)) return json(route, sponsor);
    if (path.endsWith("/api/events")) return json(route, list([event]));
    if (path.endsWith(`/api/events/${event.id}`)) return json(route, event);
    if (path.endsWith("/api/tasks")) return json(route, list([task]));
    if (path.endsWith(`/api/tasks/${task.id}`)) return json(route, task);

    // Detail pages request supporting lists. Empty collections keep the
    // navigation assertion isolated from unrelated page content.
    if (request.method() === "GET") return json(route, []);
    return json(route, {});
  });
}

function appPath(path: string) {
  return `/dkmo-e2e${path}`;
}

async function expectListContext(page: Page, listUrl: string, flowName: string) {
  const returned = new URL(page.url());
  const origin = new URL(`http://test${listUrl}`);
  expect(returned.pathname, `${flowName} returned pathname`).toBe(appPath(origin.pathname));
  for (const [key, value] of origin.searchParams) {
    expect(returned.searchParams.get(key), `${flowName} query parameter ${key}`).toBe(value);
  }
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

const roundTrips = [
  {
    name: "member",
    listUrl: "/members?search=Navigation%20Test&status=active&sort=name&page=3",
    detailPath: "/members/member-1",
    row: 'a[href*="/members/member-1"]',
    back: "/members",
  },
  {
    name: "loan",
    listUrl: "/loans?search=Navigation%20Test&status=active&loanType=personal&sort=memberName&page=3",
    detailPath: "/loans/loan-1",
    row: '[data-testid="row-loan-loan-1"]',
    back: "/loans",
  },
  {
    name: "FRF claim",
    listUrl: "/frf?status=pending&type=emergency&case=open&search=Navigation%20Test",
    detailPath: "/frf/claim-1",
    row: 'a[href*="/frf/claim-1"]',
    back: "/frf",
  },
  {
    name: "sponsor",
    listUrl: "/sponsors?search=Navigation%20Test&tier=gold&status=partial&sort=name&page=3",
    detailPath: "/sponsors/sponsor-1",
    row: '[data-testid="row-sponsor-sponsor-1"]',
    back: "/sponsors",
  },
  {
    name: "event",
    listUrl: "/events?search=Navigation%20Test&status=upcoming&sort=name&page=3",
    detailPath: "/events/event-1",
    row: 'a[href*="/events/event-1"]',
    back: "/events",
  },
  {
    name: "task",
    listUrl: "/tasks?status=pending&priority=high&sort=dueAsc&search=Navigation%20Test&page=3",
    detailPath: "/tasks/task-1",
    row: 'a[href*="/tasks/task-1"]',
    back: "/tasks",
  },
] as const;

for (const flow of roundTrips) {
  test(`${flow.name} returns to its filtered list context`, async ({ page }) => {
    await page.goto(appPath(flow.listUrl));
    await page.locator(flow.row).first().click();
    await expect(page).toHaveURL(new RegExp(`${flow.detailPath.replace("/", "\\/")}\\?returnTo=`));

    await applicationBack(page).click();
    await expect(page).toHaveURL(new RegExp(`${flow.back.replace("/", "\\/")}\\?.*`));

    await expectListContext(page, flow.listUrl, flow.name);
  });
}

const editFlows = [
  { ...roundTrips[0], edit: "Edit Member", save: "Save Member", cancel: "Cancel" },
  { ...roundTrips[1], edit: "Record Payment", save: "Save Payment", cancel: "Cancel" },
  { ...roundTrips[3], edit: "Edit", save: "Save changes", cancel: "Cancel" },
  { ...roundTrips[4], edit: "Edit", save: "Save Changes", cancel: "Cancel" },
  { ...roundTrips[5], edit: "Edit", save: "Save Changes", cancel: "Cancel" },
] as const;

for (const flow of editFlows) {
  test(`${flow.name} edit cancel preserves its filtered list context`, async ({ page }) => {
    await page.goto(appPath(flow.listUrl));
    await page.locator(flow.row).first().click();
    await expect(page).toHaveURL(new RegExp(`${flow.detailPath.replace("/", "\\/")}\\?returnTo=`));

    await page.getByRole("button", { name: flow.edit, exact: true }).click();
    await page.getByRole("button", { name: flow.cancel, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${flow.detailPath.replace("/", "\\/")}\\?returnTo=`));

    await applicationBack(page).click();
    await expectListContext(page, flow.listUrl, `${flow.name} cancel`);
  });

  test(`${flow.name} save returns to its filtered list context`, async ({ page }) => {
    await page.goto(appPath(flow.listUrl));
    await page.locator(flow.row).first().click();
    await expect(page).toHaveURL(new RegExp(`${flow.detailPath.replace("/", "\\/")}\\?returnTo=`));

    await page.getByRole("button", { name: flow.edit, exact: true }).click();
    await page.getByRole("button", { name: flow.save, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${flow.back.replace("/", "\\/")}\\?.*`));
    await expectListContext(page, flow.listUrl, `${flow.name} save`);
  });
}

for (const flow of roundTrips) {
  test(`${flow.name} direct detail falls back to the canonical list`, async ({ page }) => {
    await page.goto(appPath(flow.detailPath));
    await applicationBack(page).click();
    await expect(page).toHaveURL(new RegExp(`${flow.back.replace("/", "\\/")}$`));
  });
}

test("public status lookup uses one non-root base-path prefix", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/memberships/track")) requests.push(request.url());
  });

  await page.goto(appPath("/dkmo-track"));
  await page.getByLabel("DKMO Application Number").fill(member.membershipId);
  await page.getByRole("button", { name: /check status/i }).click();
  await expect(page.getByText("Navigation Test Member")).toBeVisible();

  expect(requests).toHaveLength(1);
  expect(new URL(requests[0]).pathname).toBe("/dkmo-e2e/api/dkmo/memberships/track");
  expect(new URL(requests[0]).pathname).not.toContain("/dkmo-e2e/dkmo-e2e/");
});

test("member FRF history keeps paid and partial cases separate", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto(appPath(`/members/${historyMember.id}`));
  await page.getByRole("tab", { name: "FRF", exact: true }).click();

  const table = page.getByRole("table");
  const paidRow = table.getByRole("row").filter({
    hasText: paymentFixtures.activeClaim.title,
  });
  const partialRow = table.getByRole("row").filter({
    hasText: paymentFixtures.historicalClaim.title,
  });

  await expect(table.getByRole("row")).toHaveCount(5);
  await expect(paidRow.getByRole("cell").nth(2)).toHaveText("SAR 50.00");
  await expect(paidRow.getByRole("cell").nth(3)).toHaveText("SAR 50.00");
  await expect(paidRow.getByRole("cell").nth(4)).toHaveText("SAR 0.00");
  await expect(paidRow.getByRole("cell").nth(6)).toHaveText("paid");

  await expect(partialRow.getByRole("cell").nth(2)).toHaveText("SAR 50.00");
  await expect(partialRow.getByRole("cell").nth(3)).toHaveText("SAR 20.00");
  await expect(partialRow.getByRole("cell").nth(4)).toHaveText("SAR 30.00");
  await expect(partialRow.getByRole("cell").nth(6)).toHaveText("partial");
});

test("member FRF totals exclude exempt and cancelled history rows", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto(appPath(`/members/${historyMember.id}`));
  await page.getByRole("tab", { name: "FRF", exact: true }).click();

  const table = page.getByRole("table");
  const exemptRow = table.getByRole("row").filter({
    hasText: new RegExp(
      `${paymentFixtures.contributions.historyExempt.title}.*exempt`,
    ),
  });
  const cancelledRow = table.getByRole("row").filter({
    hasText: new RegExp(
      `${paymentFixtures.contributions.historyCancelled.title}.*cancelled`,
    ),
  });

  await expect(page.getByText("Total FRF Cases").locator("..")).toContainText("2");
  await expect(page.getByText("Total Due").last().locator("..")).toContainText("SAR 100.00");
  await expect(page.getByText("Paid", { exact: true }).first().locator("..")).toContainText("SAR 70.00");
  await expect(page.getByText("Remaining Due").locator("..")).toContainText("SAR 30.00");

  await expect(table.getByRole("row")).toHaveCount(5);
  for (const row of [exemptRow, cancelledRow]) {
    await expect(row.getByRole("cell").nth(2)).toHaveText("—");
    await expect(row.getByRole("cell").nth(3)).toHaveText("—");
    await expect(row.getByRole("cell").nth(4)).toHaveText("—");
    await expect(row.getByRole("cell").nth(5)).toHaveText("SAR 30.00");
  }
  await expect(exemptRow.getByRole("cell").nth(6)).toHaveText("exempt");
  await expect(cancelledRow.getByRole("cell").nth(6)).toHaveText("cancelled");
});

test("FRF case totals exclude exempt and cancelled contributors", async ({
  page,
}) => {
  const { fixtures } = await mockPaymentsApi(page);
  await page.goto(appPath(`/frf/${fixtures.activeClaim.id}`));

  await expect(page.getByTestId("card-stat-contributing-members")).toContainText("3");
  await expect(page.getByTestId("card-stat-contributing-members")).toContainText("1 exempt · 1 cancelled");
  await expect(page.getByTestId("card-stat-collected")).toContainText("SAR 50.00");
  await expect(page.getByTestId("card-stat-collected")).toContainText("1 paid · 0 partial");
  await expect(page.getByTestId("card-stat-outstanding")).toContainText("SAR 100.00");
  await expect(page.getByTestId("card-stat-outstanding")).toContainText("2 pending · 0 overdue · 0 partial");

  const table = page.getByRole("table");
  const exemptRow = table.getByRole("row").filter({ hasText: fixtures.contributions.exempt.fullName });
  const cancelledRow = table.getByRole("row").filter({ hasText: fixtures.contributions.cancelled.fullName });

  await expect(table.getByRole("row")).toHaveCount(6);
  for (const row of [exemptRow, cancelledRow]) {
    await expect(row.getByRole("cell").nth(3)).toHaveText("—");
    await expect(row.getByRole("cell").nth(4)).toHaveText("—");
    await expect(row.getByRole("cell").nth(5)).toHaveText("—");
  }
  await expect(exemptRow.getByRole("cell").nth(6)).toHaveText("Exempt");
  await expect(cancelledRow.getByRole("cell").nth(6)).toHaveText("Cancelled");
});