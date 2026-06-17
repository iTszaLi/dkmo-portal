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
  // Committee tiers are nested: an Executive member is also part of the Core
  // committee, so they earn both tier badges. Order: Executive (gold) then
  // Core Committee (silver).
  const tiers: ("executive" | "core")[] =
    level === "executive"
      ? ["executive", "core"]
      : level === "core"
        ? ["core"]
        : [];
  // Hide the designation ("main role") badge when it merely restates a tier the
  // member already shows (e.g. designation "Executive Member" + executive tier).
  // Real roles like "President" still render alongside the tier badges.
  const redundant = tiers.some(
    (t) => rawDes.toLowerCase() === COMMITTEE_LEVEL_LABEL[t].toLowerCase(),
  );
  const des = redundant ? "" : rawDes;

  if (tiers.length === 0 && !des) return null;

  const pad =
    size === "md" ? "px-2.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-[10px]";

  const badgeBase =
    "inline-block rounded-full font-semibold uppercase tracking-wide";

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {des ? (
        <span className={cn(badgeBase, pad, designationBadgeClass(des))}>
          {des}
        </span>
      ) : null}
      {tiers.map((tier) => (
        <span
          key={tier}
          className={cn(badgeBase, pad, COMMITTEE_LEVEL_BADGE[tier].className)}
        >
          {COMMITTEE_LEVEL_BADGE[tier].label}
        </span>
      ))}
    </div>
  );
}
