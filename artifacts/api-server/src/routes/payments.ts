import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, membersTable, paymentsTable, frfClaimsTable } from "@workspace/db";
import {
  CreatePaymentBody,
  GetPaymentParams,
  DeletePaymentParams,
  ListPaymentsQueryParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole, type AuthedRequest } from "../middlewares/requireAuth";
import { paymentToApi } from "../lib/serializers";
import { logAudit } from "../lib/audit";
import {
  markContributionPaid,
  revertContributionForPayment,
  syncMemberFrfEligibility,
} from "../lib/frf-ledger";

const router: IRouter = Router();

router.use(requireAuth);

async function syncPortalMembershipFee(
  memberId: string,
  actor: string,
  executor: Pick<typeof db, "select" | "update" | "insert"> = db,
): Promise<void> {
  const [member] = await executor
    .select({
      id: membersTable.id,
    })
    .from(membersTable)
    .where(eq(membersTable.id, memberId));
  if (!member) return;

  const membershipPayments = await executor
    .select({
      status: paymentsTable.status,
      amountDue: paymentsTable.amountDue,
      amountPaid: paymentsTable.amountPaid,
      paidAt: paymentsTable.paidAt,
    })
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.memberId, memberId),
        eq(paymentsTable.paymentType, "membership_fee"),
      ),
    );

  const activePayments = membershipPayments.filter(
    (payment) => payment.status !== "cancelled" && payment.status !== "refunded",
  );
  const successfulPayments = activePayments
    .filter(
      (payment) =>
        payment.status === "paid" &&
        Number(payment.amountPaid) >= Number(payment.amountDue),
    )
    .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());
  const partialPayments = activePayments.filter(
    (payment) =>
      Number(payment.amountPaid) > 0 &&
      Number(payment.amountPaid) < Number(payment.amountDue),
  );
  const pendingPayments = activePayments.filter(
    (payment) => payment.status === "pending" || payment.status === "overdue",
  );

  const nextFeeStatus = successfulPayments.length > 0
    ? "paid"
    : partialPayments.length > 0
      ? "partial"
      : pendingPayments.length > 0
        ? "pending"
        : "unpaid";
  const [updated] = await executor
    .update(membersTable)
    .set({
      feeStatus: nextFeeStatus,
      feePaidAt: successfulPayments[0]?.paidAt ?? null,
      feeUpdatedBy: actor,
    })
    .where(eq(membersTable.id, memberId))
    .returning({ feeStatus: membersTable.feeStatus });

  await syncMemberFrfEligibility(
    memberId,
    updated?.feeStatus ?? nextFeeStatus,
    executor,
  );
}

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

router.post("/payments", requireRole("admin", "finance"), async (req, res): Promise<void> => {
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

  const paymentType = parsed.data.paymentType ?? "membership_fee";
  const status = parsed.data.status ?? "paid";

  // Financial integrity: zero/negative amounts are only allowed for special
  // record types (waiver, adjustment) or non-collecting statuses.
  const isSpecialType = paymentType === "waiver" || paymentType === "adjustment";
  const isNonCollecting = status === "cancelled" || status === "refunded";
  if (Number(parsed.data.amountPaid) <= 0 && !isSpecialType && !isNonCollecting) {
    res.status(400).json({
      error:
        "Payment amount must be greater than 0 (only waiver/adjustment records or cancelled/refunded payments may be 0)",
    });
    return;
  }
  const frfClaimId =
    paymentType === "frf_contribution" ? (parsed.data.frfClaimId ?? null) : null;

  if (paymentType === "frf_contribution" && member.feeStatus !== "paid") {
    res.status(409).json({
      error: "FRF payment is unavailable because the membership fee has not been paid.",
    });
    return;
  }
  if (paymentType === "frf_contribution" && !frfClaimId) {
    res.status(400).json({ error: "FRF payments must be linked to an FRF case." });
    return;
  }

  // Server-side validation: an FRF contribution linked to a claim may only be
  // recorded against a collectable (approved or disbursed) claim.
  if (frfClaimId) {
    const [claim] = await db
      .select({ id: frfClaimsTable.id, status: frfClaimsTable.status })
      .from(frfClaimsTable)
      .where(eq(frfClaimsTable.id, frfClaimId));
    if (!claim) {
      res.status(404).json({ error: "FRF claim not found" });
      return;
    }
    if (claim.status !== "approved" && claim.status !== "disbursed") {
      res.status(400).json({
        error: "FRF contributions can only be recorded for approved claims",
      });
      return;
    }
  }

  let created: typeof paymentsTable.$inferSelect | undefined;
  try {
    // Payment insert and FRF ledger sync are atomic: either both are
    // recorded or neither, so ledger status never drifts from payments.
    created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(paymentsTable)
        .values({
          memberId: parsed.data.memberId,
          paymentType,
          frfClaimId,
          amountDue: String(parsed.data.amountDue ?? parsed.data.amountPaid),
          amountPaid: String(parsed.data.amountPaid),
          status,
          paymentMethod: parsed.data.paymentMethod,
          receiptNumber: parsed.data.receiptNumber,
          notes: parsed.data.notes ?? null,
          dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
          paidAt,
        })
        .returning();
      if (!row) throw new Error("Failed to record payment");

      // Strict separation — only FRF payments linked to a claim touch the
      // contribution ledger; membership fees and other types never do.
      // Cancelled/refunded payments never touch the ledger — they represent
      // money that was not (or is no longer) collected.
      if (
        row.paymentType === "frf_contribution" &&
        row.frfClaimId &&
        row.status !== "cancelled" &&
        row.status !== "refunded"
      ) {
        const [claim] = await tx
          .select({ contributionAmount: frfClaimsTable.contributionAmount })
          .from(frfClaimsTable)
          .where(eq(frfClaimsTable.id, row.frfClaimId));
        await markContributionPaid(
          {
            claimId: row.frfClaimId,
            memberId: row.memberId,
            paymentId: row.id,
            amountPaid: Number(row.amountPaid),
            dueAmount: Number(claim?.contributionAmount ?? row.amountPaid),
            paidAt: row.paidAt,
          },
          tx,
        );
      }
      if (row.paymentType === "membership_fee") {
        await syncPortalMembershipFee(row.memberId, (req as AuthedRequest).userId, tx);
      }
      return row;
    });
  } catch (err) {
    req.log.error({ err }, "Failed to record payment");
    res.status(500).json({ error: "Failed to record payment" });
    return;
  }

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

router.put("/payments/:id", requireRole("admin", "finance"), async (req, res): Promise<void> => {
  const params = GetPaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existingRow] = await db
    .select({ payment: paymentsTable, member: membersTable })
    .from(paymentsTable)
    .innerJoin(membersTable, eq(paymentsTable.memberId, membersTable.id))
    .where(eq(paymentsTable.id, params.data.id));
  if (!existingRow) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }

  // A payment remains attached to its member and FRF claim. Moving money
  // between members/cases would bypass the ledger's identity guarantees.
  const candidate = {
    ...existingRow.payment,
    ...req.body,
    memberId: existingRow.payment.memberId,
    paymentType: existingRow.payment.paymentType,
    frfClaimId: existingRow.payment.frfClaimId ?? undefined,
    amountDue: req.body.amountDue ?? Number(existingRow.payment.amountDue),
    amountPaid: req.body.amountPaid ?? Number(existingRow.payment.amountPaid),
    status: req.body.status ?? existingRow.payment.status,
    paymentMethod: req.body.paymentMethod ?? existingRow.payment.paymentMethod,
    receiptNumber: req.body.receiptNumber ?? existingRow.payment.receiptNumber,
  };
  const parsed = CreatePaymentBody.safeParse(candidate);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const next = parsed.data;
  if (
    existingRow.payment.paymentType === "frf_contribution" &&
    existingRow.member.feeStatus !== "paid"
  ) {
    res.status(409).json({
      error: "FRF payment is unavailable because the membership fee has not been paid.",
    });
    return;
  }
  const isSpecialType = existingRow.payment.paymentType === "waiver" || existingRow.payment.paymentType === "adjustment";
  const isNonCollecting = next.status === "cancelled" || next.status === "refunded";
  if (Number(next.amountPaid) <= 0 && !isSpecialType && !isNonCollecting) {
    res.status(400).json({ error: "Payment amount must be greater than 0" });
    return;
  }

  try {
    const updated = await db.transaction(async (tx) => {
      const wasLedgerPayment =
        existingRow.payment.paymentType === "frf_contribution" &&
        existingRow.payment.frfClaimId &&
        existingRow.payment.status !== "cancelled" &&
        existingRow.payment.status !== "refunded";
      if (wasLedgerPayment) {
        await revertContributionForPayment(
          {
            claimId: existingRow.payment.frfClaimId!,
            memberId: existingRow.payment.memberId,
            amountPaid: Number(existingRow.payment.amountPaid),
          },
          tx,
        );
      }
      const [row] = await tx
        .update(paymentsTable)
        .set({
          amountDue: String(next.amountDue ?? existingRow.payment.amountDue),
          amountPaid: String(next.amountPaid),
          status: next.status ?? existingRow.payment.status,
          paymentMethod: next.paymentMethod,
          receiptNumber: next.receiptNumber,
          notes: next.notes ?? null,
          dueDate: next.dueDate ? new Date(next.dueDate) : null,
          paidAt: next.paidAt ? new Date(next.paidAt) : existingRow.payment.paidAt,
        })
        .where(eq(paymentsTable.id, params.data.id))
        .returning();
      if (!row) throw new Error("Payment not found");
      if (
        row.paymentType === "frf_contribution" &&
        row.frfClaimId &&
        row.status !== "cancelled" &&
        row.status !== "refunded"
      ) {
        const [claim] = await tx
          .select({ contributionAmount: frfClaimsTable.contributionAmount })
          .from(frfClaimsTable)
          .where(eq(frfClaimsTable.id, row.frfClaimId));
        await markContributionPaid(
          {
            claimId: row.frfClaimId,
            memberId: row.memberId,
            paymentId: row.id,
            amountPaid: Number(row.amountPaid),
            dueAmount: Number(claim?.contributionAmount ?? row.amountDue),
            paidAt: row.paidAt,
          },
          tx,
        );
      }
      if (row.paymentType === "membership_fee") {
        await syncPortalMembershipFee(row.memberId, (req as AuthedRequest).userId, tx);
      }
      return row;
    });
    await logAudit(req, "payment_updated", "payments", {
      entityId: updated.id,
      entityName: existingRow.member.fullName,
      details: `Receipt: ${updated.receiptNumber}, Amount: ${updated.amountPaid}`,
    });
    res.json(paymentToApi(updated, {
      fullName: existingRow.member.fullName,
      membershipId: existingRow.member.membershipId,
    }));
  } catch (err) {
    req.log.error({ err, paymentId: params.data.id }, "Failed to update payment");
    res.status(500).json({ error: "Failed to update payment" });
  }
});

router.delete("/payments/:id", requireRole("admin", "finance"), async (req, res): Promise<void> => {
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
  try {
    // Deletion and FRF ledger revert are atomic so a removed FRF payment
    // always makes the pending obligation reappear.
    await db.transaction(async (tx) => {
      await tx.delete(paymentsTable).where(eq(paymentsTable.id, params.data.id));
      if (
        row.payment.paymentType === "frf_contribution" &&
        row.payment.frfClaimId &&
        // Symmetric with creation: cancelled/refunded payments never marked
        // the ledger paid, so deleting them must not revert it.
        row.payment.status !== "cancelled" &&
        row.payment.status !== "refunded"
      ) {
        await revertContributionForPayment(
          {
            claimId: row.payment.frfClaimId,
            memberId: row.payment.memberId,
            amountPaid: Number(row.payment.amountPaid),
          },
          tx,
        );
      }
      if (row.payment.paymentType === "membership_fee") {
        await syncPortalMembershipFee(row.payment.memberId, (req as AuthedRequest).userId, tx);
      }
    });
  } catch (err) {
    req.log.error({ err, paymentId: row.payment.id }, "Failed to delete payment");
    res.status(500).json({ error: "Failed to delete payment" });
    return;
  }

  logAudit(req, "payment_deleted", "payments", {
    entityId: row.payment.id,
    entityName: row.member.fullName,
    details: `Receipt: ${row.payment.receiptNumber}, Type: ${row.payment.paymentType}`,
  });
  res.sendStatus(204);
});

export default router;
