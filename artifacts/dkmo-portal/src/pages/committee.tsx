import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Crown,
  Users,
  Briefcase,
  HeartHandshake,
  Calendar,
  Banknote,
  Eye,
  ShieldCheck,
  Star,
  Globe,
  Award,
  Search,
} from "lucide-react";

interface CommitteeMember {
  id: number;
  name: string;
  role: string;
  department: string;
  departmentIcon: typeof Crown;
  tier: "executive" | "convenor" | "member";
}

const COMMITTEE_2026_27: CommitteeMember[] = [
  { id: 1,  name: "Fazlurrahman Kolkar",       role: "President",                   department: "Executive",      departmentIcon: Crown,         tier: "executive" },
  { id: 2,  name: "Asif Kannur",               role: "Vice President",              department: "Executive",      departmentIcon: Crown,         tier: "executive" },
  { id: 3,  name: "Irshad Bajpe",              role: "General Secretary",           department: "Executive",      departmentIcon: Briefcase,     tier: "executive" },
  { id: 4,  name: "Abdul Rahiman Sulaiman",    role: "Treasurer",                   department: "Finance",        departmentIcon: Banknote,      tier: "executive" },
  { id: 5,  name: "Sameen Khan Ummer",         role: "Joint Secretary",             department: "Executive",      departmentIcon: Briefcase,     tier: "executive" },
  { id: 6,  name: "Abdul Azeez Bajpe",         role: "Overseas Convenor",           department: "Overseas",       departmentIcon: Globe,         tier: "convenor" },
  { id: 7,  name: "Salman Noor",               role: "Advisor",                     department: "Advisory",       departmentIcon: Star,          tier: "convenor" },
  { id: 8,  name: "G K Shaikh",               role: "Advisor",                     department: "Advisory",       departmentIcon: Star,          tier: "convenor" },
  { id: 9,  name: "Haneef B K",               role: "Advisor",                     department: "Advisory",       departmentIcon: Star,          tier: "convenor" },
  { id: 10, name: "Ghani Ahmed Mulki",         role: "Loan Convenor",               department: "Finance",        departmentIcon: Banknote,      tier: "convenor" },
  { id: 11, name: "Shamsuddin Addoor",         role: "Loan Convenor (Recovery)",    department: "Finance",        departmentIcon: Banknote,      tier: "convenor" },
  { id: 12, name: "Yousuf Addoor",             role: "Auditor",                     department: "Finance",        departmentIcon: Eye,           tier: "convenor" },
  { id: 13, name: "Irfan Shaikh",              role: "Verification Team Leader",    department: "Operations",     departmentIcon: ShieldCheck,   tier: "convenor" },
  { id: 14, name: "Ashraf Kozhikan",           role: "Event Organizer",             department: "Events",         departmentIcon: Calendar,      tier: "convenor" },
  { id: 15, name: "Shareef Thokur",            role: "Event Organizer",             department: "Events",         departmentIcon: Calendar,      tier: "convenor" },
  { id: 16, name: "Hameed Nazeer",             role: "Event Organizer",             department: "Events",         departmentIcon: Calendar,      tier: "convenor" },
  { id: 17, name: "Nazeer Hassan",             role: "Event Organizer",             department: "Events",         departmentIcon: Calendar,      tier: "convenor" },
  { id: 18, name: "Sadiq Ahmed Udupi",         role: "Employment Scheme",           department: "Welfare",        departmentIcon: Users,         tier: "convenor" },
  { id: 19, name: "Akhil Ganjimutt",           role: "Employment Scheme",           department: "Welfare",        departmentIcon: Users,         tier: "convenor" },
  { id: 20, name: "Ashraf Sheikh Koteshwar",   role: "FRF Convenor",                department: "FRF",            departmentIcon: HeartHandshake, tier: "convenor" },
  { id: 21, name: "Mohammed Haris Byndoor",    role: "FRF Convenor",                department: "FRF",            departmentIcon: HeartHandshake, tier: "convenor" },
  { id: 22, name: "Haneef N S",               role: "Executive Member",            department: "Executive",      departmentIcon: Users,         tier: "member" },
  { id: 23, name: "Zia Ganjimutt",             role: "Executive Member",            department: "Executive",      departmentIcon: Users,         tier: "member" },
  { id: 24, name: "Razik Bajpe",               role: "Executive Member",            department: "Executive",      departmentIcon: Users,         tier: "member" },
  { id: 25, name: "Yousuf Kalanjibail",        role: "Executive Member",            department: "Executive",      departmentIcon: Users,         tier: "member" },
  { id: 26, name: "Shaul Hameed",              role: "Executive Member",            department: "Executive",      departmentIcon: Users,         tier: "member" },
  { id: 27, name: "Nayaz Ahmed",               role: "Executive Member",            department: "Executive",      departmentIcon: Users,         tier: "member" },
  { id: 28, name: "Abdul Majeed Vittal",       role: "Executive Member",            department: "Executive",      departmentIcon: Users,         tier: "member" },
  { id: 29, name: "Rafee Hameed Uchchila",     role: "Executive Member",            department: "Executive",      departmentIcon: Users,         tier: "member" },
];

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

const TIER_STYLE: Record<CommitteeMember["tier"], string> = {
  executive: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900/40",
  convenor:  "bg-green-50  dark:bg-green-950/20  border-green-200  dark:border-green-900/30",
  member:    "bg-slate-50  dark:bg-slate-800/50  border-slate-200  dark:border-slate-700",
};

const TIER_BADGE: Record<CommitteeMember["tier"], string> = {
  executive: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-900 dark:text-yellow-300 ring-1 ring-yellow-300 dark:ring-yellow-700/50",
  convenor:  "bg-green-100  dark:bg-green-900/40  text-green-900  dark:text-green-300  ring-1 ring-green-300  dark:ring-green-700/50",
  member:    "bg-slate-100  dark:bg-slate-700      text-slate-800  dark:text-slate-300  ring-1 ring-slate-300  dark:ring-slate-600",
};

const DEPT_COLOR: Record<string, string> = {
  Executive:  "text-yellow-700 dark:text-yellow-400",
  Finance:    "text-blue-700 dark:text-blue-400",
  Advisory:   "text-purple-700 dark:text-purple-400",
  Overseas:   "text-teal-700 dark:text-teal-400",
  Events:     "text-orange-700 dark:text-orange-400",
  Welfare:    "text-rose-700 dark:text-rose-400",
  FRF:        "text-red-700 dark:text-red-400",
  Operations: "text-cyan-700 dark:text-cyan-400",
};

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export default function Committee() {
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");

  const departments = [...new Set(COMMITTEE_2026_27.map((m) => m.department))];
  const deptCounts = Object.fromEntries(
    departments.map((d) => [d, COMMITTEE_2026_27.filter((m) => m.department === d).length])
  );

  const filtered = COMMITTEE_2026_27.filter((m) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q) || m.department.toLowerCase().includes(q);
    const matchesDept = deptFilter === "all" || m.department === deptFilter;
    return matchesSearch && matchesDept;
  });

  const executive = filtered.filter((m) => m.tier === "executive");
  const convenors = filtered.filter((m) => m.tier === "convenor");
  const members   = filtered.filter((m) => m.tier === "member");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-green-950 dark:text-green-100">
            DKMO Committee
          </h1>
          <p className="text-green-800/70 dark:text-slate-400 mt-1">
            Official 2026–27 committee structure · Dakshina Karnataka Muslim Okkoota, Riyadh
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="text-sm text-green-900 dark:text-green-300 bg-green-50 dark:bg-slate-800 border border-green-100 dark:border-slate-700 px-3.5 py-1.5 rounded-full font-medium inline-flex items-center gap-2">
            <Users className="h-4 w-4 text-green-700 dark:text-green-400" />
            {COMMITTEE_2026_27.length} members · Term 2026–27
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

      {/* Department breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {departments.map((dept) => {
          const Icon = COMMITTEE_2026_27.find((m) => m.department === dept)?.departmentIcon ?? Users;
          return (
            <div key={dept} className="text-center p-2 rounded-xl bg-white dark:bg-slate-900 border border-green-100 dark:border-slate-800 shadow-sm">
              <Icon className={cn("h-5 w-5 mx-auto mb-1", DEPT_COLOR[dept] ?? "text-green-600 dark:text-green-400")} />
              <p className="text-xs font-semibold text-green-900 dark:text-slate-200">{deptCounts[dept]}</p>
              <p className="text-[10px] text-green-700/70 dark:text-slate-500 leading-tight">{dept}</p>
            </div>
          );
        })}
      </div>

      {/* Executive Committee */}
      <section>
        <h2 className="text-lg font-bold text-green-950 dark:text-green-200 mb-3 flex items-center gap-2">
          <Crown className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
          Executive Committee
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {executive.map((m) => (
            <MemberCard key={m.id} member={m} />
          ))}
        </div>
      </section>

      {/* Convenors & Leads */}
      <section>
        <h2 className="text-lg font-bold text-green-950 dark:text-green-200 mb-3 flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-green-600 dark:text-green-400" />
          Convenors & Department Leads
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {convenors.map((m) => (
            <MemberCard key={m.id} member={m} />
          ))}
        </div>
      </section>

      {/* Executive Members */}
      <section>
        <h2 className="text-lg font-bold text-green-950 dark:text-green-200 mb-3 flex items-center gap-2">
          <Users className="h-5 w-5 text-slate-500 dark:text-slate-400" />
          Executive Members
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {members.map((m) => (
            <MemberCard key={m.id} member={m} compact />
          ))}
        </div>
      </section>

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

function MemberCard({ member, compact = false }: { member: CommitteeMember; compact?: boolean }) {
  const Icon = member.departmentIcon;
  return (
    <div className={cn(
      "rounded-xl border p-4 transition-shadow hover:shadow-md dark:hover:shadow-black/20",
      TIER_STYLE[member.tier],
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          "rounded-full bg-white dark:bg-slate-800 border flex items-center justify-center shrink-0 font-bold text-green-800 dark:text-green-300",
          compact ? "h-9 w-9 text-xs border-slate-200 dark:border-slate-700" : "h-11 w-11 text-sm border-green-100 dark:border-slate-700"
        )}>
          {initialsOf(member.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("font-semibold text-green-950 dark:text-slate-100 leading-snug", compact ? "text-sm" : "text-base")}>
            {member.name}
          </p>
          <p className={cn("text-green-700/80 dark:text-slate-400 mt-0.5 leading-snug", compact ? "text-xs" : "text-sm")}>
            {member.role}
          </p>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <Badge className={cn("text-[10px] uppercase tracking-wider px-2 py-0", TIER_BADGE[member.tier])}>
              {member.tier === "executive" ? "Executive" : member.tier === "convenor" ? "Convenor" : "Member"}
            </Badge>
            <span className={cn("flex items-center gap-1 text-[10px] font-medium", DEPT_COLOR[member.department] ?? "text-green-700 dark:text-green-400")}>
              <Icon className="h-3 w-3" />
              {member.department}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
