import { Router, type IRouter } from "express";
import { eq, ilike, or, desc, sum, count } from "drizzle-orm";
import { db, membersTable, paymentsTable } from "@workspace/db";
import {
  CreateMemberBody,
  UpdateMemberBody,
  GetMemberParams,
  UpdateMemberParams,
  DeleteMemberParams,
  ListMembersQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { memberToApi, paymentToApi } from "../lib/serializers";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/members", async (req, res): Promise<void> => {
  const parsed = ListMembersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const search = parsed.data.search?.trim();

  const rows = search
    ? await db
        .select()
        .from(membersTable)
        .where(
          or(
            ilike(membersTable.fullName, `%${search}%`),
            ilike(membersTable.mobileNumber, `%${search}%`),
            ilike(membersTable.membershipId, `%${search}%`),
            ilike(membersTable.city, `%${search}%`),
            ilike(membersTable.country, `%${search}%`),
          ),
        )
        .orderBy(desc(membersTable.createdAt))
    : await db
        .select()
        .from(membersTable)
        .orderBy(desc(membersTable.createdAt));

  res.json(rows.map(memberToApi));
});

router.post("/members", async (req, res): Promise<void> => {
  const parsed = CreateMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [created] = await db
      .insert(membersTable)
      .values({
        fullName: parsed.data.fullName,
        mobileNumber: parsed.data.mobileNumber,
        membershipId: parsed.data.membershipId,
        city: parsed.data.city ?? "",
        country: parsed.data.country ?? "",
        designation: parsed.data.designation ?? "",
        monthlyAmount: String(parsed.data.monthlyAmount),
      })
      .returning();
    if (!created) {
      res.status(500).json({ error: "Failed to create member" });
      return;
    }
    res.status(201).json(memberToApi(created));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("duplicate") || message.includes("unique")) {
      res.status(400).json({ error: "Membership ID already exists" });
      return;
    }
    throw err;
  }
});

router.get("/members/:id", async (req, res): Promise<void> => {
  const params = GetMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [member] = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.id, params.data.id));

  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  const [agg] = await db
    .select({
      total: sum(paymentsTable.amountPaid),
      cnt: count(paymentsTable.id),
    })
    .from(paymentsTable)
    .where(eq(paymentsTable.memberId, member.id));

  const recent = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.memberId, member.id))
    .orderBy(desc(paymentsTable.paidAt))
    .limit(20);

  const totalPaid = Number(agg?.total ?? 0);
  const monthly = Number(member.monthlyAmount);
  const created = member.createdAt;
  const now = new Date();
  const monthsElapsed = Math.max(
    1,
    (now.getUTCFullYear() - created.getUTCFullYear()) * 12 +
      (now.getUTCMonth() - created.getUTCMonth()) +
      1,
  );
  const expected = monthly * monthsElapsed;
  const totalDue = Math.max(0, expected - totalPaid);

  res.json({
    ...memberToApi(member),
    totalPaid,
    totalDue,
    paymentsCount: Number(agg?.cnt ?? 0),
    recentPayments: recent.map((p) =>
      paymentToApi(p, {
        fullName: member.fullName,
        membershipId: member.membershipId,
      }),
    ),
  });
});

router.patch("/members/:id", async (req, res): Promise<void> => {
  const params = UpdateMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [updated] = await db
      .update(membersTable)
      .set({
        fullName: parsed.data.fullName,
        mobileNumber: parsed.data.mobileNumber,
        membershipId: parsed.data.membershipId,
        city: parsed.data.city ?? "",
        country: parsed.data.country ?? "",
        designation: parsed.data.designation ?? "",
        monthlyAmount: String(parsed.data.monthlyAmount),
      })
      .where(eq(membersTable.id, params.data.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    res.json(memberToApi(updated));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("duplicate") || message.includes("unique")) {
      res.status(400).json({ error: "Membership ID already exists" });
      return;
    }
    throw err;
  }
});

router.delete("/members/:id", async (req, res): Promise<void> => {
  const params = DeleteMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(membersTable)
    .where(eq(membersTable.id, params.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
