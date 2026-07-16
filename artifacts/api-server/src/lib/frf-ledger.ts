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
type Executor = Pick<typeof db, "insert" | "update">;

export type FrfEligibilityStatus =
  | "eligible"
  | "pending_activation"
  | "suspended"
  | "not_eligible";

export function frfEligibility(member: Pick<Member, "feeStatus" | "frfStatus">): {
  status: FrfEligibilityStatus;
  reason: string;
} {
  if (member.frfStatus === "suspended") {
    return { status: "suspended", reason: "Member Suspended" };
  }
  if (member.frfStatus === "inactive") {
    return { status: "not_eligible", reason: "Member Inactive" };
  }
  if (member.feeStatus !== "paid") {
    return {
      status: "pending_activation",
      reason: "Membership Fee Not Paid",
    };
  }
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
): "paid" | "pending" | "overdue" | "cancelled" {
  if (contribution.status === "paid") return "paid";
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
 * Generate contribution ledger rows for every currently-eligible active
 * member for an approved claim. Idempotent: the unique (claim_id, member_id)
 * index plus ON CONFLICT DO NOTHING guarantees no duplicates.
 * Returns the number of rows created.
 */
export async function generateContributionsForClaim(
  claimId: string,
  amount: number,
): Promise<number> {
  const eligibleMembers = await db
    .select({ id: membersTable.id })
    .from(membersTable)
    .where(
      and(
        eq(membersTable.feeStatus, "paid"),
        eq(membersTable.frfStatus, "active"),
      ),
    );

  if (eligibleMembers.length === 0) return 0;

  const rows = eligibleMembers.map((m) => ({
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
 * Link an FRF payment to the member's contribution row for the claim and
 * mark it paid. If no ledger row exists (member activated after approval and
 * chose to contribute anyway), create one as paid.
 */
export async function markContributionPaid(
  opts: {
    claimId: string;
    memberId: string;
    paymentId: string;
    amount: number;
    paidAt: Date;
  },
  executor: Executor = db,
): Promise<void> {
  await executor
    .insert(frfContributionsTable)
    .values({
      claimId: opts.claimId,
      memberId: opts.memberId,
      amount: String(opts.amount),
      status: "paid",
      paymentId: opts.paymentId,
      paidAt: opts.paidAt,
    })
    .onConflictDoUpdate({
      target: [frfContributionsTable.claimId, frfContributionsTable.memberId],
      set: {
        status: "paid",
        amount: String(opts.amount),
        paymentId: opts.paymentId,
        paidAt: opts.paidAt,
        updatedAt: sql`now()`,
      },
    });
}

/**
 * Revert the contribution linked to a deleted/cancelled FRF payment back to
 * pending so the obligation reappears automatically.
 */
export async function revertContributionForPayment(
  paymentId: string,
  executor: Executor = db,
): Promise<number> {
  const updated = await executor
    .update(frfContributionsTable)
    .set({ status: "pending", paymentId: null, paidAt: null })
    .where(eq(frfContributionsTable.paymentId, paymentId))
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
    })
    .from(frfContributionsTable)
    .innerJoin(
      frfClaimsTable,
      eq(frfContributionsTable.claimId, frfClaimsTable.id),
    );

  const filter = memberIds ? new Set(memberIds) : null;
  const now = new Date();
  const map = new Map<string, MemberFrfAggregate>();

  for (const { contribution: c, approvedDate } of rows) {
    if (filter && !filter.has(c.memberId)) continue;
    const status = deriveContributionStatus(c, approvedDate, now);
    if (status === "cancelled") continue;
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
    agg.totalClaims += 1;
    agg.totalDue += amount;
    if (status === "paid") {
      agg.totalPaid += amount;
      if (c.paidAt && (!agg.lastContributionAt || c.paidAt > agg.lastContributionAt)) {
        agg.lastContributionAt = c.paidAt;
      }
    } else {
      agg.totalOutstanding += amount;
      if (status === "overdue") agg.overdueCount += 1;
      else agg.pendingCount += 1;
    }
  }

  return map;
}
