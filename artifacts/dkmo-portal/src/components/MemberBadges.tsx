import { cn } from "@/lib/utils";
import {
  COMMITTEE_LEVEL_BADGE,
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
  const des = (designation ?? "").trim();
  const levelBadge = level !== "regular" ? COMMITTEE_LEVEL_BADGE[level] : null;

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
