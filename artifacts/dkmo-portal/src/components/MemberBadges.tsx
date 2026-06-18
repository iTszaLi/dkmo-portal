import { cn } from "@/lib/utils";
import { COMMITTEE_LEVEL_BADGE, designationBadgeClass } from "@/lib/committee";

export function MemberBadges({
  designation,
  isExecutiveCommittee,
  isCoreCommittee,
  size = "sm",
  className,
}: {
  designation?: string | null;
  isExecutiveCommittee?: boolean | null;
  isCoreCommittee?: boolean | null;
  size?: "sm" | "md";
  className?: string;
}) {
  // Independent badges: the assigned role, Executive Committee, and Core
  // Committee. Each is shown on its own value, but generic designations that
  // merely restate committee membership ("Member", "Executive Member") are
  // never shown as a separate role badge — they would duplicate the committee
  // badges. A single "MEMBER" badge is shown only when a member has no distinct
  // role and belongs to no committee. Order: ROLE | EXECUTIVE COMMITTEE | CORE COMMITTEE.
  const role = (designation ?? "").trim();
  const isExec = isExecutiveCommittee === true;
  const isCore = isCoreCommittee === true;

  // Generic, non-distinctive designations that overlap with committee badges.
  const GENERIC_ROLES = new Set(["member", "executive member"]);
  const hasDistinctRole = role !== "" && !GENERIC_ROLES.has(role.toLowerCase());

  // Fallback so a plain member is never badge-less: Regular Member → MEMBER.
  const showMemberFallback = !hasDistinctRole && !isExec && !isCore;

  const pad =
    size === "md" ? "px-2.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-[10px]";

  const badgeBase =
    "inline-block rounded-full font-semibold uppercase tracking-wide";

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {hasDistinctRole ? (
        <span className={cn(badgeBase, pad, designationBadgeClass(role))}>
          {role}
        </span>
      ) : null}
      {isExec ? (
        <span
          className={cn(badgeBase, pad, COMMITTEE_LEVEL_BADGE.executive.className)}
        >
          {COMMITTEE_LEVEL_BADGE.executive.label}
        </span>
      ) : null}
      {isCore ? (
        <span className={cn(badgeBase, pad, COMMITTEE_LEVEL_BADGE.core.className)}>
          {COMMITTEE_LEVEL_BADGE.core.label}
        </span>
      ) : null}
      {showMemberFallback ? (
        <span className={cn(badgeBase, pad, designationBadgeClass("Member"))}>
          Member
        </span>
      ) : null}
    </div>
  );
}
