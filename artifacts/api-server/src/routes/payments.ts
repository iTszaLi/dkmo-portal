import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, membersTable, paymentsTable, frfClaimsTable } from "@workspace/db";
import {
  CreatePaymentBody,
  GetPaymentParams,
  DeletePaymentParams,
  ListPaymentsQueryParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { paymentToApi } from "../lib/serializers";
import { logAudit } from "../lib/audit";
import { markContributionPaid, revertContributionForPayment } from "../lib/frf-ledger";

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
