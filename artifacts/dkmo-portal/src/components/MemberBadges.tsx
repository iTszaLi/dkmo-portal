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
  // Three fully independent badges: the assigned role, Executive Committee, and
  // Core Committee. Each is shown purely on its own value — there are no hidden
  // links between them. Order: ROLE | EXECUTIVE COMMITTEE | CORE COMMITTEE.
  const role = (designation ?? "").trim();
  const isExec = isExecutiveCommittee === true;
  const isCore = isCoreCommittee === true;

  if (!role && !isExec && !isCore) return null;

  const pad =
    size === "md" ? "px-2.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-[10px]";

  const badgeBase =
    "inline-block rounded-full font-semibold uppercase tracking-wide";

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {role ? (
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
    </div>
  );
}
