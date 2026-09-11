import { expect, test } from "@playwright/test";
import {
  createPaymentFixtures,
  mockPaymentsApi,
} from "./fixtures/payment-fixtures";

const fixtures = createPaymentFixtures();
const { contributions } = fixtures;

test("active FRF reminders only target unpaid paid-membership rows", async ({
  page,
}) => {
  const { mutationRequests } = await mockPaymentsApi(page);
  await page.goto("/dkmo-e2e/payments?tab=frf");

  const reminder = page.getByTestId("button-frf-remind-DKMO-ACTIVE");
  await expect(reminder).toBeVisible();
  await expect(
    page.getByTestId("button-frf-remind-disabled-DKMO-NOMOBILE"),
  ).toBeDisabled();
  await expect(page.getByTestId("button-frf-remind-DKMO-PAID")).toHaveCount(0);
  await expect(page.getByText("Unpaid Membership Member")).toHaveCount(0);

  await page.evaluate(() => {
    const testWindow = window as Window & { __openedWhatsAppUrl?: string };
    testWindow.open = ((url?: string | URL) => {
      testWindow.__openedWhatsAppUrl = String(url ?? "");
      return null;
    }) as typeof window.open;
  });
  await reminder.click();
  await expect(page.getByRole("dialog").locator("pre")).toContainText(
    "Active Reminder Member",
  );
  await page.getByTestId("frf-whatsapp-reminder-open").click();
  const openedUrl = await page.evaluate(() => {
    const testWindow = window as Window & { __openedWhatsAppUrl?: string };
    return testWindow.__openedWhatsAppUrl ?? "";
  });
  expect(openedUrl).not.toBe("");
  const reminderUrl = new URL(openedUrl);
  expect(reminderUrl.hostname).toBe("wa.me");
  expect(reminderUrl.pathname).toBe("/966501234567");

  const message = reminderUrl.searchParams.get("text") ?? "";
  expect(message).toContain("Active Reminder Member");
  expect(message).toContain("DKMO-ACTIVE");
  expect(message).toContain("September Family Relief Case");
  expect(message).toMatch(/SAR\s*50\.00/);
  expect(message).toMatch(/still unpaid/i);

  // A reminder is a client-side link open, not a payment or ledger mutation.
  expect(mutationRequests).toEqual([]);
});

test("partial and overdue FRF reminders show the current balance without mutations", async ({
  page,
}) => {
  const { mutationRequests } = await mockPaymentsApi(page, {
    activeContributors: [
      contributions.partial,
      contributions.overdue,
      contributions.invalidMobile,
    ],
  });
  await page.goto("/dkmo-e2e/payments?tab=frf");

  await expect(
    page.getByTestId("button-frf-remind-DKMO-PARTIAL"),
  ).toBeVisible();
  await expect(
    page.getByTestId("button-frf-remind-DKMO-OVERDUE"),
  ).toBeVisible();
  await expect(
    page.getByTestId("button-frf-remind-disabled-DKMO-NOMOBILE"),
  ).toBeDisabled();

  await page.evaluate(() => {
    const testWindow = window as Window & { __openedWhatsAppUrl?: string };
    testWindow.open = ((url?: string | URL) => {
      testWindow.__openedWhatsAppUrl = String(url ?? "");
      return null;
    }) as typeof window.open;
  });

  await page.getByTestId("button-frf-remind-DKMO-PARTIAL").click();
  await expect(page.getByRole("dialog").locator("pre")).toContainText(
    "SAR 30.00",
  );
  await expect(page.getByRole("dialog").locator("pre")).toContainText(
    "DKMO-PARTIAL",
  );
  await page.getByTestId("frf-whatsapp-reminder-open").click();
  const partialUrl = await page.evaluate(() => {
    const testWindow = window as Window & { __openedWhatsAppUrl?: string };
    return testWindow.__openedWhatsAppUrl ?? "";
  });
  const partialMessage = new URL(partialUrl).searchParams.get("text") ?? "";
  expect(new URL(partialUrl).pathname).toBe("/966501234570");
  expect(partialMessage).toContain("September Family Relief Case");
  expect(partialMessage).toContain("DKMO-PARTIAL");
  expect(partialMessage).toMatch(/Amount Due:\s*SAR\s*30\.00/);
  expect(partialMessage).toMatch(/still unpaid/i);

  await page.getByTestId("button-frf-remind-DKMO-OVERDUE").click();
  await expect(page.getByRole("dialog").locator("pre")).toContainText(
    "SAR 15.00",
  );
  await expect(page.getByRole("dialog").locator("pre")).toContainText(
    "DKMO-OVERDUE",
  );
  await page.getByTestId("frf-whatsapp-reminder-open").click();
  const overdueUrl = await page.evaluate(() => {
    const testWindow = window as Window & { __openedWhatsAppUrl?: string };
    return testWindow.__openedWhatsAppUrl ?? "";
  });
  const overdueMessage = new URL(overdueUrl).searchParams.get("text") ?? "";
  expect(new URL(overdueUrl).pathname).toBe("/966501234571");
  expect(overdueMessage).toContain("September Family Relief Case");
  expect(overdueMessage).toContain("DKMO-OVERDUE");
  expect(overdueMessage).toMatch(/Amount Due:\s*SAR\s*15\.00/);
  expect(overdueMessage).toMatch(/still unpaid/i);

  // Reminder clicks only open a prefilled link; they must not write payment or ledger data.
  expect(mutationRequests).toEqual([]);
});

test("partial and overdue FRF reminders are hidden without an approved active case", async ({
  page,
}) => {
  await mockPaymentsApi(page, {
    includeActiveCase: false,
    historicalContributors: [contributions.partial, contributions.overdue],
  });
  await page.goto("/dkmo-e2e/payments?tab=frf");

  await expect(
    page.getByRole("cell", { name: "Closed Family Relief Case" }).first(),
  ).toBeVisible();
  await expect(page.getByTestId("button-frf-remind-DKMO-PARTIAL")).toHaveCount(
    0,
  );
  await expect(page.getByTestId("button-frf-remind-DKMO-OVERDUE")).toHaveCount(
    0,
  );
});
