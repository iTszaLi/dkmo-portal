import type { Member, Payment } from "@workspace/db";

export function memberToApi(m: Member) {
  return {
    id: m.id,
    fullName: m.fullName,
    mobileNumber: m.mobileNumber,
    membershipId: m.membershipId,
    city: m.city,
    country: m.country,
    designation: m.designation ?? "",
    membershipFee: Number(m.membershipFee),
    feeStatus: m.feeStatus,
    feePaidAt: m.feePaidAt ? m.feePaidAt.toISOString() : null,
    feeUpdatedBy: m.feeUpdatedBy ?? "",
    refMemberName: m.refMemberName ?? "",
    refMemberId: m.refMemberId ?? "",
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

export function paymentToApi(
  p: Payment,
  member: Pick<Member, "fullName" | "membershipId">,
) {
  return {
    id: p.id,
    memberId: p.memberId,
    memberName: member.fullName,
    membershipId: member.membershipId,
    month: p.month,
    amountPaid: Number(p.amountPaid),
    paymentMethod: p.paymentMethod,
    receiptNumber: p.receiptNumber,
    notes: p.notes ?? null,
    paidAt: p.paidAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
  };
}

export function currentMonth(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
