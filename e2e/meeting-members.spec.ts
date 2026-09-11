import { expect, test } from "@playwright/test";

const basePath = "/dkmo-e2e";

test("meeting attendance members can be searched, edited, cancelled, and saved per meeting", async ({ page }) => {
  const members = [
    { memberId: "member-a", membershipId: "DKMO-0001", fullName: "Alpha Member", location: "Riyadh", mobileNumber: "0500000001" },
    { memberId: "member-b", membershipId: "DKMO-0002", fullName: "Beta Member", location: "Riyadh", mobileNumber: "0500000002" },
    { memberId: "member-c", membershipId: "DKMO-0003", fullName: "Gamma Member", location: "Jeddah", mobileNumber: "0500000003" },
    { memberId: "member-d", membershipId: "DKMO-0004", fullName: "Delta Member", location: "Dammam", mobileNumber: "0500000004" },
  ];
  let selectedIds = ["member-a", "member-b", "member-c"];
  let savedMemberIds: string[] | null = null;
  const statusByMember = new Map([["member-c", "present"]]);

  const detail = () => ({
    id: "meeting-1",
    title: "September Committee Meeting",
    meetingDate: "2026-09-20T00:00:00.000Z",
    location: "DKMO Hall",
    notes: "",
    committeeTermId: "term-2026",
    totalCount: selectedIds.length,
    presentCount: selectedIds.filter((id) => statusByMember.get(id) === "present").length,
    absentCount: selectedIds.filter((id) => statusByMember.get(id) !== "present").length,
    attendancePercentage: Math.round(
      (selectedIds.filter((id) => statusByMember.get(id) === "present").length / selectedIds.length) * 1000,
    ) / 10,
    createdAt: "2026-09-01T00:00:00.000Z",
    attendance: selectedIds.map((id) => {
      const member = members.find((item) => item.memberId === id)!;
      return { ...member, status: statusByMember.get(id) === "present" ? "present" : "absent" };
    }),
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.endsWith("/api/me")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "meeting-e2e-user",
          username: "meeting-e2e",
          displayName: "Meeting Tester",
          role: "admin",
        }),
      });
      return;
    }

    if (path.endsWith("/api/meetings/meeting-1/participants")) {
      if (request.method() === "PUT") {
        const body = JSON.parse(request.postData() ?? "{}") as { memberIds?: string[] };
        savedMemberIds = body.memberIds ?? [];
        selectedIds = [...savedMemberIds];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(detail()),
        });
        return;
      }
      const search = url.searchParams.get("search")?.toLowerCase() ?? "";
      const results = members
        .filter((member) =>
          !search ||
          member.fullName.toLowerCase().includes(search) ||
          member.membershipId.toLowerCase().includes(search),
        )
        .map((member) => ({ ...member, selected: selectedIds.includes(member.memberId) }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          meetingId: "meeting-1",
          selectedCount: selectedIds.length,
          members: results,
        }),
      });
      return;
    }

    if (path.endsWith("/api/meetings/meeting-1")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(detail()),
      });
      return;
    }

    if (path.endsWith("/api/meetings")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{
          id: "meeting-1",
          title: "September Committee Meeting",
          meetingDate: "2026-09-20T00:00:00.000Z",
          location: "DKMO Hall",
          notes: "",
          committeeTermId: "term-2026",
          totalCount: selectedIds.length,
          presentCount: 1,
          absentCount: selectedIds.length - 1,
          attendancePercentage: Math.round((1 / selectedIds.length) * 1000) / 10,
          createdAt: "2026-09-01T00:00:00.000Z",
        }]),
      });
      return;
    }

    if (path.endsWith("/api/committee/terms")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ committeeYear: "2026-27", isActive: true }]),
      });
      return;
    }

    if (path.endsWith("/api/committee/terms/2026-27")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          members: members.map((member, index) => ({
            assignmentId: `assignment-${index}`,
            memberId: member.memberId,
            membershipId: member.membershipId,
            fullName: member.fullName,
            photoUrl: null,
            position: "Committee Member",
            isActive: true,
          })),
        }),
      });
      return;
    }

    if (path.endsWith("/api/members")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(members.map((member) => ({ ...member, photoUrl: null }))),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.goto(`${basePath}/meetings`);
  await expect(page.getByTestId("button-edit-meeting-members")).toBeVisible();
  await page.getByTestId("button-edit-meeting-members").click();

  const dialog = page.getByTestId("dialog-edit-meeting-members");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("3 members selected", { exact: true })).toBeVisible();

  await dialog.getByTestId("input-meeting-member-search").fill("DKMO-0004");
  await expect(dialog.getByTestId("meeting-member-option-member-d")).toBeVisible();
  await dialog.getByTestId("meeting-member-option-member-d").click();
  await expect(dialog.getByText("4 members selected", { exact: true })).toBeVisible();

  await dialog.getByTestId("remove-meeting-member-member-b").click();
  await expect(dialog.getByText("3 members selected", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(savedMemberIds).toBeNull();

  await page.getByTestId("button-edit-meeting-members").click();
  await expect(page.getByTestId("dialog-edit-meeting-members")).toBeVisible();
  await page.getByTestId("input-meeting-member-search").fill("Beta Member");
  await page.getByTestId("meeting-member-option-member-b").click();
  await page.getByTestId("input-meeting-member-search").fill("DKMO-0004");
  await page.getByTestId("meeting-member-option-member-d").click();
  await page.getByTestId("button-save-meeting-members").click();

  await expect(page.getByTestId("dialog-edit-meeting-members")).toBeHidden();
  await expect.poll(() => savedMemberIds).toEqual(["member-a", "member-c", "member-d"]);
  await expect(page.getByTestId("row-attendance-member-d")).toBeVisible();
  await expect(page.getByTestId("row-attendance-member-b")).toHaveCount(0);
});