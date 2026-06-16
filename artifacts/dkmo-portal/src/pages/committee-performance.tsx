import { useMemo } from "react";
import type { CommitteePerformanceEntry } from "@workspace/api-client-react";
import { useGetCommitteePerformance } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatSAR, cn } from "@/lib/utils";
import { COMMITTEE_2026_27 } from "@/pages/committee";
import { Trophy, UserPlus, Coins, HeartHandshake, Landmark, Stethoscope, LifeBuoy, Activity } from "lucide-react";

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export default function CommitteePerformance() {
  const { data, isLoading } = useGetCommitteePerformance();

  const roleByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of COMMITTEE_2026_27) m.set(c.name.toLowerCase(), c.role);
    return m;
  }, []);

  const entries = useMemo(() => {
    const apiEntries = data?.entries ?? [];
    const byName = new Map<string, CommitteePerformanceEntry>();
    for (const e of apiEntries) byName.set(e.name.toLowerCase(), e);

    const emptyEntry = (name: string): CommitteePerformanceEntry => ({
      name,
      membersRecruited: 0,
      feesCollected: 0,
      frfCount: 0,
      frfAmount: 0,
      welfareHandled: 0,
      loansProcessed: 0,
      medicalAidProcessed: 0,
      emergencyResolved: 0,
      totalActions: 0,
    });

    // Every committee member appears, even with zero activity.
    const merged: CommitteePerformanceEntry[] = COMMITTEE_2026_27.map(
      (c) => byName.get(c.name.toLowerCase()) ?? emptyEntry(c.name),
    );

    // Plus any active non-committee contributors (staff) not on the roster.
    const rosterNames = new Set(COMMITTEE_2026_27.map((c) => c.name.toLowerCase()));
    for (const e of apiEntries) {
      if (!rosterNames.has(e.name.toLowerCase())) merged.push(e);
    }

    return merged.sort((a, b) => b.totalActions - a.totalActions);
  }, [data]);

  const activeCount = (data?.entries ?? []).length;

  const totals = entries.reduce(
    (acc, e) => {
      acc.recruited += e.membersRecruited;
      acc.fees += e.feesCollected;
      acc.frf += e.frfCount;
      acc.welfare += e.welfareHandled;
      acc.loans += e.loansProcessed;
      return acc;
    },
    { recruited: 0, fees: 0, frf: 0, welfare: 0, loans: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-green-950 dark:text-green-100">Committee Performance</h1>
          <p className="text-sm text-green-800/70 dark:text-slate-400 mt-1">
            Activity contributed by each committee member across all programs
          </p>
        </div>
        <div className="text-sm text-green-900 dark:text-green-300 bg-green-50 dark:bg-slate-800 border border-green-100 dark:border-slate-700 px-3.5 py-1.5 rounded-full font-medium inline-flex items-center gap-2">
          <Activity className="h-4 w-4 text-green-700 dark:text-green-400" />
          {activeCount} active contributor{activeCount === 1 ? "" : "s"}
        </div>
      </div>

      {/* Totals row */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <TotalCard icon={UserPlus} label="Members Recruited" value={totals.recruited} accent="text-green-700 dark:text-green-400" loading={isLoading} />
        <TotalCard icon={Coins} label="Fees Collected" value={formatSAR(totals.fees)} accent="text-emerald-700 dark:text-emerald-400" loading={isLoading} />
        <TotalCard icon={HeartHandshake} label="FRF Handled" value={totals.frf} accent="text-rose-600 dark:text-rose-400" loading={isLoading} />
        <TotalCard icon={Stethoscope} label="Welfare Handled" value={totals.welfare} accent="text-sky-600 dark:text-sky-400" loading={isLoading} />
        <TotalCard icon={Landmark} label="Loans Processed" value={totals.loans} accent="text-purple-600 dark:text-purple-400" loading={isLoading} />
      </div>

      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            Contribution Leaderboard
          </CardTitle>
          <CardDescription className="dark:text-slate-400">
            Ranked by total recorded actions. Includes fee collection, recruitment, and case handling.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-green-700/70 dark:text-slate-500 py-12 text-center">
              No committee activity has been recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-green-700/70 dark:text-slate-500 border-b border-green-100 dark:border-slate-800">
                    <th className="py-2 pr-3 font-medium">#</th>
                    <th className="py-2 pr-3 font-medium">Committee Member</th>
                    <th className="py-2 px-2 font-medium text-right">Recruited</th>
                    <th className="py-2 px-2 font-medium text-right">Fees</th>
                    <th className="py-2 px-2 font-medium text-right">FRF</th>
                    <th className="py-2 px-2 font-medium text-right">Welfare</th>
                    <th className="py-2 px-2 font-medium text-right">Medical</th>
                    <th className="py-2 px-2 font-medium text-right">Emergency</th>
                    <th className="py-2 px-2 font-medium text-right">Loans</th>
                    <th className="py-2 pl-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => {
                    const role = roleByName.get(e.name.toLowerCase());
                    return (
                      <tr
                        key={e.name}
                        data-testid={`row-perf-${i}`}
                        className="border-b border-green-50 dark:border-slate-800/60 hover:bg-green-50/40 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 pr-3 text-green-700/60 dark:text-slate-500 font-medium">{i + 1}</td>
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-green-100 dark:bg-slate-800 border border-green-100 dark:border-slate-700 flex items-center justify-center text-xs font-bold text-green-800 dark:text-green-300 shrink-0">
                              {initialsOf(e.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-green-950 dark:text-slate-100 truncate">{e.name}</p>
                              {role ? (
                                <Badge className="mt-0.5 bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-300 text-[10px] px-1.5 py-0">
                                  {role}
                                </Badge>
                              ) : (
                                <span className="text-[11px] text-green-600/60 dark:text-slate-500">Staff / non-committee</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <NumCell value={e.membersRecruited} />
                        <td className="py-3 px-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">
                          {e.feesCollected > 0 ? formatSAR(e.feesCollected) : "—"}
                        </td>
                        <NumCell value={e.frfCount} />
                        <NumCell value={e.welfareHandled} />
                        <NumCell value={e.medicalAidProcessed} />
                        <NumCell value={e.emergencyResolved} />
                        <NumCell value={e.loansProcessed} />
                        <td className="py-3 pl-2 text-right tabular-nums font-bold text-green-950 dark:text-white">{e.totalActions}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NumCell({ value }: { value: number }) {
  return (
    <td className={cn("py-3 px-2 text-right tabular-nums", value > 0 ? "text-green-900 dark:text-slate-200 font-medium" : "text-green-400/50 dark:text-slate-600")}>
      {value > 0 ? value : "—"}
    </td>
  );
}

function TotalCard({
  icon: Icon,
  label,
  value,
  accent,
  loading,
}: {
  icon: typeof Trophy;
  label: string;
  value: number | string;
  accent: string;
  loading: boolean;
}) {
  return (
    <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-green-900 dark:text-slate-300">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${accent}`} />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-7 w-14" /> : <div className="text-xl font-bold text-green-950 dark:text-white">{value}</div>}
      </CardContent>
    </Card>
  );
}
