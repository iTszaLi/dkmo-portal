import { Trophy, Crown, ShieldCheck, Star, HeartHandshake, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type AchievementKey =
  | "topRecruiter"
  | "executive"
  | "core"
  | "advisor"
  | "volunteer";

const ACHIEVEMENTS: Record<
  AchievementKey,
  { label: string; icon: LucideIcon; className: string }
> = {
  topRecruiter: {
    label: "Top Recruiter",
    icon: Trophy,
    className:
      "bg-gradient-to-b from-amber-200 to-yellow-400 text-yellow-950 ring-1 ring-yellow-500/60",
  },
  executive: {
    label: "Executive Member",
    icon: Crown,
    className:
      "bg-gradient-to-b from-rose-200 to-rose-400 text-rose-950 ring-1 ring-rose-500/50",
  },
  core: {
    label: "Core Committee",
    icon: ShieldCheck,
    className:
      "bg-gradient-to-b from-slate-100 to-slate-300 text-slate-800 ring-1 ring-slate-400/60",
  },
  advisor: {
    label: "Advisor",
    icon: Star,
    className:
      "bg-gradient-to-b from-purple-200 to-purple-400 text-purple-950 ring-1 ring-purple-500/50",
  },
  volunteer: {
    label: "Volunteer",
    icon: HeartHandshake,
    className:
      "bg-gradient-to-b from-teal-200 to-teal-400 text-teal-950 ring-1 ring-teal-500/50",
  },
};

/** Computes which achievement badges a member has earned from real data. */
export function achievementsFor(member: {
  designation?: string | null;
  isExecutiveCommittee?: boolean | null;
  isCoreCommittee?: boolean | null;
}, opts?: { isTopRecruiter?: boolean }): AchievementKey[] {
  const earned: AchievementKey[] = [];
  if (opts?.isTopRecruiter) earned.push("topRecruiter");
  if (member.isExecutiveCommittee) earned.push("executive");
  if (member.isCoreCommittee) earned.push("core");
  const role = (member.designation ?? "").trim().toLowerCase();
  if (role === "advisor") earned.push("advisor");
  if (role === "volunteer") earned.push("volunteer");
  return earned;
}

export function AchievementBadges({
  keys,
  size = "sm",
  className,
}: {
  keys: AchievementKey[];
  size?: "sm" | "md";
  className?: string;
}) {
  if (keys.length === 0) return null;
  const pad = size === "md" ? "px-2.5 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]";
  const iconSize = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {keys.map((k) => {
        const a = ACHIEVEMENTS[k];
        const Icon = a.icon;
        return (
          <span
            key={k}
            className={cn(
              "inline-flex items-center gap-1 rounded-full font-semibold uppercase tracking-wide shadow-sm",
              pad,
              a.className,
            )}
            data-testid={`achievement-${k}`}
          >
            <Icon className={iconSize} />
            {a.label}
          </span>
        );
      })}
    </div>
  );
}

/** A static legend of all available achievement badges. */
export function AchievementLegend({ className }: { className?: string }) {
  return (
    <AchievementBadges
      keys={["topRecruiter", "executive", "core", "advisor", "volunteer"]}
      className={className}
    />
  );
}
