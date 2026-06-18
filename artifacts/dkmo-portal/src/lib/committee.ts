import {
  Crown,
  Briefcase,
  Banknote,
  Globe,
  Star,
  Eye,
  ShieldCheck,
  Calendar,
  Users,
  HeartHandshake,
  type LucideIcon,
} from "lucide-react";

/**
 * Badge styling for the two committee memberships. Executive renders as a shiny
 * gold pill, Core as a shiny silver pill. The two are fully independent — a
 * member may have either, both, or neither.
 */
export const COMMITTEE_LEVEL_BADGE: Record<
  "core" | "executive",
  { label: string; className: string }
> = {
  executive: {
    label: "Executive Committee",
    className:
      "bg-gradient-to-b from-amber-200 to-yellow-400 text-yellow-950 ring-1 ring-yellow-500/60 shadow-sm dark:from-amber-300 dark:to-yellow-500 dark:text-yellow-950",
  },
  core: {
    label: "Core Committee",
    className:
      "bg-gradient-to-b from-slate-100 to-slate-300 text-slate-800 ring-1 ring-slate-400/60 shadow-sm dark:from-slate-200 dark:to-slate-400 dark:text-slate-900",
  },
};

/**
 * One fixed colour per designation so a role looks identical everywhere it
 * appears (e.g. every "Auditor" badge is the same colour). Unknown / custom
 * designations fall back to a deterministic colour from the palette so they are
 * still stable across the app.
 */
const DESIGNATION_BADGE: Record<string, string> = {
  President: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  "Vice President": "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
  "General Secretary": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  "Joint Secretary": "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  Treasurer: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "Overseas Convenor": "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  Advisor: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  "Loan Convenor": "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  "Loan Convenor (Recovery)": "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  Auditor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "Verification Team Leader": "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300",
  "Event Organizer": "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  "Employment Scheme": "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
  "FRF Convenor": "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  "Executive Member": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  Member: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const DESIGNATION_PALETTE = [
  "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
];

export function designationBadgeClass(designation: string): string {
  const d = (designation ?? "").trim();
  if (DESIGNATION_BADGE[d]) return DESIGNATION_BADGE[d];
  let hash = 0;
  for (let i = 0; i < d.length; i++) hash = (hash * 31 + d.charCodeAt(i)) >>> 0;
  return DESIGNATION_PALETTE[hash % DESIGNATION_PALETTE.length];
}

/**
 * Maps a designation to its committee department, used to group cards on the
 * Committee page now that the roster is database-driven.
 */
const DESIGNATION_DEPARTMENT: Record<string, string> = {
  President: "Executive",
  "Vice President": "Executive",
  "General Secretary": "Executive",
  "Joint Secretary": "Executive",
  Treasurer: "Finance",
  "Overseas Convenor": "Overseas",
  Advisor: "Advisory",
  "Loan Convenor": "Finance",
  "Loan Convenor (Recovery)": "Finance",
  Auditor: "Finance",
  "Verification Team Leader": "Operations",
  "Event Organizer": "Events",
  "Event organizer": "Events",
  "Employment Scheme": "Welfare",
  "FRF Convenor": "FRF",
  "Executive Member": "Executive",
};

export function departmentForDesignation(designation: string): string {
  return DESIGNATION_DEPARTMENT[(designation ?? "").trim()] ?? "General";
}

export const DEPARTMENT_ICON: Record<string, LucideIcon> = {
  Executive: Crown,
  Finance: Banknote,
  Advisory: Star,
  Overseas: Globe,
  Events: Calendar,
  Welfare: Users,
  FRF: HeartHandshake,
  Operations: ShieldCheck,
  General: Briefcase,
};

export function departmentIconFor(department: string): LucideIcon {
  return DEPARTMENT_ICON[department] ?? Briefcase;
}

export const DEPARTMENT_COLOR: Record<string, string> = {
  Executive: "text-yellow-700 dark:text-yellow-400",
  Finance: "text-blue-700 dark:text-blue-400",
  Advisory: "text-purple-700 dark:text-purple-400",
  Overseas: "text-teal-700 dark:text-teal-400",
  Events: "text-orange-700 dark:text-orange-400",
  Welfare: "text-rose-700 dark:text-rose-400",
  FRF: "text-red-700 dark:text-red-400",
  Operations: "text-cyan-700 dark:text-cyan-400",
  General: "text-green-700 dark:text-green-400",
};

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
