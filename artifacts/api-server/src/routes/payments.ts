import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, membersTable, paymentsTable } from "@workspace/db";
import {
  CreatePaymentBody,
  GetPaymentParams,
  DeletePaymentParams,
  ListPaymentsQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { paymentToApi } from "../lib/serializers";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/payments", async (req, res): Promise<void> => {
  const parsed = ListPaymentsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const conds = [];
  if (parsed.data.memberId) {
    conds.push(eq(paymentsTable.memberId, parsed.data.memberId));
  }
  if (parsed.data.paymentType) {
    conds.push(eq(paymentsTable.paymentType, parsed.data.paymentType));
  }
  if (parsed.data.status) {
    conds.push(eq(paymentsTable.status, parsed.data.status));
  }
  if (parsed.data.paymentMethod) {
    conds.push(eq(paymentsTable.paymentMethod, parsed.data.paymentMethod));
  }
  const where = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);

  const rows = await db
    .select({
      payment: paymentsTable,
      member: membersTable,
    })
    .from(paymentsTable)
    .innerJoin(membersTable, eq(paymentsTable.memberId, membersTable.id))
    .where(where)
    .orderBy(desc(paymentsTable.paidAt));

  res.json(
    rows.map((r) =>
      paymentToApi(r.payment, {
        fullName: r.member.fullName,
        membershipId: r.member.membershipId,
      }),
    ),
  );
});

router.post("/payments", async (req, res): Promise<void> => {
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [member] = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.id, parsed.data.memberId));

  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  const paidAt = parsed.data.paidAt
    ? new Date(parsed.data.paidAt)
    : new Date();

  const [created] = await db
    .insert(paymentsTable)
    .values({
      memberId: parsed.data.memberId,
      paymentType: parsed.data.paymentType ?? "membership_fee",
      frfClaimId: parsed.data.frfClaimId ?? null,
      amountDue: String(parsed.data.amountDue ?? parsed.data.amountPaid),
      amountPaid: String(parsed.data.amountPaid),
      status: parsed.data.status ?? "paid",
      paymentMethod: parsed.data.paymentMethod,
      receiptNumber: parsed.data.receiptNumber,
      notes: parsed.data.notes ?? null,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      paidAt,
    })
    .returning();

  if (!created) {
    res.status(500).json({ error: "Failed to record payment" });
    return;
  }

  logAudit(req, "payment_created", "payments", {
    entityId: created.id,
    entityName: member.fullName,
    details: `Receipt: ${created.receiptNumber}, Type: ${created.paymentType}, Amount: ${created.amountPaid}`,
  });

  res.status(201).json(
    paymentToApi(created, {
      fullName: member.fullName,
      membershipId: member.membershipId,
    }),
  );
});

router.get("/payments/:id", async (req, res): Promise<void> => {
  const params = GetPaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select({ payment: paymentsTable, member: membersTable })
    .from(paymentsTable)
    .innerJoin(membersTable, eq(paymentsTable.memberId, membersTable.id))
    .where(eq(paymentsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }
  res.json(
    paymentToApi(row.payment, {
      fullName: row.member.fullName,
      membershipId: row.member.membershipId,
    }),
  );
});

router.delete("/payments/:id", async (req, res): Promise<void> => {
  const params = DeletePaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select({ payment: paymentsTable, member: membersTable })
    .from(paymentsTable)
    .innerJoin(membersTable, eq(paymentsTable.memberId, membersTable.id))
    .where(eq(paymentsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }
  await db.delete(paymentsTable).where(eq(paymentsTable.id, params.data.id));
  logAudit(req, "payment_deleted", "payments", {
    entityId: row.payment.id,
    entityName: row.member.fullName,
    details: `Receipt: ${row.payment.receiptNumber}, Type: ${row.payment.paymentType}`,
  });
  res.sendStatus(204);
});

export default router;
