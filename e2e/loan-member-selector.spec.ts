import { expect, test } from "@playwright/test";

const basePath = "/dkmo-e2e";

test("loan member selector searches the full member endpoint and preserves loan creation", async ({ page }) => {
  let createdLoanBody: Record<string, unknown> | null = null;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.endsWith("/api/me")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "e2e-user",
          username: "e2e",
          displayName: "E2E Tester",
          role: "admin",
        }),
      });
      return;
    }

    if (path.endsWith("/api/members")) {
      const search = url.searchParams.get("search");
      expect(search).toBe("1186");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "member-paid",
            fullName: "Nazeer Hassan",
            membershipId: "DKMO-1186",
            feeStatus: "paid",
          },
          {
            id: "member-unpaid",
            fullName: "Unpaid Matching Member",
            membershipId: "DKMO-1186-OLD",
            feeStatus: "unpaid",
          },
        ]),
      });
      return;
    }

    if (path.endsWith("/api/loans") && request.method() === "POST") {
      createdLoanBody = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: "created-loan" }),
      });
      return;
    }

    if (path.endsWith("/api/loans")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], page: 1, pageSize: 20, total: 0 }),
      });
      return;
    }

    if (path.endsWith("/api/loans/stats")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          total: 0,
          active: 0,
          overdue: 0,
          closed: 0,
          totalPrincipal: 0,
          totalOutstanding: 0,
          dueThisMonthAmount: 0,
          dueThisMonthCount: 0,
          membersWithMissedPayments: 0,
        }),
      });
      return;
    }

    if (path.endsWith("/api/loans/budget")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ totalBudget: 100000, usedBudget: 0, remainingBudget: 100000 }),
      });
      return;
    }

    if (path.endsWith("/api/dashboard/alerts")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.goto(`${basePath}/loans`);
  await page.getByTestId("button-new-loan").click();

  const memberSearch = page.getByTestId("input-loan-member-search");
  await expect(memberSearch).toHaveAttribute("placeholder", "Search and select member…");
  await memberSearch.fill("1186");

  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option")).toContainText("Nazeer Hassan — DKMO-1186");
  await page.getByRole("option").click();
  await expect(memberSearch).toHaveValue("Nazeer Hassan — DKMO-1186");

  await page.getByTestId("button-clear-loan-member").click();
  await expect(memberSearch).toHaveValue("");
  await memberSearch.fill("1186");
  await page.getByRole("option").click();

  await page.getByTestId("input-loan-amount").fill("1000");
  await page.getByTestId("input-loan-emi").fill("100");
  await page.getByTestId("button-save-loan").click();

  await expect.poll(() => createdLoanBody).toMatchObject({
    memberId: "member-paid",
    principalAmount: 1000,
    emiAmount: 100,
  });
});

test("active loan reminder targets the assigned responsible person with reviewed language choices", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.endsWith("/api/me")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "e2e-admin",
          username: "admin",
          displayName: "E2E Admin",
          role: "admin",
        }),
      });
      return;
    }

    if (path.endsWith("/api/loans") && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [{
            id: "loan-active",
            memberId: "borrower-member",
            memberName: "Mohammed Ali",
            membershipId: "DKMO-0398",
            loanType: "personal",
            principalAmount: 5000,
            disbursedDate: "2026-01-15",
            emiAmount: 500,
            emiCount: 10,
            paidEmis: 4,
            totalPaid: 2000,
            outstandingBalance: 3000,
            status: "active",
            convenorName: "E2E Admin",
            responsibleCommitteeAssignmentId: "assignment-1",
            responsibleStaff: {
              assignmentId: "assignment-1",
              memberId: "staff-member",
              membershipId: "DKMO-0142",
              fullName: "Abdul Rahman",
              position: "Loan Committee",
              committeeYear: "2026-27",
            },
            description: "",
            notes: "",
            createdAt: "2026-01-15T00:00:00.000Z",
            updatedAt: "2026-01-15T00:00:00.000Z",
          }],
          page: 1,
          pageSize: 20,
          total: 1,
        }),
      });
      return;
    }

    if (path.endsWith("/api/loans/stats")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          total: 1,
          active: 1,
          overdue: 0,
          closed: 0,
          totalPrincipal: 5000,
          totalOutstanding: 3000,
          dueThisMonthAmount: 500,
          dueThisMonthCount: 1,
          membersWithMissedPayments: 0,
        }),
      });
      return;
    }

    if (path.endsWith("/api/loans/budget")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ totalBudget: 100000, usedBudget: 5000, remainingBudget: 95000 }),
      });
      return;
    }

    if (path.endsWith("/api/members/staff-member")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "staff-member",
          fullName: "Abdul Rahman",
          mobileNumber: "0501234567",
          membershipId: "DKMO-0142",
        }),
      });
      return;
    }

    if (path.endsWith("/api/dashboard/alerts")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.goto(`${basePath}/loans`);
  await page.getByTestId("button-loan-actions-loan-active").click();
  await page.getByRole("menuitem", { name: "Reminder" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Abdul Rahman");
  await expect(dialog).toContainText("Mohammed Ali");
  await expect(dialog).toContainText("DKMO-0398");
  await expect(dialog).toContainText("Personal");
  await expect(dialog).toContainText("SAR 5,000");
  await expect(dialog).toContainText("SAR 3,000");
  await expect(dialog).toContainText("4 of 10 instalments paid");
  await expect(dialog).toContainText("Active");
  await expect(dialog.getByTestId("loan-whatsapp-reminder-open")).toBeEnabled();

  await dialog.getByTestId("loan-whatsapp-reminder-language-kn").click();
  await expect(dialog).toContainText("ಸದಸ್ಯರ ಹೆಸರು: Mohammed Ali");
  await expect(dialog).toContainText("DKMO ID: DKMO-0398");
  await expect(dialog).toContainText("ಪ್ರಸ್ತುತ ಬಾಕಿ");

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).not.toBeVisible();

  await page.getByTestId("button-loan-actions-loan-active").click();
  await page.getByRole("menuitem", { name: "Reminder" }).click();
  const popupPromise = page.waitForEvent("popup");
  await page.getByTestId("loan-whatsapp-reminder-open").click();
  const popup = await popupPromise;
  await expect.poll(() => {
    const sentUrl = new URL(popup.url());
    return {
      phone: sentUrl.searchParams.get("phone"),
      message: sentUrl.searchParams.get("text"),
    };
  }).toMatchObject({
    phone: "966501234567",
    message: expect.stringContaining("Member name: Mohammed Ali"),
  });
  await expect.poll(() => new URL(popup.url()).searchParams.get("text") ?? "").toContain("DKMO ID: DKMO-0398");
});

test("loan member search keeps only live name and DKMO ID matches", async ({ page }) => {
  const searchQueries: string[] = [];
  const members = [
    { id: "member-188", fullName: "Azmatullah Hassan Khan", membershipId: "DKMO-0188", feeStatus: "paid" },
    { id: "member-190", fullName: "Cheyya Moiden Shareef", membershipId: "DKMO-0190", feeStatus: "paid" },
    { id: "member-191", fullName: "Yusuf Adoor Nadugudde", membershipId: "DKMO-0191", feeStatus: "paid" },
    { id: "member-805", fullName: "Mohammed Irfan", membershipId: "DKMO-0805", feeStatus: "paid" },
    { id: "member-925", fullName: "Shabir Ahmed Katipalla", membershipId: "DKMO-0925", feeStatus: "paid" },
  ];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.endsWith("/api/me")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "e2e-user",
          username: "e2e",
          displayName: "E2E Tester",
          role: "admin",
        }),
      });
      return;
    }

    if (path.endsWith("/api/members")) {
      const search = url.searchParams.get("search");
      if (search) searchQueries.push(search);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        // Deliberately return the full response set so the UI must filter it.
        body: JSON.stringify(members),
      });
      return;
    }

    if (path.endsWith("/api/loans")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], page: 1, pageSize: 20, total: 0 }),
      });
      return;
    }

    if (path.endsWith("/api/loans/stats")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          total: 0,
          active: 0,
          overdue: 0,
          closed: 0,
          totalPrincipal: 0,
          totalOutstanding: 0,
          dueThisMonthAmount: 0,
          dueThisMonthCount: 0,
          membersWithMissedPayments: 0,
        }),
      });
      return;
    }

    if (path.endsWith("/api/loans/budget")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ totalBudget: 100000, usedBudget: 0, remainingBudget: 100000 }),
      });
      return;
    }

    if (path.endsWith("/api/dashboard/alerts")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.goto(`${basePath}/loans`);
  await page.getByTestId("button-new-loan").click();
  const memberSearch = page.getByTestId("input-loan-member-search");

  await memberSearch.fill("Yusuf");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option")).toContainText("Yusuf Adoor Nadugudde — DKMO-0191");

  await memberSearch.fill("Yusuf Adoor");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option")).toContainText("Yusuf Adoor Nadugudde — DKMO-0191");

  await memberSearch.fill("DKMO-0191");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option")).toContainText("Yusuf Adoor Nadugudde — DKMO-0191");

  await memberSearch.fill("does-not-exist");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(page.getByText("No members found")).toBeVisible();
  await expect.poll(() => searchQueries).toEqual(expect.arrayContaining(["Yusuf", "Yusuf Adoor", "DKMO-0191", "does-not-exist"]));
});