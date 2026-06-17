import { cn } from "@/lib/utils";
import {
  COMMITTEE_LEVEL_BADGE,
  COMMITTEE_LEVEL_LABEL,
  designationBadgeClass,
  normalizeCommitteeLevel,
} from "@/lib/committee";

export function MemberBadges({
  committeeLevel,
  designation,
  size = "sm",
  className,
}: {
  committeeLevel?: string | null;
  designation?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const level = normalizeCommitteeLevel(committeeLevel);
  const rawDes = (designation ?? "").trim();
  const levelBadge = level !== "regular" ? COMMITTEE_LEVEL_BADGE[level] : null;
  // Hide the designation badge when it merely restates the committee level
  // (e.g. level "executive" + designation "Executive Member"). Real roles
  // like "President" still render alongside the level badge.
  const redundant =
    rawDes.toLowerCase() === COMMITTEE_LEVEL_LABEL[level].toLowerCase();
  const des = redundant ? "" : rawDes;

  if (!levelBadge && !des) return null;

  const pad =
    size === "md" ? "px-2.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-[10px]";

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {levelBadge ? (
        <span
          className={cn(
            "inline-block rounded-full font-semibold uppercase tracking-wide",
            pad,
            levelBadge.className,
          )}
        >
          {levelBadge.label}
        </span>
      ) : null}
      {des ? (
        <span
          className={cn(
            "inline-block rounded-full font-semibold uppercase tracking-wide",
            pad,
            designationBadgeClass(des),
          )}
        >
          {des}
        </span>
      ) : null}
    </div>
  );
}
