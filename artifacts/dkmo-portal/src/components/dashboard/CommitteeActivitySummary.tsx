import { useMemo } from "react";
import { Link } from "wouter";
import { useGetCommitteePerformance, useListMembers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSAR } from "@/lib/utils";
import { initialsOf } from "@/lib/committee";
import { MemberAvatar } from "@/components/MemberAvatar";
import { Activity, ArrowRight, Coins, HeartHandshake, Landmark, Trophy, UserPlus } from "lucide-react";

/**
 * Compact committee activity section for the dashboard: 4 KPI tiles +
 * Top 5 leaderboard. The full per-member table lives on /committee-performance.
 */
export function CommitteeActivitySummary() {
  const { data, isLoading } = useGetCommitteePerformance();
  const { data: allMembers } = useListMembers();

  const memberByName = useMemo(() => {
    const m = new Map<string, { id: string; designation?: string; photoUrl?: string | null }>();
    for (const mem of allMembers ?? []) {
      m.set(mem.fullName.trim().toLowerCase(), {
        id: mem.id,
        designation: (mem as any).designation || undefined,
        photoUrl: mem.photoUrl,
      });
    }
    return m;
  }, [allMembers]);

  const entries = data?.entries ?? [];
  const totals = entries.reduce(
    (acc, e) => {
      acc.recruited += e.membersRecruited;
      acc.fees += e.feesCollected;
      acc.frfReferred += e.frfReferred;
      acc.loans += e.loansProcessed;
      return acc;
    },
    { recruited: 0, fees: 0, frfReferred: 0, loans: 0 },
  );

  const top5 = [...entries]
    .sort((a, b) => b.totalContributionScore - a.totalContributionScore)
    .filter((e) => e.totalContributionScore > 0)
    .slice(0, 5);

  return (
    <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm animate-in fade-in duration-300">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 space-y-0 pb-4">
        <div>
          <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
            <Activity className="h-4 w-4 text-green-600" /> Committee Activity
          </CardTitle>
          <CardDescription className="dark:text-slate-400">
            Overall contribution across recruitment, fees, FRF, and loans
          </CardDescription>
        </div>
        <Button asChild variant="outline" size="sm" className="border-green-300 text-green-800 dark:border-slate-700 dark:text-green-300 shrink-0" data-testid="button-full-activity-report">
          <Link href="/reports/committee-performance">
            View Full Activity Report <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Compact KPI tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniStat icon={UserPlus} label="Members Recruited" value={totals.recruited} tone="text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20" loading={isLoading} testId="stat-committee-recruited" />
          <MiniStat icon={Coins} label="Membership Fees Collected" value={formatSAR(totals.fees)} tone="text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20" loading={isLoading} testId="stat-committee-fees" />
          <MiniStat icon={HeartHandshake} label="FRF Members Referred" value={totals.frfReferred} tone="text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20" loading={isLoading} testId="stat-committee-frf" />
          <MiniStat icon={Landmark} label="Loans Processed" value={totals.loans} tone="text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20" loading={isLoading} testId="stat-committee-loans" />
        </div>

        {/* Top 5 leaderboard */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-green-700/70 dark:text-slate-500 mb-2 flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5 text-amber-500" /> Top 5 Committee Members
          </p>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : top5.length === 0 ? (
            <p className="text-sm text-green-700/70 dark:text-slate-500 py-6 text-center">No committee activity recorded yet.</p>
          ) : (
            <ul className="divide-y divide-green-50 dark:divide-slate-800/60">
              {top5.map((e, i) => {
                const info = memberByName.get(e.name.trim().toLowerCase());
                return (
                  <li key={e.name} className="flex items-center gap-3 py-2.5 transition-colors hover:bg-green-50/40 dark:hover:bg-slate-800/40 rounded-lg px-2 -mx-2" data-testid={`row-leaderboard-${i}`}>
                    <span className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${i === 0 ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" : "bg-green-100 text-green-800 dark:bg-slate-800 dark:text-green-300"}`}>
                      {i + 1}
                    </span>
                    {info?.photoUrl ? (
                      <MemberAvatar photoUrl={info.photoUrl} name={e.name} size="sm" />
                    ) : (
                      <span className="h-8 w-8 rounded-full bg-green-100 dark:bg-slate-800 border border-green-100 dark:border-slate-700 flex items-center justify-center text-[10px] font-bold text-green-800 dark:text-green-300 shrink-0">
                        {initialsOf(e.name)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-green-950 dark:text-slate-100 truncate">{e.name}</p>
                      {info?.designation ? (
                        <Badge className="bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-300 text-[10px] px-1.5 py-0">{info.designation}</Badge>
                      ) : (
                        <span className="text-[11px] text-green-600/60 dark:text-slate-500">Staff / non-committee</span>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold tabular-nums text-green-900 dark:text-green-300">{e.totalContributionScore}</p>
                      <p className="text-[10px] text-green-600/60 dark:text-slate-500">score</p>
                    </div>
                    {info ? (
                      <Button asChild variant="ghost" size="sm" className="text-green-700 dark:text-green-400 shrink-0 h-8 px-2" data-testid={`button-view-member-${i}`}>
                        <Link href={`/members/${info.id}`}>View Details</Link>
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  tone,
  loading,
  testId,
}: {
  icon: typeof Trophy;
  label: string;
  value: number | string;
  tone: string;
  loading: boolean;
  testId: string;
}) {
  return (
    <div className="rounded-xl border border-green-100 dark:border-slate-800 p-3 flex items-center gap-3" data-testid={testId}>
      <span className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] text-green-800/70 dark:text-slate-400 leading-tight">{label}</p>
        {loading ? <Skeleton className="h-6 w-12 mt-0.5" /> : <p className="text-lg font-bold text-green-950 dark:text-white truncate">{value}</p>}
      </div>
    </div>
  );
}
