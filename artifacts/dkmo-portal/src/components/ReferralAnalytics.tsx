import { useMemo, useState, useEffect } from "react";
import { Link, useSearch } from "wouter";
import { useListMembers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Users, UserPlus, ChevronDown, ChevronUp } from "lucide-react";
import { withReturnTo } from "@/lib/navigation";

/**
 * Referral Analytics — the former Recruitment Leaderboard, now embedded in the
 * Members page as a collapsible section. Derived client-side from refMemberId.
 * Auto-expands when the page is opened with ?referrals=1.
 */
export function ReferralAnalytics() {
  const searchString = useSearch();
  const [open, setOpen] = useState(false);
  const { data: members, isLoading } = useListMembers();

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get("referrals")) setOpen(true);
  }, [searchString]);

  const leaderboard = useMemo(() => {
    const totals = new Map<string, { memberId: string; name: string; membershipId: string; recruits: number }>();
    for (const mem of members || []) {
      totals.set(mem.id, { memberId: mem.id, name: mem.fullName, membershipId: mem.membershipId, recruits: 0 });
    }
    for (const mem of members || []) {
      if (mem.refMemberId && totals.has(mem.refMemberId)) {
        totals.get(mem.refMemberId)!.recruits += 1;
      }
    }
    return Array.from(totals.values())
      .filter((t) => t.recruits > 0)
      .sort((a, b) => b.recruits - a.recruits);
  }, [members]);

  const totalRecruited = useMemo(() => leaderboard.reduce((acc, l) => acc + l.recruits, 0), [leaderboard]);
  const top = leaderboard.slice(0, 10);
  const maxRecruits = leaderboard[0]?.recruits || 1;

  return (
    <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm" data-testid="card-referral-analytics">
      <CardHeader
        className="cursor-pointer select-none py-4"
        onClick={() => setOpen((o) => !o)}
        role="button"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              Referral Analytics
            </CardTitle>
            <CardDescription className="dark:text-slate-400">
              {isLoading
                ? "Loading referral data…"
                : `${leaderboard.length} active referrer${leaderboard.length === 1 ? "" : "s"} · ${totalRecruited} member${totalRecruited === 1 ? "" : "s"} brought in via referrals`}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0 text-green-800 dark:text-green-300" aria-label={open ? "Collapse referral analytics" : "Expand referral analytics"}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="pt-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatChip icon={Users} label="Active referrers" value={isLoading ? null : leaderboard.length} />
            <StatChip icon={UserPlus} label="Total recruited" value={isLoading ? null : totalRecruited} />
            <StatChip icon={Trophy} label="Top referrer" value={isLoading ? null : (leaderboard[0]?.name ?? "—")} />
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : top.length === 0 ? (
            <p className="text-sm text-green-700/70 dark:text-slate-500 py-4 text-center">No referrals recorded yet.</p>
          ) : (
            <div className="space-y-1.5">
              {top.map((row, i) => (
                <div key={row.memberId} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-green-50/50 dark:hover:bg-slate-800/50" data-testid={`row-referrer-${row.memberId}`}>
                  <span className="w-6 text-xs font-bold text-green-700/60 dark:text-slate-500 text-right shrink-0">{i + 1}.</span>
                  <Link href={withReturnTo(`/members/${row.memberId}`)} className="min-w-0 flex-1 group">
                    <span className="text-sm font-semibold text-green-950 dark:text-slate-100 group-hover:underline truncate block">
                      {row.name}
                      <span className="ml-2 text-xs font-normal text-orange-600 dark:text-orange-400">{row.membershipId}</span>
                    </span>
                  </Link>
                  <div className="hidden sm:block h-1.5 w-28 bg-green-50 dark:bg-slate-800 rounded-full overflow-hidden shrink-0">
                    <div className="h-full bg-gradient-to-r from-green-700 to-orange-400" style={{ width: `${Math.round((row.recruits / maxRecruits) * 100)}%` }} />
                  </div>
                  <span className="text-sm font-bold text-green-900 dark:text-green-300 w-8 text-right shrink-0">{row.recruits}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function StatChip({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number | string | null }) {
  return (
    <div className="rounded-xl border border-green-100 dark:border-slate-800 px-3 py-2.5 flex items-center gap-3">
      <Icon className="h-4 w-4 text-green-700 dark:text-green-400 shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] text-green-700/70 dark:text-slate-500">{label}</p>
        {value === null ? <Skeleton className="h-5 w-14 mt-0.5" /> : <p className="text-sm font-bold text-green-950 dark:text-white truncate">{value}</p>}
      </div>
    </div>
  );
}
