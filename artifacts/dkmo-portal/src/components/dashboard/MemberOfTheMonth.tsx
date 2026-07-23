import { useMemo } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Sparkles, Trophy, ArrowRight, UserCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MemberBadges } from "@/components/MemberBadges";
import { AchievementBadges } from "@/components/dashboard/AchievementBadges";

type DashboardMember = {
  id: string;
  fullName: string;
  membershipId: string;
  photoUrl?: string | null;
  designation?: string | null;
  isExecutiveCommittee?: boolean | null;
  isCoreCommittee?: boolean | null;
  refMemberId?: string | null;
  createdAt?: string | null;
};

function inCurrentMonth(iso?: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/**
 * "Member of the Month" — the member who recruited the most new members this
 * month (falling back to the all-time top recruiter). Purely computed from real
 * referral records.
 */
export function MemberOfTheMonth({
  members,
  isLoading,
}: {
  members: DashboardMember[] | undefined;
  isLoading: boolean;
}) {
  const winner = useMemo(() => {
    const list = members ?? [];
    if (list.length === 0) return null;
    const byId = new Map(list.map((m) => [m.id, m]));

    const monthly = new Map<string, number>();
    const allTime = new Map<string, number>();
    for (const m of list) {
      if (!m.refMemberId || !byId.has(m.refMemberId)) continue;
      allTime.set(m.refMemberId, (allTime.get(m.refMemberId) ?? 0) + 1);
      if (inCurrentMonth(m.createdAt)) {
        monthly.set(m.refMemberId, (monthly.get(m.refMemberId) ?? 0) + 1);
      }
    }

    const pick = (counts: Map<string, number>) => {
      let bestId: string | null = null;
      let best = 0;
      for (const [id, n] of counts) {
        if (n > best || (n === best && bestId && byId.get(id)!.fullName.localeCompare(byId.get(bestId)!.fullName) < 0)) {
          best = n;
          bestId = id;
        }
      }
      return bestId ? { member: byId.get(bestId)!, count: best } : null;
    };

    const monthlyWinner = pick(monthly);
    const result = monthlyWinner ?? pick(allTime);
    if (!result) return null;
    return { ...result, scope: monthlyWinner ? "month" : "allTime" as const };
  }, [members]);

  return (
    <Card className="glass-strong overflow-hidden rounded-2xl border-amber-200/60 dark:border-amber-900/40 shadow-sm">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-yellow-500 text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-green-950 dark:text-green-100">Member of the Month</h3>
            <p className="text-[11px] text-green-700/70 dark:text-slate-400">
              Top recruiter {winner?.scope === "month" ? "this month" : "of all time"}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ) : !winner ? (
          <div className="py-6 text-center">
            <Trophy className="mx-auto mb-2 h-8 w-8 text-amber-300 dark:text-amber-700" />
            <p className="text-sm text-green-700/70 dark:text-slate-500">
              No recruitment activity yet. The first member to refer others will be featured here.
            </p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col gap-4 sm:flex-row sm:items-center"
          >
            <Link href={`/members/${winner.member.id}`} className="shrink-0">
              {winner.member.photoUrl ? (
                <img
                  src={winner.member.photoUrl}
                  alt={winner.member.fullName}
                  className="h-16 w-16 rounded-full object-cover ring-2 ring-amber-300 dark:ring-amber-600"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-700 ring-2 ring-amber-300 dark:bg-amber-900/40 dark:text-amber-400 dark:ring-amber-700">
                  <UserCircle className="h-9 w-9" />
                </div>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={`/members/${winner.member.id}`}
                className="text-lg font-bold text-green-950 dark:text-green-100 hover:underline"
                data-testid="member-of-the-month-name"
              >
                {winner.member.fullName}
              </Link>
              <p className="text-xs text-green-700/70 dark:text-slate-500">{winner.member.membershipId}</p>
              <div className="mt-2 flex flex-col gap-1.5">
                <MemberBadges
                  designation={winner.member.designation}
                  isExecutiveCommittee={winner.member.isExecutiveCommittee}
                  isCoreCommittee={winner.member.isCoreCommittee}
                />
                <AchievementBadges keys={["topRecruiter"]} />
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-center rounded-xl bg-amber-50/80 dark:bg-amber-900/20 px-4 py-2 text-center">
              <span className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                {winner.count}
              </span>
              <span className="text-[11px] font-medium text-amber-700/80 dark:text-amber-500/80">
                {winner.count === 1 ? "recruit" : "recruits"}
              </span>
            </div>
          </motion.div>
        )}

        <Link
          href="/members?referrals=1"
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-green-800 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300"
        >
          View referral analytics <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
