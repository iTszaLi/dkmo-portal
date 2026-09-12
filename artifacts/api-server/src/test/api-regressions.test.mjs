import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

// The test uses the same Express app and session login as the portal. Setting
// these before dynamic imports keeps the test self-contained when run locally.
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET ??= "api-regression-test-session";
process.env.EXEC_PASSWORD ??= "api-regression-test-password";

const { default: app } = await import("../app.ts");
const {
  auditLogsTable,
  committeeAssignmentsTable,
  committeeTermsTable,
  db,
  documentAttachmentsTable,
  documentsTable,
  frfClaimsTable,
  frfContributionsTable,
  loanPaymentsTable,
  loanBudgetHistoryTable,
  loanBudgetsTable,
  loansTable,
  membersTable,
  meetingAttendanceTable,
  meetingsTable,
  paymentsTable,
  pool,
  tasksTable,
} = await import("@workspace/db");
const { and, desc, eq, ilike, inArray, or } = await import("drizzle-orm");

const marker = `api-regression-${randomUUID()}`;
const memberTag = marker.slice(-12);
let server;
let baseUrl;
let adminCookie;
let viewerCookie;
let fixtureMember;
let fixtureLoan;
let activeClaim;
let expiredDocument;
let restrictedDocument;
let dashboardBefore;
let commandCenterBefore;
let legacyDateFixtureMember;
let originalLoanBudget;
let originalBudgetHistoryIds;
let originalBudgetAuditIds;

async function cleanupTestAuditRows() {
  await db.delete(auditLogsTable).where(or(
    ilike(auditLogsTable.entityName, "api-regression-%"),
    ilike(auditLogsTable.details, "api-regression-%"),
    ilike(auditLogsTable.details, "[test-run:%"),
    ilike(auditLogsTable.userName, "api-regression-%"),
  ));
}

function jsonResponse(response) {
  return response.json();
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  headers.set("x-dkmo-test-run", marker);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  return { response, body: await jsonResponse(response).catch(() => null) };
}

async function login(username) {
  const { response, body } = await request("/api/auth/login", {
    method: "POST",
    headers: { "x-forwarded-proto": "https" },
    body: JSON.stringify({ username, password: process.env.EXEC_PASSWORD }),
  });
  assert.equal(response.status, 200, `login failed for ${username}: ${JSON.stringify(body)}`);
  const cookie = response.headers.getSetCookie?.()[0]?.split(";")[0];
  assert.ok(cookie, `login did not return a session cookie for ${username}`);
  return cookie;
}

function asJson(body) {
  return JSON.stringify(body);
}

test("startup health check is public and does not require an authenticated session", async () => {
  const health = await request("/api/healthz");
  assert.equal(health.response.status, 200);
  assert.deepEqual(health.body, { status: "ok" });
});

test("creating a paid member records the membership fee payment atomically", async () => {
  let createdMember;
  let createdPayment;
  try {
    const created = await request("/api/members", {
      method: "POST",
      headers: { cookie: adminCookie },
      body: asJson({
        fullName: `Paid Create Member ${memberTag}`,
        mobileNumber: `+966500${memberTag.replace(/\D/g, "").slice(-6)}`,
        membershipFee: 100,
        feeStatus: "paid",
        notes: marker,
      }),
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    createdMember = created.body;
    assert.equal(createdMember.feeStatus, "paid");
    assert.equal(createdMember.frfStatus, "active");

    [createdPayment] = await db
      .select()
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.memberId, createdMember.id),
          eq(paymentsTable.paymentType, "membership_fee"),
        ),
      );
    assert.ok(createdPayment, "paid member creation must create a payment ledger row");
    assert.equal(createdPayment.amountDue, "100.00");
    assert.equal(createdPayment.amountPaid, "100.00");
    assert.equal(createdPayment.status, "paid");
    assert.equal(createdPayment.paymentMethod, "cash");
  } finally {
    if (createdPayment?.id) {
      await db.delete(paymentsTable).where(eq(paymentsTable.id, createdPayment.id));
    }
    if (createdMember?.id) {
      await db.delete(membersTable).where(eq(membersTable.id, createdMember.id));
    }
  }
});

test("member search ranks direct matches above referral matches", async () => {
  let directMember;
  let referredMember;
  const searchPhrase = `Search Rank ${memberTag}`;
  const directMembershipId = `TEST-SEARCH-D-${memberTag}`;
  const directMobile = `+966500${memberTag.replace(/\D/g, "").slice(-6)}`;

  try {
    [directMember] = await db
      .insert(membersTable)
      .values({
        fullName: searchPhrase,
        mobileNumber: directMobile,
        membershipId: directMembershipId,
        notes: "",
      })
      .returning();
    [referredMember] = await db
      .insert(membersTable)
      .values({
        fullName: "Unrelated Search Member",
        mobileNumber: `+966501${randomUUID().replace(/\D/g, "").slice(-6)}`,
        membershipId: `TEST-SEARCH-R-${randomUUID().slice(0, 8)}`,
        refMemberId: directMember.id,
        refMemberName: searchPhrase,
        notes: "",
      })
      .returning();

    const exact = await request(`/api/members?search=${encodeURIComponent(searchPhrase)}`, {
      headers: { cookie: adminCookie },
    });
    assert.equal(exact.response.status, 200);
    assert.equal(exact.body[0]?.id, directMember.id);
    assert.equal(exact.body[0]?.searchMatch, "direct");
    assert.equal(exact.body.find((member) => member.id === referredMember.id)?.searchMatch, "referred");

    const partial = await request(`/api/members?search=${encodeURIComponent("Search Rank")}`, {
      headers: { cookie: adminCookie },
    });
    assert.equal(partial.response.status, 200);
    assert.equal(partial.body[0]?.id, directMember.id);

    const byId = await request(`/api/members?search=${encodeURIComponent(directMembershipId)}`, {
      headers: { cookie: adminCookie },
    });
    assert.equal(byId.response.status, 200);
    assert.equal(byId.body[0]?.id, directMember.id);
    assert.equal(byId.body.find((member) => member.id === referredMember.id)?.searchMatch, "referred");

    const localPhone = directMobile.replace(/\D/g, "").replace(/^966/, "");
    const byPhone = await request(`/api/members?search=${encodeURIComponent(localPhone)}`, {
      headers: { cookie: adminCookie },
    });
    assert.equal(byPhone.response.status, 200);
    assert.equal(byPhone.body[0]?.id, directMember.id);

    const empty = await request(`/api/members?search=${encodeURIComponent("no-such-member-" + memberTag)}`, {
      headers: { cookie: adminCookie },
    });
    assert.equal(empty.response.status, 200);
    assert.deepEqual(empty.body, []);
  } finally {
    if (directMember?.id) {
      await db.delete(membersTable).where(eq(membersTable.id, directMember.id));
    }
    if (referredMember?.id) {
      await db.delete(membersTable).where(eq(membersTable.id, referredMember.id));
    }
  }
});

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Remove only rows carrying the test marker. This protects the operational
  // activity feed if a prior run was interrupted before its async teardown.
  await cleanupTestAuditRows();
  adminCookie = await login("admin1");
  viewerCookie = await login("user1");

  // Capture the dashboard before adding fixtures so the assertions can verify
  // deltas without depending on whatever legitimate DKMO data already exists.
  ({ body: dashboardBefore } = await request("/api/dashboard/summary", {
    headers: { cookie: adminCookie },
  }));
  ({ body: commandCenterBefore } = await request("/api/dashboard/command-center", {
    headers: { cookie: adminCookie },
  }));

  [fixtureMember] = await db
    .insert(membersTable)
    .values({
      fullName: `Regression Member ${memberTag}`,
      mobileNumber: `900${memberTag.replace(/\D/g, "").slice(-7)}`,
      membershipId: `TEST-${memberTag}`,
      membershipFee: "100",
      feeStatus: "paid",
      feePaidAt: new Date(),
      notes: marker,
    })
    .returning();
  assert.ok(fixtureMember?.id);

  await db.insert(paymentsTable).values({
    memberId: fixtureMember.id,
    paymentType: "membership_fee",
    amountDue: "100",
    amountPaid: "100",
    status: "paid",
    paymentMethod: "test",
    receiptNumber: `TEST-${memberTag}`,
    notes: marker,
  });

  const [budgetRow] = await db.select().from(loanBudgetsTable).where(eq(loanBudgetsTable.id, 1));
  assert.ok(budgetRow, "loan budget must be initialized for loan workflow tests");
  originalLoanBudget = budgetRow;
  originalBudgetHistoryIds = new Set(
    (await db.select({ id: loanBudgetHistoryTable.id }).from(loanBudgetHistoryTable)).map((row) => row.id),
  );
  originalBudgetAuditIds = new Set(
    (await db.select({ id: auditLogsTable.id }).from(auditLogsTable).where(eq(auditLogsTable.entityId, "1"))).map((row) => row.id),
  );

  // Keep the original budget and restore it in teardown. This allows the
  // success path to be tested even in a freshly migrated database whose
  // allocation is zero, without leaving any budget change behind.
  const budgetStatus = await request("/api/loans/budget", { headers: { cookie: adminCookie } });
  assert.equal(budgetStatus.response.status, 200);
  const budgetForCreate = Math.max(
    Number(budgetRow.amount),
    Number(budgetStatus.body.totalDisbursed) + 120,
  );
  await db.update(loanBudgetsTable).set({ amount: budgetForCreate.toFixed(2), updatedAt: new Date() }).where(eq(loanBudgetsTable.id, 1));
  const createdLoan = await request("/api/loans", {
    method: "POST",
    headers: { cookie: adminCookie },
    body: asJson({
      memberId: fixtureMember.id,
      loanType: "education",
      principalAmount: 120,
      emiAmount: 60,
      disbursedDate: "2026-07-01",
      convenorName: "Regression Convenor",
      notes: marker,
    }),
  });
  assert.equal(createdLoan.response.status, 201, JSON.stringify(createdLoan.body));
  fixtureLoan = createdLoan.body;
  assert.equal(fixtureLoan.memberId, fixtureMember.id);
  assert.equal(fixtureLoan.disbursedDate, "2026-07-01");

  // The schema has a partial unique constraint allowing only one approved
  // claim. Add a fixture only when the database currently has no active case;
  // otherwise the pre-existing case must remain untouched.
  if (Number(dashboardBefore.activeFrfCasesCount) === 0) {
    [activeClaim] = await db
      .insert(frfClaimsTable)
      .values({
        memberId: fixtureMember.id,
        title: `${marker} newest`,
        claimantName: fixtureMember.fullName,
        membershipId: fixtureMember.membershipId,
        amountRequested: "73",
        amountApproved: "73",
        status: "approved",
        contributionAmount: "73",
        approvedDate: new Date(Date.now() + 60 * 60 * 1000),
      })
      .returning();
    await db.insert(frfContributionsTable).values({
      claimId: activeClaim.id,
      memberId: fixtureMember.id,
      amount: "73",
      amountPaid: "0",
      status: "pending",
    });
  }
});

test("documents enforce permissions and preserve upload/edit/archive/delete metadata", async () => {
  const create = await request("/api/documents", {
    method: "POST",
    headers: { cookie: adminCookie },
    body: asJson({
      title: `${marker} restricted`,
      description: "Regression document",
      category: "loan_docs",
      tags: marker,
      fileUrl: `/objects/${marker}/restricted.pdf`,
      fileName: "restricted.pdf",
      fileSize: 4096,
      mimeType: "application/pdf",
      expiryDate: "2026-08-01",
      status: "active",
      visibility: "admin",
      notes: "initial metadata",
    }),
  });
  assert.equal(create.response.status, 201, JSON.stringify(create.body));
  restrictedDocument = create.body;
  assert.equal(restrictedDocument.fileName, "restricted.pdf");
  assert.equal(restrictedDocument.fileSize, 4096);
  assert.equal(restrictedDocument.mimeType, "application/pdf");
  assert.equal(restrictedDocument.fileUrl, `/api/documents/${restrictedDocument.id}/file`);

  const viewerGet = await request(`/api/documents/${restrictedDocument.id}`, {
    headers: { cookie: viewerCookie },
  });
  assert.equal(viewerGet.response.status, 403);

  const adminGet = await request(`/api/documents/${restrictedDocument.id}`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(adminGet.response.status, 200);

  const viewerDownload = await request(`/api/documents/${restrictedDocument.id}/file`, {
    headers: { cookie: viewerCookie },
  });
  assert.equal(viewerDownload.response.status, 403);
  const adminDownload = await request(`/api/documents/${restrictedDocument.id}/file`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(adminDownload.response.status, 404, "fake object should not be downloadable");

  const edit = await request(`/api/documents/${restrictedDocument.id}`, {
    method: "PUT",
    headers: { cookie: adminCookie },
    body: asJson({
      title: `${marker} edited`,
      fileUrl: `/api/documents/${restrictedDocument.id}/file`,
      notes: "edited metadata",
    }),
  });
  assert.equal(edit.response.status, 200);
  assert.equal(edit.body.title, `${marker} edited`);
  assert.equal(edit.body.fileUrl, `/api/documents/${restrictedDocument.id}/file`);
  const [storedAfterEdit] = await db.select().from(documentsTable).where(eq(documentsTable.id, restrictedDocument.id));
  assert.equal(storedAfterEdit.fileUrl, `/objects/${marker}/restricted.pdf`, "API file URL must not overwrite storage URL");

  const archive = await request(`/api/documents/${restrictedDocument.id}`, {
    method: "PUT",
    headers: { cookie: adminCookie },
    body: asJson({ status: "archived" }),
  });
  assert.equal(archive.response.status, 200);
  assert.equal(archive.body.status, "archived");

  const deleteAsViewer = await request(`/api/documents/${restrictedDocument.id}`, {
    method: "DELETE",
    headers: { cookie: viewerCookie },
  });
  assert.equal(deleteAsViewer.response.status, 403, "viewer must not mutate documents");

  const deleted = await request(`/api/documents/${restrictedDocument.id}`, {
    method: "DELETE",
    headers: { cookie: adminCookie },
  });
  assert.equal(deleted.response.status, 204);
  restrictedDocument = null;

  const expiredCreate = await request("/api/documents", {
    method: "POST",
    headers: { cookie: adminCookie },
    body: asJson({
      title: `${marker} expired`,
      category: "general",
      fileName: "expired.pdf",
      fileSize: 10,
      mimeType: "application/pdf",
      expiryDate: "2020-01-01",
      status: "expired",
      visibility: "members",
    }),
  });
  assert.equal(expiredCreate.response.status, 201);
  expiredDocument = expiredCreate.body;

  const expiredList = await request("/api/documents?status=expired&search=" + encodeURIComponent(marker), {
    headers: { cookie: adminCookie },
  });
  assert.equal(expiredList.response.status, 200);
  assert.equal(expiredList.body.total, 1, "expiry counter should classify exactly the tagged expired document");
  assert.equal(expiredList.body.items.length, 1);
  assert.equal(expiredList.body.items[0].id, expiredDocument.id);
  assert.equal(expiredList.body.items[0].status, "expired");
  assert.equal(expiredList.body.items[0].expiryDate, "2020-01-01");
});

test("loans link to members, reject over-budget creation, derive repayment status, and expose export fields", async () => {
  const budget = await request("/api/loans/budget", { headers: { cookie: adminCookie } });
  assert.equal(budget.response.status, 200);
  const attemptedCreate = await request("/api/loans", {
    method: "POST",
    headers: { cookie: adminCookie },
    body: asJson({
      memberId: fixtureMember.id,
      loanType: "personal",
      principalAmount: Math.max(1, Number(budget.body.remainingBudget) + 1),
      emiAmount: 1,
      disbursedDate: "2026-09-10",
      notes: marker,
    }),
  });
  assert.equal(attemptedCreate.response.status, 409, "over-budget loan creation must be rejected");

  const detail = await request(`/api/loans/${fixtureLoan.id}`, { headers: { cookie: adminCookie } });
  assert.equal(detail.response.status, 200);
  assert.equal(detail.body.memberId, fixtureMember.id);
  assert.equal(detail.body.memberName, fixtureMember.fullName);
  assert.equal(detail.body.membershipId, fixtureMember.membershipId);
  assert.equal(detail.body.outstandingBalance, 120);
  assert.equal(detail.body.status, "overdue");

  const firstPayment = await request(`/api/loans/${fixtureLoan.id}/payments`, {
    method: "POST",
    headers: { cookie: adminCookie },
    body: asJson({ amount: 60, paymentDate: "2026-08-01", paymentMethod: "bank_transfer", notes: marker }),
  });
  assert.equal(firstPayment.response.status, 201);
  const afterFirst = await request(`/api/loans/${fixtureLoan.id}`, { headers: { cookie: adminCookie } });
  assert.equal(afterFirst.body.totalPaid, 60);
  assert.equal(afterFirst.body.outstandingBalance, 60);
  assert.equal(afterFirst.body.status, "overdue");

  const secondPayment = await request(`/api/loans/${fixtureLoan.id}/payments`, {
    method: "POST",
    headers: { cookie: adminCookie },
    body: asJson({ amount: 60, paymentDate: "2026-09-01", paymentMethod: "cash", notes: marker }),
  });
  assert.equal(secondPayment.response.status, 201);
  assert.equal(secondPayment.body.loanClosed, true);
  const closed = await request(`/api/loans/${fixtureLoan.id}`, { headers: { cookie: adminCookie } });
  assert.equal(closed.body.totalPaid, 120);
  assert.equal(closed.body.outstandingBalance, 0);
  assert.equal(closed.body.status, "closed");

  const exportData = await request(`/api/loans?search=${encodeURIComponent(memberTag)}`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(exportData.response.status, 200);
  assert.equal(exportData.body.items.length, 1);
  const exportedLoan = exportData.body.items[0];
  for (const key of ["memberName", "loanType", "principalAmount", "paidEmis", "emiCount", "outstandingBalance", "status", "convenorName", "disbursedDate"]) {
    assert.ok(Object.hasOwn(exportedLoan, key), `loan export data missing ${key}`);
  }
  assert.equal(exportedLoan.memberName, fixtureMember.fullName);
  assert.equal(exportedLoan.status, "closed");
});

test("dashboard attention alerts use current actionable states and filtered links", async () => {
  const [healthyMember] = await db
    .insert(membersTable)
    .values({
      fullName: `Healthy Attention Member ${memberTag}`,
      mobileNumber: "9000000011",
      membershipId: `TEST-ATTENTION-HEALTHY-${memberTag}`,
      membershipFee: "100",
      feeStatus: "review",
      notes: marker,
    })
    .returning();
  const [healthyLoan] = await db
    .insert(loansTable)
    .values({
      memberId: healthyMember.id,
      loanType: "personal",
      principalAmount: "120",
      emiAmount: "60",
      emiCount: 2,
      paidEmis: 0,
      disbursedDate: "2099-07-01",
      status: "active",
      notes: marker,
    })
    .returning();
  const [healthyDocument] = await db
    .insert(documentsTable)
    .values({
      title: `${marker} healthy document`,
      fileName: "healthy.pdf",
      mimeType: "application/pdf",
      expiryDate: "2099-12-31",
      status: "active",
      visibility: "members",
    })
    .returning();
  const [completedTask] = await db
    .insert(tasksTable)
    .values({
      title: `${marker} completed task`,
      status: "completed",
      dueDate: new Date("2020-01-01T00:00:00.000Z"),
    })
    .returning();
  const baselineResponse = await request("/api/dashboard/alerts", {
    headers: { cookie: adminCookie },
  });
  assert.equal(baselineResponse.response.status, 200);

  const [attentionLoan] = await db
    .insert(loansTable)
    .values({
      memberId: fixtureMember.id,
      loanType: "personal",
      principalAmount: "120",
      emiAmount: "60",
      emiCount: 2,
      paidEmis: 0,
      disbursedDate: "2026-07-01",
      status: "active",
      notes: marker,
    })
    .returning();
  try {
    const alertsResponse = await request("/api/dashboard/alerts", {
      headers: { cookie: adminCookie },
    });
    assert.equal(alertsResponse.response.status, 200);
    const viewerAlertsResponse = await request("/api/dashboard/alerts", {
      headers: { cookie: viewerCookie },
    });
    assert.equal(viewerAlertsResponse.response.status, 200, "authenticated readers can view attention items");
    const alerts = alertsResponse.body;
    const byId = new Map(alerts.map((alert) => [alert.id, alert]));

    assert.ok(byId.get("expired-documents"), "the expired document fixture must require action");
    assert.equal(byId.get("expired-documents").link, "/documents?status=expired");
    assert.ok(byId.get("overdue-loans"), "the unpaid disbursed loan must require repayment follow-up");
    assert.equal(byId.get("overdue-loans").link, "/loans?status=overdue");
    assert.ok(
      !alerts.some((alert) => alert.id === "paid-members" && alert.severity !== "info"),
      "positive membership status must not appear as required action",
    );
    const baselineById = new Map(baselineResponse.body.map((alert) => [alert.id, alert]));
    for (const id of ["pending-membership-payments", "expired-documents", "expiring-documents", "overdue-tasks", "tasks-due-today", "urgent-tasks"]) {
      assert.equal(
        byId.get(id)?.count ?? 0,
        baselineById.get(id)?.count ?? 0,
        `${id} must ignore the healthy fixture state`,
      );
    }
    if (activeClaim) {
      assert.equal(
        byId.get("frf-pending-contributions")?.link,
        "/payments?tab=frf&frfStatus=pending",
      );
    }
  } finally {
    await db.delete(loansTable).where(eq(loansTable.id, attentionLoan.id));
    await db.delete(loansTable).where(eq(loansTable.id, healthyLoan.id));
    await db.delete(documentsTable).where(eq(documentsTable.id, healthyDocument.id));
    await db.delete(tasksTable).where(eq(tasksTable.id, completedTask.id));
    await db.delete(membersTable).where(eq(membersTable.id, healthyMember.id));
  }
});

test("dashboard totals use the membership ledger and one newest active FRF case", async () => {
  const summary = await request("/api/dashboard/summary", { headers: { cookie: adminCookie } });
  assert.equal(summary.response.status, 200);
  assert.equal(summary.body.totalFeesCollected - dashboardBefore.totalFeesCollected, 100);
  assert.equal(summary.body.activeMembersCount - dashboardBefore.activeMembersCount, 1);
  // The loan is now closed, so it contributes no outstanding balance.
  assert.equal(summary.body.loanMoneyOutstanding - dashboardBefore.loanMoneyOutstanding, 0);
  const expectedActiveFrfCases = Number(dashboardBefore.activeFrfCasesCount) + (activeClaim ? 1 : 0);
  const expectedFrfOutstanding = Number(dashboardBefore.frfOutstandingTotal) + (activeClaim ? 73 : 0);
  assert.equal(summary.body.activeFrfCasesCount, expectedActiveFrfCases);
  assert.equal(summary.body.frfOutstandingTotal, expectedFrfOutstanding);

  const commandCenter = await request("/api/dashboard/command-center", {
    headers: { cookie: adminCookie },
  });
  assert.equal(commandCenter.response.status, 200);
  assert.equal(
    commandCenter.body.membership.total,
    commandCenter.body.membership.active + commandCenter.body.membership.inactive,
    "membership totals must reconcile",
  );
  assert.equal(
    commandCenter.body.membership.total,
    commandCenter.body.membership.paidFees
      + commandCenter.body.membership.unpaidFees
      + commandCenter.body.membership.unassessedFees,
    "membership fee states must reconcile",
  );
  assert.equal(commandCenter.body.membership.active, commandCenter.body.membership.paidFees);
  assert.equal(
    commandCenter.body.membership.total - commandCenterBefore.membership.total,
    1,
    "the tagged member must change the command-center total by one",
  );
  assert.equal(
    commandCenter.body.membership.paidFees - commandCenterBefore.membership.paidFees,
    1,
    "the tagged paid member must change the paid fee count by one",
  );
  assert.equal(
    commandCenter.body.membership.newThisMonth - commandCenterBefore.membership.newThisMonth,
    1,
    "a newly created non-imported member must change the monthly new-member count by one",
  );

  if (activeClaim) {
    assert.equal(commandCenter.body.frf.activeCase?.id, activeClaim.id);
    assert.equal(commandCenter.body.frf.activeCase?.targetAmount, 73);
    assert.equal(commandCenter.body.frf.eligibleMembers, 1);
    assert.equal(commandCenter.body.frf.paidMembers, 0);
    assert.equal(commandCenter.body.frf.unpaidMembers, 1);
  } else {
    assert.equal(commandCenter.body.frf.activeCase?.id, commandCenterBefore.frf.activeCase?.id);
    assert.equal(commandCenter.body.frf.activeCase?.targetAmount, commandCenterBefore.frf.activeCase?.targetAmount);
  }
});

test("legacy imported member dates do not inflate monthly new-member counts", async () => {
  const before = await request("/api/dashboard/command-center", {
    headers: { cookie: adminCookie },
  });
  assert.equal(before.response.status, 200);

  [legacyDateFixtureMember] = await db
    .insert(membersTable)
    .values({
      fullName: `Legacy Date Regression ${memberTag}`,
      mobileNumber: "9000000099",
      membershipId: `TEST-LEGACY-DATE-${memberTag}`,
      feeStatus: "unpaid",
      membershipDate: "2020-01-01",
      importBatchId: randomUUID(),
      notes: marker,
    })
    .returning();

  try {
    const afterInsert = await request("/api/dashboard/command-center", {
      headers: { cookie: adminCookie },
    });
    assert.equal(afterInsert.response.status, 200);
    assert.equal(
      afterInsert.body.membership.total - before.body.membership.total,
      1,
    );
    assert.equal(
      afterInsert.body.membership.newThisMonth,
      before.body.membership.newThisMonth,
      "an imported member uses its authoritative legacy membership date, not created_at",
    );
  } finally {
    await db.delete(membersTable).where(eq(membersTable.id, legacyDateFixtureMember.id));
    legacyDateFixtureMember = undefined;
  }
});

test("meeting participants are persisted per meeting and searchable without changing the committee", async () => {
  const [activeTerm] = await db
    .select()
    .from(committeeTermsTable)
    .where(eq(committeeTermsTable.isActive, true))
    .limit(1);
  assert.ok(activeTerm, "an active committee term is required for meeting coverage");

  const committeeMembers = await db
    .select({
      id: membersTable.id,
      fullName: membersTable.fullName,
      membershipId: membersTable.membershipId,
    })
    .from(committeeAssignmentsTable)
    .innerJoin(membersTable, eq(committeeAssignmentsTable.memberId, membersTable.id))
    .where(
      and(
        eq(committeeAssignmentsTable.termId, activeTerm.id),
        eq(committeeAssignmentsTable.isActive, true),
      ),
    )
    .orderBy(membersTable.fullName);
  assert.ok(committeeMembers.length >= 3, "at least three active committee members are required");
  const officialMemberIdsBefore = committeeMembers.map((member) => member.id);
  const createdMeetings = [];

  try {
    const createdA = await request("/api/meetings", {
      method: "POST",
      headers: { cookie: adminCookie },
      body: asJson({
        title: `${marker} Meeting A`,
        meetingDate: "2026-09-20",
        location: "Test venue",
      }),
    });
    assert.equal(createdA.response.status, 201, JSON.stringify(createdA.body));
    createdMeetings.push(createdA.body.id);
    assert.equal(createdA.body.totalCount, committeeMembers.length);
    assert.equal(createdA.body.attendance.length, committeeMembers.length);

    const createdB = await request("/api/meetings", {
      method: "POST",
      headers: { cookie: adminCookie },
      body: asJson({
        title: `${marker} Meeting B`,
        meetingDate: "2026-09-21",
      }),
    });
    assert.equal(createdB.response.status, 201, JSON.stringify(createdB.body));
    createdMeetings.push(createdB.body.id);
    assert.equal(createdB.body.totalCount, committeeMembers.length);

    const [firstMember, secondMember, thirdMember] = committeeMembers;
    const attendanceUpdate = await request(`/api/meetings/${createdA.body.id}/attendance`, {
      method: "PUT",
      headers: { cookie: adminCookie },
      body: asJson({
        records: [{ memberId: thirdMember.id, status: "present" }],
      }),
    });
    assert.equal(attendanceUpdate.response.status, 200, JSON.stringify(attendanceUpdate.body));

    const afterRemoval = await request(`/api/meetings/${createdA.body.id}/participants`, {
      method: "PUT",
      headers: { cookie: adminCookie },
      body: asJson({
        memberIds: committeeMembers.slice(2).map((member) => member.id),
      }),
    });
    assert.equal(afterRemoval.response.status, 200, JSON.stringify(afterRemoval.body));
    assert.equal(afterRemoval.body.totalCount, committeeMembers.length - 2);
    assert.equal(afterRemoval.body.attendance.some((row) => row.memberId === firstMember.id), false);
    assert.equal(afterRemoval.body.attendance.some((row) => row.memberId === secondMember.id), false);
    assert.equal(
      afterRemoval.body.attendance.find((row) => row.memberId === thirdMember.id)?.status,
      "present",
      "removing other participants must preserve attendance status",
    );

    const reopened = await request(`/api/meetings/${createdA.body.id}`, {
      headers: { cookie: adminCookie },
    });
    assert.equal(reopened.response.status, 200);
    assert.equal(reopened.body.totalCount, committeeMembers.length - 2);

    const afterAddingOne = await request(`/api/meetings/${createdA.body.id}/participants`, {
      method: "PUT",
      headers: { cookie: adminCookie },
      body: asJson({
        memberIds: [secondMember.id, ...committeeMembers.slice(2).map((member) => member.id)],
      }),
    });
    assert.equal(afterAddingOne.response.status, 200, JSON.stringify(afterAddingOne.body));
    assert.equal(afterAddingOne.body.totalCount, committeeMembers.length - 1);
    assert.equal(
      afterAddingOne.body.attendance.find((row) => row.memberId === secondMember.id)?.status,
      "absent",
      "newly added members start absent",
    );

    const nameSearch = await request(
      `/api/meetings/${createdA.body.id}/participants?search=${encodeURIComponent(firstMember.fullName.split(/\s+/)[0])}`,
      { headers: { cookie: adminCookie } },
    );
    assert.equal(nameSearch.response.status, 200);
    assert.ok(nameSearch.body.members.some((member) => member.memberId === firstMember.id));

    const idSearch = await request(
      `/api/meetings/${createdA.body.id}/participants?search=${encodeURIComponent(secondMember.membershipId)}`,
      { headers: { cookie: adminCookie } },
    );
    assert.equal(idSearch.response.status, 200);
    assert.deepEqual(idSearch.body.members.map((member) => member.memberId), [secondMember.id]);

    const meetingRows = await db
      .select({ memberId: meetingAttendanceTable.memberId })
      .from(meetingAttendanceTable)
      .where(eq(meetingAttendanceTable.meetingId, createdA.body.id));
    assert.equal(meetingRows.length, committeeMembers.length - 1);
    assert.equal(new Set(meetingRows.map((row) => row.memberId)).size, meetingRows.length);

    const meetingB = await request(`/api/meetings/${createdB.body.id}`, {
      headers: { cookie: adminCookie },
    });
    assert.equal(meetingB.response.status, 200);
    assert.equal(meetingB.body.totalCount, committeeMembers.length);

    const officialMemberIdsAfter = (
      await db
        .select({ memberId: committeeAssignmentsTable.memberId })
        .from(committeeAssignmentsTable)
        .where(
          and(
            eq(committeeAssignmentsTable.termId, activeTerm.id),
            eq(committeeAssignmentsTable.isActive, true),
          ),
        )
    ).map((row) => row.memberId);
    assert.deepEqual(officialMemberIdsAfter.sort(), officialMemberIdsBefore.sort());
  } finally {
    if (createdMeetings.length > 0) {
      await db.delete(meetingsTable).where(inArray(meetingsTable.id, createdMeetings));
    }
  }
});

test("FRF dashboard eligibility follows membership and contribution status rules", async () => {
  const [activeCase] = await db
    .select()
    .from(frfClaimsTable)
    .where(eq(frfClaimsTable.status, "approved"))
    .orderBy(desc(frfClaimsTable.approvedDate));
  assert.ok(activeCase, "an approved FRF case is required for eligibility coverage");

  const contributionAmount = Number(activeCase.contributionAmount);
  assert.ok(contributionAmount > 0);
  const fixtureRows = [
    { feeStatus: "paid", contributionStatus: "pending", amountPaid: "0" },
    { feeStatus: "paid", contributionStatus: "paid", amountPaid: String(contributionAmount) },
    { feeStatus: "unpaid", contributionStatus: "pending", amountPaid: "0" },
    { feeStatus: "review", contributionStatus: "pending", amountPaid: "0" },
    { feeStatus: "paid", contributionStatus: "exempt", amountPaid: "0" },
    { feeStatus: "paid", contributionStatus: "cancelled", amountPaid: "0" },
  ];
  const before = await request("/api/dashboard/command-center", {
    headers: { cookie: adminCookie },
  });
  assert.equal(before.response.status, 200);
  const attentionBefore = await request("/api/dashboard/alerts", {
    headers: { cookie: adminCookie },
  });
  assert.equal(attentionBefore.response.status, 200);
  const fixtureMembers = await db
    .insert(membersTable)
    .values(fixtureRows.map((row, index) => ({
      fullName: `FRF Eligibility ${index + 1} ${memberTag}`,
      mobileNumber: `90100000${index + 1}`,
      membershipId: `TEST-FRF-ELIGIBILITY-${index + 1}-${memberTag}`,
      membershipFee: "100",
      feeStatus: row.feeStatus,
      notes: marker,
    })))
    .returning();
  const fixtureContributions = await db
    .insert(frfContributionsTable)
    .values(fixtureMembers.map((member, index) => ({
      claimId: activeCase.id,
      memberId: member.id,
      amount: String(contributionAmount),
      amountPaid: fixtureRows[index].amountPaid,
      status: fixtureRows[index].contributionStatus,
      paidAt: fixtureRows[index].contributionStatus === "paid" ? new Date() : null,
    })))
    .returning();

  try {
    const afterInsert = await request("/api/dashboard/command-center", {
      headers: { cookie: adminCookie },
    });
    assert.equal(afterInsert.response.status, 200);

    assert.equal(afterInsert.body.frf.eligibleMembers - before.body.frf.eligibleMembers, 2);
    assert.equal(afterInsert.body.frf.paidMembers - before.body.frf.paidMembers, 1);
    assert.equal(afterInsert.body.frf.unpaidMembers - before.body.frf.unpaidMembers, 1);
    assert.equal(
      Number(afterInsert.body.frf.outstanding) - Number(before.body.frf.outstanding),
      contributionAmount,
      "outstanding must include only the paid-member unpaid FRF row",
    );
    assert.equal(
      Number(afterInsert.body.frf.activeCase.targetAmount) - Number(before.body.frf.activeCase.targetAmount),
      contributionAmount * 2,
      "target must include only eligible paid-membership rows",
    );
    assert.equal(
      Number(afterInsert.body.frf.collected) - Number(before.body.frf.collected),
      contributionAmount,
      "collected must include only the paid FRF row",
    );
    const attentionAfter = await request("/api/dashboard/alerts", {
      headers: { cookie: adminCookie },
    });
    assert.equal(attentionAfter.response.status, 200);
    const pendingBefore = attentionBefore.body.find((alert) => alert.id === "frf-pending-contributions");
    const pendingAfter = attentionAfter.body.find((alert) => alert.id === "frf-pending-contributions");
    assert.equal(
      (pendingAfter?.count ?? 0) - (pendingBefore?.count ?? 0),
      1,
      "only the paid pending contribution should add current FRF attention",
    );
  } finally {
    await db.delete(frfContributionsTable).where(inArray(
      frfContributionsTable.id,
      fixtureContributions.map((row) => row.id),
    ));
    await db.delete(membersTable).where(inArray(
      membersTable.id,
      fixtureMembers.map((member) => member.id),
    ));
  }
});

test("FRF collection totals handle partial, exempt, and cancelled contributors", async () => {
  const collectionMembers = await db
    .insert(membersTable)
    .values(["pending", "paid", "partial", "exempt", "cancelled"].map((status, index) => ({
      fullName: `FRF Collection API ${status} ${memberTag}`,
      mobileNumber: `90200000${index + 1}`,
      membershipId: `TEST-FRF-COLLECTION-${status}-${memberTag}`,
      membershipFee: "100",
      feeStatus: "paid",
      feePaidAt: new Date(),
      notes: marker,
    })))
    .returning();
  const [collectionCase] = await db
    .insert(frfClaimsTable)
    .values({
      title: `${marker} collection API case`,
      claimantName: `Collection API ${memberTag}`,
      membershipId: collectionMembers[0].membershipId,
      amountRequested: "500",
      amountApproved: "500",
      status: "disbursed",
      contributionAmount: "50",
      approvedDate: new Date(),
      disbursedAt: new Date(),
    })
    .returning();
  const collectionContributions = await db
    .insert(frfContributionsTable)
    .values([
      {
        claimId: collectionCase.id,
        memberId: collectionMembers[0].id,
        amount: "50",
        amountPaid: "0",
        status: "pending",
      },
      {
        claimId: collectionCase.id,
        memberId: collectionMembers[1].id,
        amount: "50",
        amountPaid: "50",
        status: "paid",
        paidAt: new Date(),
      },
       {
         claimId: collectionCase.id,
         memberId: collectionMembers[2].id,
         amount: "50",
         amountPaid: "25",
         status: "partial",
         paidAt: new Date(),
       },
      {
        claimId: collectionCase.id,
         memberId: collectionMembers[3].id,
        amount: "50",
        amountPaid: "0",
        status: "exempt",
      },
      {
        claimId: collectionCase.id,
         memberId: collectionMembers[4].id,
        amount: "50",
        amountPaid: "0",
        status: "cancelled",
      },
    ])
    .returning();

  try {
    const collection = await request(`/api/frf/claims/${collectionCase.id}/collection`, {
      headers: { cookie: adminCookie },
    });
    assert.equal(collection.response.status, 200, JSON.stringify(collection.body));

    assert.equal(collection.body.expectedAmount, 150);
    assert.equal(collection.body.collectedAmount, 75);
    assert.equal(collection.body.outstandingAmount, 75);
    assert.equal(collection.body.totalMembers, 3);
    assert.equal(collection.body.paidCount, 1);
    assert.equal(collection.body.partialCount, 1);
    assert.equal(collection.body.pendingCount, 1);
    assert.equal(collection.body.overdueCount, 0);
    assert.equal(collection.body.exemptCount, 1);
    assert.equal(collection.body.cancelledCount, 1);

    const contributorsByMemberId = new Map(
      collection.body.contributors.map((contributor) => [contributor.memberId, contributor]),
    );
    assert.equal(collection.body.contributors.length, 5);
    assert.equal(contributorsByMemberId.get(collectionMembers[2].id)?.status, "partial");
    assert.equal(contributorsByMemberId.get(collectionMembers[2].id)?.amountPaid, 25);
    assert.equal(contributorsByMemberId.get(collectionMembers[2].id)?.balance, 25);
    assert.equal(contributorsByMemberId.get(collectionMembers[3].id)?.status, "exempt");
    assert.equal(contributorsByMemberId.get(collectionMembers[4].id)?.status, "cancelled");
  } finally {
    await db.delete(frfContributionsTable).where(inArray(
      frfContributionsTable.id,
      collectionContributions.map((row) => row.id),
    ));
    await db.delete(frfClaimsTable).where(eq(frfClaimsTable.id, collectionCase.id));
    await db.delete(membersTable).where(inArray(
      membersTable.id,
      collectionMembers.map((member) => member.id),
    ));
  }
});

test("FRF collection excludes members without a paid membership fee", async () => {
  const collectionMembers = await db
    .insert(membersTable)
    .values([
      {
        fullName: `FRF Collection Eligible ${memberTag}`,
        mobileNumber: "9021000001",
        membershipId: `TEST-FRF-COLLECTION-ELIGIBLE-${memberTag}`,
        membershipFee: "100",
        feeStatus: "paid",
        feePaidAt: new Date(),
        notes: marker,
      },
      {
        fullName: `FRF Collection Unpaid ${memberTag}`,
        mobileNumber: "9021000002",
        membershipId: `TEST-FRF-COLLECTION-UNPAID-${memberTag}`,
        membershipFee: "100",
        feeStatus: "unpaid",
        notes: marker,
      },
    ])
    .returning();
  const [collectionCase] = await db
    .insert(frfClaimsTable)
    .values({
      title: `${marker} unpaid member collection case`,
      claimantName: `Unpaid Member Collection ${memberTag}`,
      membershipId: collectionMembers[0].membershipId,
      amountRequested: "500",
      amountApproved: "500",
      status: "disbursed",
      contributionAmount: "50",
      approvedDate: new Date(),
      disbursedAt: new Date(),
    })
    .returning();
  const collectionContributions = await db
    .insert(frfContributionsTable)
    .values([
      {
        claimId: collectionCase.id,
        memberId: collectionMembers[0].id,
        amount: "50",
        amountPaid: "0",
        status: "pending",
      },
      {
        claimId: collectionCase.id,
        memberId: collectionMembers[1].id,
        amount: "50",
        amountPaid: "50",
        status: "paid",
        paidAt: new Date(),
      },
    ])
    .returning();

  try {
    const collection = await request(`/api/frf/claims/${collectionCase.id}/collection`, {
      headers: { cookie: adminCookie },
    });
    assert.equal(collection.response.status, 200, JSON.stringify(collection.body));

    assert.equal(collection.body.expectedAmount, 50);
    assert.equal(collection.body.collectedAmount, 0);
    assert.equal(collection.body.outstandingAmount, 50);
    assert.equal(collection.body.totalMembers, 1);
    assert.equal(collection.body.paidCount, 0);
    assert.equal(collection.body.partialCount, 0);
    assert.equal(collection.body.pendingCount, 1);
    assert.equal(collection.body.overdueCount, 0);
    assert.equal(collection.body.cancelledCount, 0);
    assert.equal(collection.body.exemptCount, 0);
    assert.deepEqual(
      collection.body.contributors.map((contributor) => contributor.memberId),
      [collectionMembers[0].id],
    );
  } finally {
    await db.delete(frfContributionsTable).where(inArray(
      frfContributionsTable.id,
      collectionContributions.map((row) => row.id),
    ));
    await db.delete(frfClaimsTable).where(eq(frfClaimsTable.id, collectionCase.id));
    await db.delete(membersTable).where(inArray(
      membersTable.id,
      collectionMembers.map((member) => member.id),
    ));
  }
});

test("FRF payment create, edit, and delete keep collection balances synchronized", async () => {
  const [paymentMember] = await db
    .insert(membersTable)
    .values({
      fullName: `FRF Payment Transition ${memberTag}`,
      mobileNumber: "9022000001",
      membershipId: `TEST-FRF-PAYMENT-${memberTag}`,
      membershipFee: "100",
      feeStatus: "paid",
      feePaidAt: new Date(),
      notes: marker,
    })
    .returning();
  const [paymentCase] = await db
    .insert(frfClaimsTable)
    .values({
      title: `${marker} payment transition case`,
      claimantName: `Payment Transition ${memberTag}`,
      membershipId: paymentMember.membershipId,
      amountRequested: "500",
      amountApproved: "500",
      status: "disbursed",
      contributionAmount: "50",
      approvedDate: new Date(),
      disbursedAt: new Date(),
    })
    .returning();
  const [paymentContribution] = await db
    .insert(frfContributionsTable)
    .values({
      claimId: paymentCase.id,
      memberId: paymentMember.id,
      amount: "50",
      amountPaid: "0",
      status: "pending",
    })
    .returning();
  let paymentId;

  const assertCollection = async (expected) => {
    const collection = await request(`/api/frf/claims/${paymentCase.id}/collection`, {
      headers: { cookie: adminCookie },
    });
    assert.equal(collection.response.status, 200, JSON.stringify(collection.body));
    assert.equal(collection.body.expectedAmount, 50);
    assert.equal(collection.body.collectedAmount, expected.collectedAmount);
    assert.equal(collection.body.outstandingAmount, expected.outstandingAmount);
    assert.equal(collection.body.paidCount, expected.paidCount);
    assert.equal(collection.body.partialCount, expected.partialCount);
    assert.equal(collection.body.pendingCount, expected.pendingCount);
    assert.equal(collection.body.overdueCount, 0);
    assert.equal(collection.body.cancelledCount, 0);
    assert.equal(collection.body.exemptCount, 0);
    assert.equal(collection.body.totalMembers, 1);

    const contributor = collection.body.contributors.find(
      (row) => row.memberId === paymentMember.id,
    );
    assert.ok(contributor, "payment fixture contribution must remain visible");
    assert.equal(contributor.status, expected.status);
    assert.equal(contributor.amountPaid, expected.amountPaid);
    assert.equal(contributor.balance, expected.balance);
  };

  try {
    await assertCollection({
      status: "pending",
      amountPaid: 0,
      balance: 50,
      collectedAmount: 0,
      outstandingAmount: 50,
      paidCount: 0,
      partialCount: 0,
      pendingCount: 1,
    });

    const created = await request("/api/payments", {
      method: "POST",
      headers: { cookie: adminCookie },
      body: asJson({
        memberId: paymentMember.id,
        paymentType: "frf_contribution",
        frfClaimId: paymentCase.id,
        amountDue: 50,
        amountPaid: 25,
        paymentMethod: "cash",
        receiptNumber: `TEST-FRF-PARTIAL-${memberTag}`,
        notes: marker,
      }),
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    paymentId = created.body.id;
    await assertCollection({
      status: "partial",
      amountPaid: 25,
      balance: 25,
      collectedAmount: 25,
      outstandingAmount: 25,
      paidCount: 0,
      partialCount: 1,
      pendingCount: 0,
    });

    const updated = await request(`/api/payments/${paymentId}`, {
      method: "PUT",
      headers: { cookie: adminCookie },
      body: asJson({ amountPaid: 50 }),
    });
    assert.equal(updated.response.status, 200, JSON.stringify(updated.body));
    await assertCollection({
      status: "paid",
      amountPaid: 50,
      balance: 0,
      collectedAmount: 50,
      outstandingAmount: 0,
      paidCount: 1,
      partialCount: 0,
      pendingCount: 0,
    });

    const deleted = await request(`/api/payments/${paymentId}`, {
      method: "DELETE",
      headers: { cookie: adminCookie },
    });
    assert.equal(deleted.response.status, 204);
    paymentId = undefined;
    await assertCollection({
      status: "pending",
      amountPaid: 0,
      balance: 50,
      collectedAmount: 0,
      outstandingAmount: 50,
      paidCount: 0,
      partialCount: 0,
      pendingCount: 1,
    });
  } finally {
    if (paymentId) await db.delete(paymentsTable).where(eq(paymentsTable.id, paymentId));
    await db.delete(frfContributionsTable).where(eq(frfContributionsTable.id, paymentContribution.id));
    await db.delete(frfClaimsTable).where(eq(frfClaimsTable.id, paymentCase.id));
    await db.delete(membersTable).where(eq(membersTable.id, paymentMember.id));
  }
});

test("FRF reminder eligibility stays on the active case and never mutates payment state", async () => {
  const [activeCase] = await db
    .select()
    .from(frfClaimsTable)
    .where(eq(frfClaimsTable.status, "approved"));
  assert.ok(activeCase, "an approved FRF case is required for reminder coverage");

  const reminderMembers = await db
    .insert(membersTable)
    .values([
      {
        fullName: `FRF Reminder Eligible ${memberTag}`,
        mobileNumber: "0501234567",
        membershipId: `TEST-FRF-ELIGIBLE-${memberTag}`,
        membershipFee: "100",
        feeStatus: "paid",
        feePaidAt: new Date(),
        notes: marker,
      },
      {
        fullName: `FRF Reminder Paid ${memberTag}`,
        mobileNumber: "0501234568",
        membershipId: `TEST-FRF-PAID-${memberTag}`,
        membershipFee: "100",
        feeStatus: "paid",
        feePaidAt: new Date(),
        notes: marker,
      },
      {
        fullName: `FRF Reminder No Mobile ${memberTag}`,
        mobileNumber: "",
        membershipId: `TEST-FRF-NOMOBILE-${memberTag}`,
        membershipFee: "100",
        feeStatus: "paid",
        feePaidAt: new Date(),
        notes: marker,
      },
      {
        fullName: `FRF Reminder Unpaid Membership ${memberTag}`,
        mobileNumber: "0501234569",
        membershipId: `TEST-FRF-UNPAID-${memberTag}`,
        membershipFee: "100",
        feeStatus: "unpaid",
        notes: marker,
      },
    ])
    .returning();

  const [historicalCase] = await db
    .insert(frfClaimsTable)
    .values({
      title: `${marker} historical FRF case`,
      claimantName: `Historical FRF ${memberTag}`,
      membershipId: reminderMembers[0].membershipId,
      amountRequested: "500",
      amountApproved: "500",
      status: "disbursed",
      contributionAmount: "50",
      approvedDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      disbursedAt: new Date(),
    })
    .returning();

  const [eligibleMember, paidMember, noMobileMember, unpaidMembershipMember] = reminderMembers;
  const [historicalContribution] = await db
    .insert(frfContributionsTable)
    .values({
      claimId: historicalCase.id,
      memberId: eligibleMember.id,
      amount: "50",
      amountPaid: "0",
      status: "pending",
    })
    .returning();
  const reminderContributions = await db
    .insert(frfContributionsTable)
    .values([
      {
        claimId: activeCase.id,
        memberId: eligibleMember.id,
        amount: "50",
        amountPaid: "0",
        status: "pending",
      },
      {
        claimId: activeCase.id,
        memberId: paidMember.id,
        amount: "50",
        amountPaid: "50",
        status: "paid",
        paidAt: new Date(),
      },
      {
        claimId: activeCase.id,
        memberId: noMobileMember.id,
        amount: "50",
        amountPaid: "0",
        status: "pending",
      },
      {
        claimId: activeCase.id,
        memberId: unpaidMembershipMember.id,
        amount: "50",
        amountPaid: "0",
        status: "pending",
      },
    ])
    .returning();

  try {
    const before = await db
      .select({
        id: frfContributionsTable.id,
        memberId: frfContributionsTable.memberId,
        amountPaid: frfContributionsTable.amountPaid,
        status: frfContributionsTable.status,
        paymentId: frfContributionsTable.paymentId,
      })
      .from(frfContributionsTable)
      .where(inArray(frfContributionsTable.id, [
        historicalContribution.id,
        ...reminderContributions.map((row) => row.id),
      ]));

    const pending = await request("/api/frf/pending-fees", { headers: { cookie: adminCookie } });
    assert.equal(pending.response.status, 200);
    assert.ok(Array.isArray(pending.body));

    const pendingByMember = new Map(pending.body.map((row) => [row.memberId, row]));
    assert.equal(pendingByMember.get(eligibleMember.id)?.caseTitle, activeCase.title);
    assert.equal(pendingByMember.get(eligibleMember.id)?.amount, 50);
    assert.equal(pendingByMember.get(eligibleMember.id)?.status, "pending");
    assert.equal(pendingByMember.get(noMobileMember.id)?.mobileNumber, "");
    assert.equal(pendingByMember.has(paidMember.id), false, "paid FRF rows must not show reminders");
    assert.equal(pendingByMember.has(unpaidMembershipMember.id), false, "unpaid-membership members are not FRF eligible");
    assert.equal(pendingByMember.has(eligibleMember.id) && pendingByMember.get(eligibleMember.id)?.claimId === historicalCase.id, false, "closed historical cases must not show reminders");

    const after = await db
      .select({
        id: frfContributionsTable.id,
        memberId: frfContributionsTable.memberId,
        amountPaid: frfContributionsTable.amountPaid,
        status: frfContributionsTable.status,
        paymentId: frfContributionsTable.paymentId,
      })
      .from(frfContributionsTable)
      .where(inArray(frfContributionsTable.id, [
        historicalContribution.id,
        ...reminderContributions.map((row) => row.id),
      ]));
    assert.deepEqual(after, before, "checking reminder eligibility must not change contribution state");
  } finally {
    await db.delete(frfClaimsTable).where(eq(frfClaimsTable.id, historicalCase.id));
    await db.delete(frfContributionsTable).where(inArray(frfContributionsTable.id, reminderContributions.map((row) => row.id)));
    await db.delete(membersTable).where(inArray(membersTable.id, reminderMembers.map((row) => row.id)));
  }
});

after(async () => {
  const documentIds = [restrictedDocument?.id, expiredDocument?.id].filter(Boolean);
  const claimIds = [activeClaim?.id].filter(Boolean);
  const loanIds = [fixtureLoan?.id].filter(Boolean);
  const memberIds = [fixtureMember?.id, legacyDateFixtureMember?.id].filter(Boolean);
  try {
    if (documentIds.length) await db.delete(documentsTable).where(inArray(documentsTable.id, documentIds));
    if (claimIds.length) await db.delete(frfClaimsTable).where(inArray(frfClaimsTable.id, claimIds));
    if (loanIds.length) await db.delete(loansTable).where(inArray(loansTable.id, loanIds));
    if (memberIds.length) await db.delete(membersTable).where(inArray(membersTable.id, memberIds));
    if (originalLoanBudget) {
      await db
        .update(loanBudgetsTable)
        .set({ amount: originalLoanBudget.amount, updatedAt: originalLoanBudget.updatedAt })
        .where(eq(loanBudgetsTable.id, 1));
    }
    const currentBudgetHistory = await db.select({ id: loanBudgetHistoryTable.id }).from(loanBudgetHistoryTable);
    for (const row of currentBudgetHistory) {
      if (!originalBudgetHistoryIds?.has(row.id)) {
        await db.delete(loanBudgetHistoryTable).where(eq(loanBudgetHistoryTable.id, row.id));
      }
    }
    const currentBudgetAudits = await db
      .select({ id: auditLogsTable.id })
      .from(auditLogsTable)
      .where(eq(auditLogsTable.entityId, "1"));
    for (const row of currentBudgetAudits) {
      if (!originalBudgetAuditIds?.has(row.id)) {
        await db.delete(auditLogsTable).where(eq(auditLogsTable.id, row.id));
      }
    }
    if (memberIds.length || documentIds.length || loanIds.length) {
      const entityIds = [...memberIds, ...documentIds, ...loanIds];
      await db.delete(auditLogsTable).where(inArray(auditLogsTable.entityId, entityIds));
    }
    await cleanupTestAuditRows();
  } finally {
    await new Promise((resolve) => server?.close(resolve));
    await pool.end();
  }
});