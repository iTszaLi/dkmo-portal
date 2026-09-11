import type { Member, Payment } from "@workspace/db";

export function memberToApi(m: Member) {
  const raw = m.legacyRawRecord && typeof m.legacyRawRecord === "object"
    ? (m.legacyRawRecord as Record<string, unknown>)
    : {};
  const migrationStatus = typeof raw.migrationMatchStatus === "string"
    ? raw.migrationMatchStatus
    : "";
  const legacyMembershipFeeRecords = Array.isArray(raw.membershipFeeRecords)
    ? raw.membershipFeeRecords
        .filter((record): record is Record<string, unknown> => Boolean(record) && typeof record === "object")
        .map((record) => ({
          sourceTable: typeof record.source_table === "string" ? record.source_table : "",
          sourceRow: typeof record.source_row === "string" ? record.source_row : "",
          legacyMemberId: typeof record.legacy_member_id === "string" ? record.legacy_member_id : "",
          paymentDate: typeof record.payment_date === "string" ? record.payment_date : "",
          entryDate: typeof record.entry_date === "string" ? record.entry_date : "",
          details: typeof record.details === "string" ? record.details : "",
          amount: typeof record.amount === "string" && record.amount !== "" ? Number(record.amount) : null,
          billNumber: typeof record.bill_number === "string" ? record.bill_number : "",
          remarks: typeof record.remarks === "string" ? record.remarks : "",
          historicalStatus: typeof record.historical_status === "string" ? record.historical_status : "",
          reviewIssue: typeof record.issue === "string" ? record.issue : "",
        }))
    : [];
  const legacyRecordStatus = !m.legacyMemberId
    ? "portal_member"
    : migrationStatus === "NEEDS_REVIEW"
      ? "needs_review"
      : migrationStatus === "POSSIBLE_DUPLICATE"
        ? "possible_duplicate"
        : migrationStatus === "CONFIRMED_DIFFERENT_PERSON"
          ? "confirmed_different_person"
          : migrationStatus === "CONFIRMED_MATCH" || !m.importBatchId
            ? "confirmed_match"
            : "legacy_record";
  // FRF is not an independent membership switch. A paid membership always
  // makes the member FRF-active; every other fee state is FRF-inactive.
  const effectiveFrfStatus = m.feeStatus === "paid" ? "active" : "inactive";
  return {
    id: m.id,
    fullName: m.fullName,
    mobileNumber: m.mobileNumber,
    membershipId: m.membershipId,
    photoUrl: m.photoUrl ?? null,
    applicationNumber: m.applicationNumber ?? "",
    iqamaNumber: m.iqamaNumber ?? "",
    jamaath: m.jamaath ?? "",
    city: m.city,
    country: m.country,
    dateOfBirth: m.dateOfBirth ?? "",
    email: m.email ?? "",
    bloodGroup: m.bloodGroup ?? "",
    address: m.address ?? "",
    designation: m.designation ?? "",
    isExecutiveCommittee: m.isExecutiveCommittee ?? false,
    isCoreCommittee: m.isCoreCommittee ?? false,
    membershipFee: Number(m.membershipFee),
    feeStatus: m.feeStatus,
    feePaidAt: m.feePaidAt ? m.feePaidAt.toISOString() : null,
    feeUpdatedBy: m.feeUpdatedBy ?? "",
    frfStatus: effectiveFrfStatus,
    responsibility: m.responsibility ?? "not_responsible",
    notes: m.notes ?? "",
    refMemberName: m.refMemberName ?? "",
    refMemberId: m.refMemberId ?? "",
    // Legacy-import fields
    legacyMemberId: m.legacyMemberId ?? "",
    legacyRecordStatus,
    legacyImportBatchId: m.importBatchId ?? null,
    oldApplicationNumber: m.oldApplicationNumber ?? "",
    whatsappNumber: m.whatsappNumber ?? "",
    passportNumber: m.passportNumber ?? "",
    nativePlace: m.nativePlace ?? "",
    memberGroup: m.memberGroup ?? "",
    homeContactNumber: m.homeContactNumber ?? "",
    legacyReferenceCode: m.legacyReferenceCode ?? "",
    legacyReferenceName: m.legacyReferenceName ?? "",
    legacyMembershipFeeRecords,
    ppName: m.ppName ?? "",
    maritalStatus: m.maritalStatus ?? "",
    familyStatus: m.familyStatus ?? "",
    dependents: m.dependents ?? "",
    telephone: m.telephone ?? "",
    company: m.company ?? "",
    membershipDate: m.membershipDate ?? "",
    legacyEntryDate: m.legacyEntryDate ?? "",
    district: m.district ?? "",
    legacyMemberStatus: m.legacyMemberStatus ?? "",
    referredBy: m.referredBy ?? "",
    availContribution: m.availContribution ?? "",
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
    paymentType: p.paymentType,
    frfClaimId: p.frfClaimId ?? null,
    amountDue: Number(p.amountDue),
    amountPaid: Number(p.amountPaid),
    status: p.status,
    paymentMethod: p.paymentMethod,
    receiptNumber: p.receiptNumber,
    notes: p.notes ?? null,
    dueDate: p.dueDate ? p.dueDate.toISOString() : null,
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
