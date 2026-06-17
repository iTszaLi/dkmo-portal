import { useMemo } from "react";
import { Link } from "wouter";
import {
  useGetDashboardSummary,
  useGetDashboardFinancialSummary,
  useGetDashboardCashFlow,
  useListMembers,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatSAR, getCurrentMonth } from "@/lib/utils";
import {
  Users,
  UserCheck,
  HeartHandshake,
  TrendingUp,
  CalendarRange,
  Trophy,
  ArrowRight,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const currentMonth = getCurrentMonth();

  const today = new Date();
  const fullDateLabel = today.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const todayYear = today.getFullYear();
  const todayQuarter = Math.floor(today.getMonth() / 3) + 1;

  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: financialSummary } = useGetDashboardFinancialSummary({ month: currentMonth });
  const { data: cashFlow } = useGetDashboardCashFlow({ year: todayYear, quarter: todayQuarter });
  const { data: members, isLoading: isLoadingMembers } = useListMembers();

  // Top 5 Recruiters — computed from real member referral records.
  const topRecruiters = useMemo(() => {
    const totals = new Map<
      string,
      { memberId: string; name: string; membershipId: string; recruits: number }
    >();
    for (const mem of members || []) {
      totals.set(mem.id, {
        memberId: mem.id,
        name: mem.fullName,
        membershipId: mem.membershipId,
        recruits: 0,
      });
    }
    for (const mem of members || []) {
      if (mem.refMemberId && totals.has(mem.refMemberId)) {
        totals.get(mem.refMemberId)!.recruits += 1;
      }
    }
    return Array.from(totals.values())
      .filter((t) => t.recruits > 0)
      .sort((a, b) => b.recruits - a.recruits)
      .slice(0, 5);
  }, [members]);

  const monthlyCollection = financialSummary?.members.collectedThisMonth ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-green-950 dark:text-green-100">Dashboard</h1>
          <p className="text-sm text-green-800/70 dark:text-slate-400 mt-1">DKMO — Committed to the community</p>
        </div>
        <div
          className="text-sm text-green-900 dark:text-green-300 bg-green-50 dark:bg-slate-800 border border-green-100 dark:border-slate-700 px-3.5 py-1.5 rounded-full font-medium inline-flex items-center gap-2"
          data-testid="text-current-date"
        >
          <CalendarRange className="h-4 w-4 text-green-700 dark:text-green-400" />
          <span>{fullDateLabel}</span>
        </div>
      </div>

      {/* KPI Cards — only the metrics that matter */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/members" className="block group" data-testid="link-summary-members">
          <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm transition-all duration-200 ease-in-out group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:border-green-300 dark:group-hover:border-green-700 group-active:scale-[0.98] cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-900 dark:text-slate-300">Total Members</CardTitle>
              <Users className="h-4 w-4 text-green-700 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-green-950 dark:text-white">{summary?.totalMembers || 0}</div>
              )}
              <p className="text-xs text-green-700/80 dark:text-slate-500 mt-1">Registered members</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/members" className="block group" data-testid="link-summary-active">
          <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm transition-all duration-200 ease-in-out group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:border-green-300 dark:group-hover:border-green-700 group-active:scale-[0.98] cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-900 dark:text-slate-300">Active Members</CardTitle>
              <UserCheck className="h-4 w-4 text-green-700 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-green-950 dark:text-white">{summary?.paidMembersCount || 0}</div>
              )}
              <p className="text-xs text-green-700/80 dark:text-slate-500 mt-1">Membership fee paid</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/frf" className="block group" data-testid="link-summary-frf-claims">
          <Card className="rounded-2xl border-orange-100 dark:border-orange-900/40 dark:bg-slate-900 shadow-sm transition-all duration-200 ease-in-out group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:border-orange-300 group-active:scale-[0.98] cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-orange-900 dark:text-orange-300">Pending FRF Claims</CardTitle>
              <HeartHandshake className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </CardHeader>
            <CardContent>
              {cashFlow == null ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{cashFlow.pendingClaimsCount ?? 0}</div>
              )}
              <p className="text-xs text-orange-700/80 dark:text-orange-500/80 mt-1">Awaiting review</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/payments" className="block group" data-testid="link-summary-monthly">
          <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm transition-all duration-200 ease-in-out group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:border-green-300 dark:group-hover:border-green-700 group-active:scale-[0.98] cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-900 dark:text-slate-300">Monthly Collections</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-700 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              {financialSummary == null ? (
                <Skeleton className="h-8 w-28" />
              ) : (
                <div className="text-2xl font-bold text-green-950 dark:text-green-300">{formatSAR(monthlyCollection)}</div>
              )}
              <p className="text-xs text-green-700/80 dark:text-slate-500 mt-1">Collected this month</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Top 5 Recruiters — real referral records */}
      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              Top 5 Recruiters
            </CardTitle>
            <CardDescription className="dark:text-slate-400">Members who referred the most new members</CardDescription>
          </div>
          <Link
            href="/recruitment-leaderboard"
            className="text-sm text-green-800 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 font-medium inline-flex items-center gap-1"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {isLoadingMembers ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : topRecruiters.length === 0 ? (
            <p className="text-sm text-green-700/70 dark:text-slate-500 py-6 text-center">
              No referral records yet. Recruiter rankings will appear here once members refer others.
            </p>
          ) : (
            <ol className="space-y-2">
              {topRecruiters.map((r, i) => (
                <li key={r.memberId}>
                  <Link
                    href={`/members/${r.memberId}`}
                    className="flex items-center gap-3 rounded-xl border border-green-100 dark:border-slate-800 bg-green-50/40 dark:bg-slate-800/40 px-3 py-2.5 transition-colors hover:bg-green-50 dark:hover:bg-slate-800"
                    data-testid={`recruiter-${i + 1}`}
                  >
                    <span
                      className={
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold " +
                        (i === 0
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                          : i === 1
                            ? "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                            : i === 2
                              ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400"
                              : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400")
                      }
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-green-950 dark:text-green-100 truncate">{r.name}</p>
                      <p className="text-xs text-green-700/70 dark:text-slate-500 truncate">{r.membershipId}</p>
                    </div>
                    <span className="text-sm font-bold text-green-800 dark:text-green-300 tabular-nums">
                      {r.recruits} {r.recruits === 1 ? "recruit" : "recruits"}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
