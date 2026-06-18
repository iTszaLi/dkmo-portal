import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useListMembers } from "@workspace/api-client-react";
import {
  COMMITTEE_LEVEL_BADGE,
  DEPARTMENT_COLOR,
  departmentForDesignation,
  departmentIconFor,
  initialsOf,
} from "@/lib/committee";
import { Crown, Users, Briefcase, Award, Search } from "lucide-react";

interface CommitteeView {
  id: string;
  name: string;
  role: string;
  department: string;
  isExecutiveCommittee: boolean;
  isCoreCommittee: boolean;
}

const FELICITATED = [
  {
    name: "Ghani Ahmed Mulki",
    reason: "Outstanding contribution to DKMO's Loan Convenor role and community welfare initiatives spanning over a decade.",
    year: "2025",
    role: "Loan Convenor",
    icon: Award,
    color: "text-yellow-600 dark:text-yellow-400",
    bg: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900/40",
  },
  {
    name: "Ashraf Kozhikan",
    reason: "Exceptional dedication to organizing DKMO community events, AGBM meetings, and cultural programs in Riyadh.",
    year: "2025",
    role: "Event Organizer",
    icon: Award,
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900/40",
  },
  {
    name: "Shamsuddin Addoor",
    reason: "Tireless work in loan recovery, ensuring DKMO's financial sustainability while maintaining community trust.",
    year: "2025",
    role: "Loan Convenor (Recovery)",
    icon: Award,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/40",
  },
];

const LEVEL_STYLE: Record<"core" | "executive", string> = {
  executive: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900/40",
  core: "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700",
};

export default function Committee() {
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const { data: allMembers, isLoading } = useListMembers();

  const committee = useMemo<CommitteeView[]>(() => {
    const rows = (allMembers ?? []).filter(
      (m) =>
        (m as any).isExecutiveCommittee === true ||
        (m as any).isCoreCommittee === true,
    );
    return rows.map((m) => {
      const role = (m as any).designation || "Committee Member";
      return {
        id: m.id,
        name: m.fullName,
        role,
        department: departmentForDesignation(role),
        isExecutiveCommittee: (m as any).isExecutiveCommittee === true,
        isCoreCommittee: (m as any).isCoreCommittee === true,
      };
    });
  }, [allMembers]);

  const departments = useMemo(
    () => [...new Set(committee.map((m) => m.department))].sort(),
    [committee],
  );
  const deptCounts = useMemo(
    () =>
      Object.fromEntries(
        departments.map((d) => [d, committee.filter((m) => m.department === d).length]),
      ),
    [departments, committee],
  );

  const filtered = committee.filter((m) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.role.toLowerCase().includes(q) ||
      m.department.toLowerCase().includes(q);
    const matchesDept = deptFilter === "all" || m.department === deptFilter;
    return matchesSearch && matchesDept;
  });

  const executive = filtered.filter((m) => m.isExecutiveCommittee);
  const core = filtered.filter((m) => m.isCoreCommittee);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-green-950 dark:text-green-100">
            DKMO Committee
          </h1>
          <p className="text-green-800/70 dark:text-slate-400 mt-1">
            Live committee structure · Dakshina Karnataka Muslim Okkoota, Riyadh
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="text-sm text-green-900 dark:text-green-300 bg-green-50 dark:bg-slate-800 border border-green-100 dark:border-slate-700 px-3.5 py-1.5 rounded-full font-medium inline-flex items-center gap-2">
            <Users className="h-4 w-4 text-green-700 dark:text-green-400" />
            {committee.length} committee member{committee.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-400 dark:text-slate-500" />
          <Input
            placeholder="Search member, position, or department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 border-green-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500"
          />
        </div>
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="h-10 rounded-md border border-green-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-green-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-green-500/30"
        >
          <option value="all">All Departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : committee.length === 0 ? (
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardContent className="py-16 text-center text-green-700/70 dark:text-slate-500">
            No committee members yet. Promote members to Core or Executive from the Members page.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Department breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {departments.map((dept) => {
              const Icon = departmentIconFor(dept);
              return (
                <div key={dept} className="text-center p-2 rounded-xl bg-white dark:bg-slate-900 border border-green-100 dark:border-slate-800 shadow-sm">
                  <Icon className={cn("h-5 w-5 mx-auto mb-1", DEPARTMENT_COLOR[dept] ?? "text-green-600 dark:text-green-400")} />
                  <p className="text-xs font-semibold text-green-900 dark:text-slate-200">{deptCounts[dept]}</p>
                  <p className="text-[10px] text-green-700/70 dark:text-slate-500 leading-tight">{dept}</p>
                </div>
              );
            })}
          </div>

          {/* Executive Members */}
          <section>
            <h2 className="text-lg font-bold text-green-950 dark:text-green-200 mb-3 flex items-center gap-2">
              <Crown className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              Executive Members
              <span className="text-sm font-normal text-green-700/60 dark:text-slate-500">({executive.length})</span>
            </h2>
            {executive.length === 0 ? (
              <p className="text-sm text-green-700/60 dark:text-slate-500">No executive members match the current filter.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {executive.map((m) => (
                  <MemberCard key={m.id} member={m} level="executive" />
                ))}
              </div>
            )}
          </section>

          {/* Core Committee */}
          <section>
            <h2 className="text-lg font-bold text-green-950 dark:text-green-200 mb-3 flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-green-600 dark:text-green-400" />
              Core Committee
              <span className="text-sm font-normal text-green-700/60 dark:text-slate-500">({core.length})</span>
            </h2>
            {core.length === 0 ? (
              <p className="text-sm text-green-700/60 dark:text-slate-500">No core committee members match the current filter.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {core.map((m) => (
                  <MemberCard key={m.id} member={m} level="core" />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Felicitation Section */}
      <Card className="rounded-2xl border-amber-100 dark:border-amber-900/30 dark:bg-slate-900 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-amber-900 dark:text-amber-300 flex items-center gap-2">
            <Award className="h-5 w-5 text-amber-500" />
            Felicitation — Recognized Members 2025
          </CardTitle>
          <CardDescription className="dark:text-slate-400">
            Honoring outstanding contributions to the DKMO community
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {FELICITATED.map((f) => (
            <div key={f.name} className={cn("rounded-xl border p-4 space-y-3", f.bg)}>
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-white dark:bg-slate-800 border border-white/60 dark:border-slate-700 flex items-center justify-center shrink-0 text-sm font-bold text-green-800 dark:text-green-300">
                  {initialsOf(f.name)}
                </div>
                <div>
                  <p className="font-semibold text-green-950 dark:text-slate-200 text-sm leading-snug">{f.name}</p>
                  <p className="text-xs text-green-700/70 dark:text-slate-400">{f.role}</p>
                </div>
              </div>
              <p className="text-xs text-green-800/80 dark:text-slate-300 leading-relaxed">{f.reason}</p>
              <div className="flex items-center gap-2">
                <f.icon className={cn("h-4 w-4", f.color)} />
                <span className={cn("text-xs font-semibold", f.color)}>Felicitated {f.year}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function MemberCard({
  member,
  level,
}: {
  member: CommitteeView;
  level: "core" | "executive";
}) {
  const Icon = departmentIconFor(member.department);
  const levelBadge = COMMITTEE_LEVEL_BADGE[level];
  return (
    <div className={cn(
      "rounded-xl border p-4 transition-shadow hover:shadow-md dark:hover:shadow-black/20",
      LEVEL_STYLE[level],
    )}>
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-white dark:bg-slate-800 border border-green-100 dark:border-slate-700 flex items-center justify-center shrink-0 font-bold text-green-800 dark:text-green-300 h-11 w-11 text-sm">
          {initialsOf(member.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-green-950 dark:text-slate-100 leading-snug text-base">
            {member.name}
          </p>
          <p className="text-green-700/80 dark:text-slate-400 mt-0.5 leading-snug text-sm">
            {member.role}
          </p>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <Badge className={cn("text-[10px] uppercase tracking-wider px-2 py-0 border-0", levelBadge.className)}>
              {levelBadge.label}
            </Badge>
            <span className={cn("flex items-center gap-1 text-[10px] font-medium", DEPARTMENT_COLOR[member.department] ?? "text-green-700 dark:text-green-400")}>
              <Icon className="h-3 w-3" />
              {member.department}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
