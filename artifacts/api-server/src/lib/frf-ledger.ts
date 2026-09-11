import { and, eq, sql } from "drizzle-orm";
import {
  db,
  frfClaimsTable,
  frfContributionsTable,
  membersTable,
  type FrfContribution,
  type Member,
} from "@workspace/db";

export const FRF_OVERDUE_DAYS = 30;

/** Any drizzle executor — the shared db instance or an open transaction. */
type Executor = Pick<typeof db, "select" | "insert" | "update">;

export type FrfEligibilityStatus =
  | "eligible"
  | "pending_activation"
  | "suspended"
  | "not_eligible";

export function frfEligibility(member: Pick<Member, "feeStatus" | "frfStatus">): {
  status: FrfEligibilityStatus;
  reason: string;
} {
  if (member.feeStatus !== "paid") {
    return {
      status: "not_eligible",
      reason: "Membership Fee Not Paid",
    };
  }
  // Membership payment is the sole FRF eligibility gate. Stored FRF status
  // values are legacy/cache data and must not override a paid membership.
  return { status: "eligible", reason: "" };
}

export function isFrfEligible(
  member: Pick<Member, "feeStatus" | "frfStatus">,
): boolean {
  return frfEligibility(member).status === "eligible";
}

/**
 * Derive the effective status of a contribution row. "overdue" is never
 * stored; it is derived from a pending contribution whose claim was
 * approved more than FRF_OVERDUE_DAYS ago.
 */
export function deriveContributionStatus(
  contribution: Pick<FrfContribution, "status">,
  claimApprovedDate: Date | null,
  now: Date = new Date(),
): "paid" | "partial" | "pending" | "overdue" | "cancelled" | "exempt" {
  if (contribution.status === "paid") return "paid";
  if (contribution.status === "partial") return "partial";
  if (contribution.status === "exempt") return "exempt";
  if (contribution.status === "cancelled") return "cancelled";
  if (
    claimApprovedDate &&
    now.getTime() - claimApprovedDate.getTime() >
      FRF_OVERDUE_DAYS * 24 * 60 * 60 * 1000
  ) {
    return "overdue";
  }
  return "pending";
}

/**
 * Reconcile contribution ledger rows for every current DKMO member for a
 * collecting claim. Idempotent: the unique (claim_id, member_id) index plus
 * ON CONFLICT DO NOTHING guarantees no duplicates. Existing paid, partial,
 * exempt, cancelled, and pending rows are never overwritten.
 * Returns the number of rows created.
 */
export async function generateContributionsForClaim(
  claimId: string,
  amount: number,
): Promise<number> {
  // A claim is also the current collection-case record. Never self-heal a
  // closed, rejected, or review-only historical claim into a live ledger.
  const [claim] = await db
    .select({ status: frfClaimsTable.status })
    .from(frfClaimsTable)
    .where(eq(frfClaimsTable.id, claimId));
  if (!claim || claim.status !== "approved") return 0;

  const currentMembers = await db
    .select({ id: membersTable.id })
    .from(membersTable)
    .where(eq(membersTable.feeStatus, "paid"));

  if (currentMembers.length === 0) return 0;

  const rows = currentMembers.map((m) => ({
    claimId,
    memberId: m.id,
    amount: String(amount),
    status: "pending" as const,
  }));

  const inserted = await db
    .insert(frfContributionsTable)
    .values(rows)
    .onConflictDoNothing({
      target: [frfContributionsTable.claimId, frfContributionsTable.memberId],
    })
    .returning({ id: frfContributionsTable.id });

  return inserted.length;
}

/**
 * Keep the current FRF collection rows aligned with membership-fee
 * eligibility. A member can only receive new/reopened dues after the
 * membership fee is paid. Existing contribution rows are preserved for
 * history; only still-pending rows are cancelled when eligibility is lost.
 */
export async function syncMemberFrfEligibility(
  memberId: string,
  feeStatus: string,
  executor: Executor = db,
): Promise<void> {
  if (feeStatus !== "paid") {
    await executor
      .update(frfContributionsTable)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(frfContributionsTable.memberId, memberId),
          eq(frfContributionsTable.status, "pending"),
        ),
      );
    await executor
      .update(membersTable)
      .set({ frfStatus: "inactive" })
      .where(eq(membersTable.id, memberId));
    return;
  }

  await executor
    .update(membersTable)
    .set({ frfStatus: "active" })
    .where(eq(membersTable.id, memberId));

  const activeClaims = await executor
    .select({
      id: frfClaimsTable.id,
      contributionAmount: frfClaimsTable.contributionAmount,
    })
    .from(frfClaimsTable)
    .where(eq(frfClaimsTable.status, "approved"));

  for (const claim of activeClaims) {
    await executor
      .insert(frfContributionsTable)
      .values({
        claimId: claim.id,
        memberId,
        amount: claim.contributionAmount,
        status: "pending",
      })
      .onConflictDoNothing({
        target: [frfContributionsTable.claimId, frfContributionsTable.memberId],
      });

    await executor
      .update(frfContributionsTable)
      .set({ status: "pending" })
      .where(
        and(
          eq(frfContributionsTable.claimId, claim.id),
          eq(frfContributionsTable.memberId, memberId),
          eq(frfContributionsTable.status, "cancelled"),
        ),
      );
  }
}

/**
 * Cancel all still-pending contributions of a claim (used when an approved
 * claim is later rejected). Paid rows are preserved for the audit trail.
 */
export async function cancelPendingContributions(
  claimId: string,
): Promise<number> {
  const updated = await db
    .update(frfContributionsTable)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(frfContributionsTable.claimId, claimId),
        eq(frfContributionsTable.status, "pending"),
      ),
    )
    .returning({ id: frfContributionsTable.id });
  return updated.length;
}

/**
 * Re-open cancelled contributions when a claim is re-approved so history is
 * preserved instead of duplicated (unique index prevents new rows).
 */
export async function reopenCancelledContributions(
  claimId: string,
): Promise<number> {
  const updated = await db
    .update(frfContributionsTable)
    .set({ status: "pending" })
    .where(
      and(
        eq(frfContributionsTable.claimId, claimId),
        eq(frfContributionsTable.status, "cancelled"),
      ),
    )
    .returning({ id: frfContributionsTable.id });
  return updated.length;
}

/**
 * Link an FRF payment to the member's contribution row for the claim.
 * Payments accumulate into amount_paid; the status becomes "paid" once the
 * accumulated total reaches the due amount, otherwise "partial". The due
 * amount is preserved (never overwritten by the payment amount). If no
 * ledger row exists (member activated after case creation and chose to
 * contribute anyway), create one with the claim's due amount.
 */
export async function markContributionPaid(
  opts: {
    claimId: string;
    memberId: string;
    paymentId: string;
    amountPaid: number;
    dueAmount: number;
    paidAt: Date;
  },
  executor: Executor = db,
): Promise<void> {
  const paid = String(opts.amountPaid);
  await executor
    .insert(frfContributionsTable)
    .values({
      claimId: opts.claimId,
      memberId: opts.memberId,
      amount: String(opts.dueAmount),
      amountPaid: paid,
      status: opts.amountPaid >= opts.dueAmount ? "paid" : "partial",
      paymentId: opts.paymentId,
      paidAt: opts.paidAt,
    })
    .onConflictDoUpdate({
      target: [frfContributionsTable.claimId, frfContributionsTable.memberId],
      set: {
        amountPaid: sql`${frfContributionsTable.amountPaid} + ${paid}::numeric`,
        status: sql`CASE WHEN ${frfContributionsTable.amountPaid} + ${paid}::numeric >= ${frfContributionsTable.amount} THEN 'paid' ELSE 'partial' END`,
        paymentId: opts.paymentId,
        paidAt: opts.paidAt,
        updatedAt: sql`now()`,
      },
    });
}

/**
 * Revert the contribution linked to a deleted/cancelled FRF payment. The
 * deleted payment's amount is subtracted from the accumulated total and the
 * status recomputed (paid → partial → pending) so the obligation reappears.
 */
export async function revertContributionForPayment(
  opts: { claimId: string; memberId: string; amountPaid: number },
  executor: Executor = db,
): Promise<number> {
  const amt = String(opts.amountPaid);
  const updated = await executor
    .update(frfContributionsTable)
    .set({
      amountPaid: sql`GREATEST(${frfContributionsTable.amountPaid} - ${amt}::numeric, 0)`,
      status: sql`CASE
        WHEN GREATEST(${frfContributionsTable.amountPaid} - ${amt}::numeric, 0) = 0 THEN 'pending'
        WHEN GREATEST(${frfContributionsTable.amountPaid} - ${amt}::numeric, 0) >= ${frfContributionsTable.amount} THEN 'paid'
        ELSE 'partial'
      END`,
      paymentId: null,
      paidAt: null,
    })
    .where(
      and(
        eq(frfContributionsTable.claimId, opts.claimId),
        eq(frfContributionsTable.memberId, opts.memberId),
      ),
    )
    .returning({ id: frfContributionsTable.id });
  return updated.length;
}

export interface MemberFrfAggregate {
  memberId: string;
  totalClaims: number;
  totalDue: number;
  totalPaid: number;
  totalOutstanding: number;
  overdueCount: number;
  pendingCount: number;
  lastContributionAt: Date | null;
}

/**
 * Aggregate FRF ledger totals per member (cancelled rows excluded from due).
 * If memberIds is provided, restrict to those members.
 */
export async function aggregateMemberFrf(
  memberIds?: string[],
): Promise<Map<string, MemberFrfAggregate>> {
  const rows = await db
    .select({
      contribution: frfContributionsTable,
      approvedDate: frfClaimsTable.approvedDate,
      feeStatus: membersTable.feeStatus,
    })
    .from(frfContributionsTable)
    .innerJoin(
      frfClaimsTable,
      eq(frfContributionsTable.claimId, frfClaimsTable.id),
    )
    .innerJoin(membersTable, eq(frfContributionsTable.memberId, membersTable.id));

  const filter = memberIds ? new Set(memberIds) : null;
  const now = new Date();
  const map = new Map<string, MemberFrfAggregate>();

  for (const { contribution: c, approvedDate, feeStatus } of rows) {
    if (filter && !filter.has(c.memberId)) continue;
    if (feeStatus !== "paid") continue;
    const status = deriveContributionStatus(c, approvedDate, now);
    if (status === "cancelled" || status === "exempt") continue;
    let agg = map.get(c.memberId);
    if (!agg) {
      agg = {
        memberId: c.memberId,
        totalClaims: 0,
        totalDue: 0,
        totalPaid: 0,
        totalOutstanding: 0,
        overdueCount: 0,
        pendingCount: 0,
        lastContributionAt: null,
      };
      map.set(c.memberId, agg);
    }
    const amount = Number(c.amount);
    const paid = Number(c.amountPaid);
    agg.totalClaims += 1;
    agg.totalDue += amount;
    agg.totalPaid += paid;
    if (
      paid > 0 &&
      c.paidAt &&
      (!agg.lastContributionAt || c.paidAt > agg.lastContributionAt)
    ) {
      agg.lastContributionAt = c.paidAt;
    }
    if (status !== "paid") {
      agg.totalOutstanding += Math.max(amount - paid, 0);
      if (status === "overdue") agg.overdueCount += 1;
      else agg.pendingCount += 1;
    }
  }

  return map;
}
