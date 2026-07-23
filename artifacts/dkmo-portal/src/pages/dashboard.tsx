import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Reorder } from "framer-motion";
import {
  useGetDashboardSummary,
  useGetDashboardFinancialSummary,
  useGetDashboardCashFlow,
  useGetFrfOverview,
  useListMembers,
  useListEvents,
  useListSponsors,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatSAR, getCurrentMonth } from "@/lib/utils";
import {
  Users,
  UserCheck,
  HeartHandshake,
  TrendingUp,
  CalendarClock,
  Clock,
  MapPin,
  HandCoins,
  Trophy,
  ArrowRight,
  GripVertical,
  LayoutGrid,
  Check,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedNumber } from "@/components/dashboard/AnimatedNumber";
import { DashboardClock } from "@/components/dashboard/DashboardClock";
import { MemberOfTheMonth } from "@/components/dashboard/MemberOfTheMonth";
import { ActionRequired } from "@/components/dashboard/ActionRequired";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { QuickActionsMenu } from "@/components/dashboard/QuickActionsMenu";
import { useAuth } from "@/lib/auth";
import { celebrateMilestone } from "@/lib/confetti";

const TRANSFER_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  cheque: "Cheque",
};

type WidgetKey = "actionRequired" | "activityFeed" | "memberOfMonth" | "recruiters" | "events" | "sponsors";
const DEFAULT_ORDER: WidgetKey[] = ["actionRequired", "activityFeed", "memberOfMonth", "recruiters", "events", "sponsors"];
const ORDER_STORAGE_KEY = "dkmo.dashboard.widgetOrder";
const MILESTONE_STORAGE_KEY = "dkmo.dashboard.recruitMilestone";

function loadOrder(): WidgetKey[] {
  try {
    const raw = localStorage.getItem(ORDER_STORAGE_KEY);
    if (!raw) return DEFAULT_ORDER;
    const parsed = JSON.parse(raw) as WidgetKey[];
    const valid = parsed.filter((k): k is WidgetKey => DEFAULT_ORDER.includes(k));
    for (const k of DEFAULT_ORDER) if (!valid.includes(k)) valid.push(k);
    return valid.length ? valid : DEFAULT_ORDER;
  } catch {
    return DEFAULT_ORDER;
  }
}

function eventDayParts(iso: string) {
  const d = new Date(iso);
  return { day: d.getDate(), month: d.toLocaleDateString("en-US", { month: "short" }) };
}

function formatEventTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function daysUntil(iso: string) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86_400_000);
}

function countdownLabel(n: number) {
  if (n <= 0) return "Today";
  if (n === 1) return "Starts Tomorrow";
  return `Starts in ${n} Days`;
}

function collectionStatus(total: number, paid: number): "Collected" | "Partial" | "Pending" {
  if (total > 0 && paid >= total) return "Collected";
  if (paid > 0) return "Partial";
  return "Pending";
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const currentMonth = getCurrentMonth();

  const today = new Date();
  const todayYear = today.getFullYear();
  const todayQuarter = Math.floor(today.getMonth() / 3) + 1;

  const [order, setOrder] = useState<WidgetKey[]>(DEFAULT_ORDER);
  const [customizing, setCustomizing] = useState(false);
  const { hasRole } = useAuth();
  const canSeeActivity = hasRole("admin", "finance");
  const visibleOrder = canSeeActivity ? order : order.filter((k) => k !== "activityFeed");

  useEffect(() => {
    setOrder(loadOrder());
  }, []);

  const saveOrder = (next: WidgetKey[]) => {
    setOrder(next);
    try {
      localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore persistence failures */
    }
  };

  // index/target refer to positions in the *visible* list; map back to the full order.
  const moveWidget = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= visibleOrder.length) return;
    const a = order.indexOf(visibleOrder[index]!);
    const b = order.indexOf(visibleOrder[target]!);
    if (a < 0 || b < 0) return;
    const next = [...order];
    [next[a], next[b]] = [next[b]!, next[a]!];
    saveOrder(next);
  };

  // Reorder.Group emits the reordered *visible* list; splice hidden keys back
  // into their previous positions so they aren't lost from the persisted order.
  const handleReorder = (nextVisible: WidgetKey[]) => {
    if (nextVisible.length === order.length) {
      saveOrder(nextVisible);
      return;
    }
    const merged = [...nextVisible];
    order.forEach((k, i) => {
      if (!nextVisible.includes(k)) merged.splice(Math.min(i, merged.length), 0, k);
    });
    saveOrder(merged);
  };

  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: financialSummary } = useGetDashboardFinancialSummary({ month: currentMonth });
  const { data: cashFlow } = useGetDashboardCashFlow({ year: todayYear, quarter: todayQuarter });
  const { data: frfOverview } = useGetFrfOverview();
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
      .sort((a, b) => b.recruits - a.recruits || a.name.localeCompare(b.name))
      .slice(0, 5);
  }, [members]);

  const topRecruitCount = topRecruiters[0]?.recruits ?? 0;

  // Celebrate when the leading recruiter crosses a new multiple-of-5 milestone.
  useEffect(() => {
    if (topRecruitCount < 5) return;
    const milestone = Math.floor(topRecruitCount / 5) * 5;
    let last = 0;
    try {
      last = Number(localStorage.getItem(MILESTONE_STORAGE_KEY) ?? "0") || 0;
    } catch {
      last = 0;
    }
    if (milestone > last) {
      celebrateMilestone();
      try {
        localStorage.setItem(MILESTONE_STORAGE_KEY, String(milestone));
      } catch {
        /* ignore */
      }
    }
  }, [topRecruitCount]);

  // Upcoming Events — real records, future-dated, sorted by nearest date.
  const { data: eventsData, isLoading: isLoadingEvents } = useListEvents({
    sort: "dateAsc",
    pageSize: 200,
  });
  const upcomingEvents = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return (eventsData?.items ?? [])
      .filter(
        (e) =>
          e.eventDate &&
          e.status !== "cancelled" &&
          e.status !== "completed" &&
          new Date(e.eventDate) >= startOfToday,
      )
      .sort((a, b) => new Date(a.eventDate!).getTime() - new Date(b.eventDate!).getTime())
      .slice(0, 5);
  }, [eventsData]);

  // Top Sponsors & Collection Responsibility — real sponsor records.
  const { data: sponsorsData, isLoading: isLoadingSponsors } = useListSponsors({
    sort: "totalDesc",
    pageSize: 200,
  });
  const sponsors = sponsorsData?.items ?? [];
  const sponsorSummary = useMemo(() => {
    let committed = 0;
    let collected = 0;
    for (const s of sponsors) {
      committed += s.totalAmount;
      collected += s.paidAmount;
    }
    return { committed, collected, outstanding: Math.max(committed - collected, 0) };
  }, [sponsors]);
  const topSponsors = useMemo(
    () => [...sponsors].sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 5),
    [sponsors],
  );

  // Map committee member names → ids so "Assigned To" links to member profiles.
  const memberIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const mem of members || []) map.set(mem.fullName.trim().toLowerCase(), mem.id);
    return map;
  }, [members]);

  const monthlyCollection = financialSummary?.members.collectedThisMonth ?? 0;

  function renderRecruiters() {
    return (
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
              {topRecruiters.map((r, i) => {
                const pct = topRecruitCount > 0 ? Math.round((r.recruits / topRecruitCount) * 100) : 0;
                return (
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
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-green-100/70 dark:bg-slate-700/70">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-600 transition-[width] duration-700 ease-out"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-sm font-bold text-green-800 dark:text-green-300 tabular-nums shrink-0">
                        {r.recruits} {r.recruits === 1 ? "recruit" : "recruits"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    );
  }

  function renderEvents() {
    return (
      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-green-700 dark:text-green-400" />
              Upcoming Events
            </CardTitle>
            <CardDescription className="dark:text-slate-400">
              Next scheduled DKMO events, sorted by nearest date
            </CardDescription>
          </div>
          <Link
            href="/events"
            className="text-sm text-green-800 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 font-medium inline-flex items-center gap-1 shrink-0"
            data-testid="link-view-all-events"
          >
            View All Events <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {isLoadingEvents ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : upcomingEvents.length === 0 ? (
            <div className="py-8 text-center">
              <CalendarClock className="h-8 w-8 mx-auto text-green-300 dark:text-slate-600 mb-2" />
              <p className="text-sm text-green-700/70 dark:text-slate-500">No Upcoming Events Scheduled</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {upcomingEvents.map((e) => {
                const n = daysUntil(e.eventDate!);
                const soon = n <= 7;
                const parts = eventDayParts(e.eventDate!);
                return (
                  <li key={e.id}>
                    <Link
                      href={`/events/${e.id}`}
                      data-testid={`event-${e.id}`}
                      className={
                        "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors " +
                        (soon
                          ? "border-amber-200 bg-amber-50/60 hover:bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10 dark:hover:bg-amber-900/20"
                          : "border-green-100 bg-green-50/40 hover:bg-green-50 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:bg-slate-800")
                      }
                    >
                      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-green-100 text-green-800 dark:bg-slate-800 dark:text-green-300">
                        <span className="text-base font-bold leading-none">{parts.day}</span>
                        <span className="text-[10px] font-medium uppercase">{parts.month}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-green-950 dark:text-green-100 truncate">{e.name}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-green-700/70 dark:text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0" />
                            {formatEventTime(e.eventDate!)}
                          </span>
                          {e.location && (
                            <span className="inline-flex items-center gap-1 min-w-0">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span className="truncate">{e.location}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={
                            "rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap " +
                            (n <= 0
                              ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                              : soon
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300")
                          }
                        >
                          {countdownLabel(n)}
                        </span>
                        <span className="text-[11px] text-green-700/60 dark:text-slate-500">
                          {n <= 0 ? "Today" : "Upcoming"}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }

  function renderSponsors() {
    return (
      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
              <HandCoins className="h-4 w-4 text-green-700 dark:text-green-400" />
              Top Sponsors &amp; Collection Responsibility
            </CardTitle>
            <CardDescription className="dark:text-slate-400">
              Sponsorship commitments and collection accountability
            </CardDescription>
          </div>
          <Link
            href="/sponsors"
            className="text-sm text-green-800 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 font-medium inline-flex items-center gap-1 shrink-0"
            data-testid="link-view-all-sponsors"
          >
            View All Sponsors <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingSponsors ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : topSponsors.length === 0 ? (
            <div className="py-8 text-center">
              <HandCoins className="h-8 w-8 mx-auto text-green-300 dark:text-slate-600 mb-2" />
              <p className="text-sm text-green-700/70 dark:text-slate-500">No Sponsors Recorded Yet</p>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-green-100 dark:border-slate-800 bg-green-50/40 dark:bg-slate-800/40 px-3 py-2">
                  <p className="text-[11px] text-green-700/70 dark:text-slate-500">Total Committed</p>
                  <p className="text-sm font-bold text-green-950 dark:text-green-100 tabular-nums">
                    {formatSAR(sponsorSummary.committed)}
                  </p>
                </div>
                <div className="rounded-xl border border-green-100 dark:border-slate-800 bg-green-50/40 dark:bg-slate-800/40 px-3 py-2">
                  <p className="text-[11px] text-green-700/70 dark:text-slate-500">Total Collected</p>
                  <p className="text-sm font-bold text-green-700 dark:text-green-400 tabular-nums">
                    {formatSAR(sponsorSummary.collected)}
                  </p>
                </div>
                <div className="rounded-xl border border-amber-100 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-900/10 px-3 py-2">
                  <p className="text-[11px] text-amber-700/80 dark:text-amber-500/80">Outstanding</p>
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                    {formatSAR(sponsorSummary.outstanding)}
                  </p>
                </div>
              </div>

              {/* Top sponsors */}
              <ul className="space-y-2">
                {topSponsors.map((s) => {
                  const cs = collectionStatus(s.totalAmount, s.paidAmount);
                  const memId = memberIdByName.get(s.assignedStaff.trim().toLowerCase());
                  const statusClass =
                    cs === "Collected"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                      : cs === "Partial"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
                  return (
                    <li key={s.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/sponsors/${s.id}`)}
                        onKeyDown={(ev) => {
                          if (ev.target !== ev.currentTarget) return;
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            navigate(`/sponsors/${s.id}`);
                          }
                        }}
                        data-testid={`sponsor-${s.id}`}
                        className="cursor-pointer rounded-xl border border-green-100 dark:border-slate-800 bg-green-50/40 dark:bg-slate-800/40 px-3 py-2.5 transition-colors hover:bg-green-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-green-950 dark:text-green-100 truncate">
                              {s.sponsorName}
                            </p>
                            <p className="text-xs text-green-700/70 dark:text-slate-500">
                              {TRANSFER_METHOD_LABELS[s.transferMethod] ?? s.transferMethod}
                            </p>
                          </div>
                          <span
                            className={"rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap " + statusClass}
                          >
                            {cs}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <p className="text-green-700/60 dark:text-slate-500">Committed</p>
                            <p className="font-semibold text-green-950 dark:text-green-100 tabular-nums">
                              {formatSAR(s.totalAmount)}
                            </p>
                          </div>
                          <div>
                            <p className="text-green-700/60 dark:text-slate-500">Collected</p>
                            <p className="font-semibold text-green-700 dark:text-green-400 tabular-nums">
                              {formatSAR(s.paidAmount)}
                            </p>
                          </div>
                          <div>
                            <p className="text-green-700/60 dark:text-slate-500">Balance</p>
                            <p className="font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                              {formatSAR(s.pendingAmount)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-green-700/70 dark:text-slate-500">
                          <span>Assigned to:</span>
                          {memId ? (
                            <Link
                              href={`/members/${memId}`}
                              onClick={(ev) => ev.stopPropagation()}
                              className="font-medium text-green-800 dark:text-green-400 hover:underline"
                              data-testid={`sponsor-assigned-${s.id}`}
                            >
                              {s.assignedStaff}
                            </Link>
                          ) : (
                            <span className="font-medium text-green-900 dark:text-slate-300">
                              {s.assignedStaff || "Unassigned"}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  const renderWidget = (key: WidgetKey) => {
    switch (key) {
      case "actionRequired":
        return <ActionRequired />;
      case "activityFeed":
        return canSeeActivity ? <ActivityFeed /> : null;
      case "memberOfMonth":
        return <MemberOfTheMonth members={members} isLoading={isLoadingMembers} />;
      case "recruiters":
        return renderRecruiters();
      case "events":
        return renderEvents();
      case "sponsors":
        return renderSponsors();
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-green-950 dark:text-green-100">Dashboard</h1>
          <p className="text-sm text-green-800/70 dark:text-slate-400 mt-1">DKMO — Committed to the community</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          <DashboardClock />
          <QuickActionsMenu />
          <button
            type="button"
            onClick={() => setCustomizing((v) => !v)}
            data-testid="button-customize-dashboard"
            className={
              "inline-flex items-center justify-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors " +
              (customizing
                ? "border-green-300 bg-green-600 text-white hover:bg-green-700 dark:border-green-700"
                : "border-green-100 bg-green-50 text-green-900 hover:bg-green-100 dark:border-slate-700 dark:bg-slate-800 dark:text-green-300 dark:hover:bg-slate-700")
            }
          >
            {customizing ? <Check className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            {customizing ? "Done" : "Customize"}
          </button>
        </div>
      </div>

      {customizing && (
        <p className="rounded-xl border border-dashed border-green-200 dark:border-slate-700 bg-green-50/50 dark:bg-slate-800/40 px-4 py-2.5 text-sm text-green-800 dark:text-slate-300">
          Drag the widgets below using the handle to reorder your dashboard. Your layout is saved automatically.
        </p>
      )}

      {/* KPI Cards — only the metrics that matter */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/members" className="block group" data-testid="link-summary-members">
          <Card className="glass rounded-2xl border-green-100 dark:border-slate-800 shadow-sm transition-all duration-200 ease-in-out group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:border-green-300 dark:group-hover:border-green-700 group-active:scale-[0.98] cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-900 dark:text-slate-300">Total Members</CardTitle>
              <Users className="h-4 w-4 text-green-700 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <AnimatedNumber
                  value={summary?.totalMembers || 0}
                  className="text-2xl font-bold text-green-950 dark:text-white"
                />
              )}
              <p className="text-xs text-green-700/80 dark:text-slate-500 mt-1">Registered members</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/members" className="block group" data-testid="link-summary-active">
          <Card className="glass rounded-2xl border-green-100 dark:border-slate-800 shadow-sm transition-all duration-200 ease-in-out group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:border-green-300 dark:group-hover:border-green-700 group-active:scale-[0.98] cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-900 dark:text-slate-300">Active Members</CardTitle>
              <UserCheck className="h-4 w-4 text-green-700 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <AnimatedNumber
                  value={summary?.activeMembersCount || 0}
                  className="text-2xl font-bold text-green-950 dark:text-white"
                />
              )}
              <p className="text-xs text-green-700/80 dark:text-slate-500 mt-1">
                {summary
                  ? `${summary.suspendedMembersCount} suspended · ${summary.inactiveMembersCount} inactive`
                  : "Active status members"}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/frf" className="block group" data-testid="link-summary-frf-claims">
          <Card className="glass rounded-2xl border-orange-100 dark:border-orange-900/40 shadow-sm transition-all duration-200 ease-in-out group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:border-orange-300 group-active:scale-[0.98] cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-orange-900 dark:text-orange-300">Pending FRF Claims</CardTitle>
              <HeartHandshake className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </CardHeader>
            <CardContent>
              {cashFlow == null ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <AnimatedNumber
                  value={cashFlow.pendingClaimsCount ?? 0}
                  className="text-2xl font-bold text-orange-700 dark:text-orange-400"
                />
              )}
              <p className="text-xs text-orange-700/80 dark:text-orange-500/80 mt-1">
                {summary && summary.frfOutstandingTotal > 0
                  ? `${formatSAR(summary.frfOutstandingTotal)} contributions pending`
                  : "Awaiting review"}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/payments" className="block group" data-testid="link-summary-monthly">
          <Card className="glass rounded-2xl border-green-100 dark:border-slate-800 shadow-sm transition-all duration-200 ease-in-out group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:border-green-300 dark:group-hover:border-green-700 group-active:scale-[0.98] cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-900 dark:text-slate-300">Monthly Collections</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-700 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              {financialSummary == null ? (
                <Skeleton className="h-8 w-28" />
              ) : (
                <AnimatedNumber
                  value={monthlyCollection}
                  format={(n) => formatSAR(n)}
                  className="text-2xl font-bold text-green-950 dark:text-green-300"
                />
              )}
              <p className="text-xs text-green-700/80 dark:text-slate-500 mt-1">Collected this month</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Fees & FRF KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Link href="/pending" className="block group" data-testid="link-summary-fees-pending">
          <Card className="glass rounded-2xl border-amber-100 dark:border-amber-900/40 shadow-sm transition-all duration-200 ease-in-out group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:border-amber-300 group-active:scale-[0.98] cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-amber-900 dark:text-amber-300">Membership Fees Pending</CardTitle>
              <UserCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <AnimatedNumber
                  value={(summary?.unpaidMembersCount ?? 0) + (summary?.pendingMembersCount ?? 0)}
                  className="text-2xl font-bold text-amber-700 dark:text-amber-400"
                />
              )}
              <p className="text-xs text-amber-700/80 dark:text-amber-500/80 mt-1">
                {summary ? `${formatSAR(summary.outstandingFees)} outstanding` : "Members yet to pay SAR 100"}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/frf" className="block group" data-testid="link-summary-active-frf-cases">
          <Card className="glass rounded-2xl border-green-100 dark:border-slate-800 shadow-sm transition-all duration-200 ease-in-out group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:border-green-300 dark:group-hover:border-green-700 group-active:scale-[0.98] cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-900 dark:text-slate-300">Active FRF Cases</CardTitle>
              <HeartHandshake className="h-4 w-4 text-green-700 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <AnimatedNumber
                  value={summary?.activeFrfCasesCount ?? 0}
                  className="text-2xl font-bold text-green-950 dark:text-white"
                />
              )}
              <p className="text-xs text-green-700/80 dark:text-slate-500 mt-1">
                {summary ? `${summary.closedFrfCasesCount} closed` : "Open cases collecting contributions"}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/frf" className="block group" data-testid="link-summary-members-pending-frf">
          <Card className="glass rounded-2xl border-orange-100 dark:border-orange-900/40 shadow-sm transition-all duration-200 ease-in-out group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:border-orange-300 group-active:scale-[0.98] cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-orange-900 dark:text-orange-300">Members Pending FRF</CardTitle>
              <Users className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <AnimatedNumber
                  value={summary?.membersPendingFrfCount ?? 0}
                  className="text-2xl font-bold text-orange-700 dark:text-orange-400"
                />
              )}
              <p className="text-xs text-orange-700/80 dark:text-orange-500/80 mt-1">
                {summary
                  ? `${summary.membersPaidFrfCount} paid · ${summary.membersPartialFrfCount} partial`
                  : "Members with unpaid contributions"}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/payments" className="block group" data-testid="link-summary-frf-collected">
          <Card className="glass rounded-2xl border-green-100 dark:border-slate-800 shadow-sm transition-all duration-200 ease-in-out group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:border-green-300 dark:group-hover:border-green-700 group-active:scale-[0.98] cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-900 dark:text-slate-300">FRF Collected</CardTitle>
              <HandCoins className="h-4 w-4 text-green-700 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <AnimatedNumber
                  value={summary?.frfCollectedTotal ?? 0}
                  format={(n) => formatSAR(n)}
                  className="text-2xl font-bold text-green-950 dark:text-green-300"
                />
              )}
              <p className="text-xs text-green-700/80 dark:text-slate-500 mt-1">Total FRF contributions received</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/frf" className="block group" data-testid="link-summary-frf-outstanding">
          <Card className="glass rounded-2xl border-red-100 dark:border-red-900/40 shadow-sm transition-all duration-200 ease-in-out group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:border-red-300 group-active:scale-[0.98] cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-red-900 dark:text-red-300">FRF Outstanding</CardTitle>
              <TrendingUp className="h-4 w-4 text-red-600 dark:text-red-400" />
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <AnimatedNumber
                  value={summary?.frfOutstandingTotal ?? 0}
                  format={(n) => formatSAR(n)}
                  className="text-2xl font-bold text-red-700 dark:text-red-400"
                />
              )}
              <p className="text-xs text-red-700/80 dark:text-red-500/80 mt-1">Contributions still due</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* FRF Collection Overview */}
      {frfOverview && frfOverview.expectedTotal > 0 && (
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
                  <HeartHandshake className="h-4 w-4 text-green-700 dark:text-green-400" /> FRF Collection Overview
                </CardTitle>
                <CardDescription className="dark:text-slate-400">
                  {frfOverview.approvedClaims} approved claim{frfOverview.approvedClaims === 1 ? "" : "s"} · collection rate {frfOverview.collectionRate}%
                </CardDescription>
              </div>
              <Link href="/frf" className="text-sm text-green-700 dark:text-green-400 hover:underline inline-flex items-center gap-1">
                View FRF <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Expected", value: formatSAR(frfOverview.expectedTotal), cls: "text-green-950 dark:text-white" },
                { label: "Collected", value: formatSAR(frfOverview.collectedTotal), cls: "text-green-700 dark:text-green-300" },
                { label: "Outstanding", value: formatSAR(frfOverview.outstandingTotal), cls: frfOverview.outstandingTotal > 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-300" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-green-100 dark:border-slate-800 p-3 text-center">
                  <p className="text-xs text-green-700/70 dark:text-slate-500">{s.label}</p>
                  <p className={`text-lg font-bold ${s.cls}`}>{s.value}</p>
                </div>
              ))}
            </div>
            <div className="h-2 w-full rounded-full bg-green-100 dark:bg-slate-800 overflow-hidden">
              <div className="h-full rounded-full bg-green-600 dark:bg-green-500 transition-all" style={{ width: `${Math.min(100, frfOverview.collectionRate)}%` }} />
            </div>
            {frfOverview.topOutstandingMembers.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-green-800 dark:text-green-300 uppercase tracking-wider mb-2">Top Outstanding</p>
                <div className="space-y-1.5">
                  {frfOverview.topOutstandingMembers.slice(0, 5).map((m) => (
                    <Link key={m.memberId} href={`/members/${m.memberId}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-green-50 dark:hover:bg-slate-800/60 transition-colors">
                      <span className="text-sm text-green-950 dark:text-slate-200">{m.fullName} <span className="text-xs text-green-600 dark:text-slate-500">· {m.membershipId}</span></span>
                      <span className="text-sm font-semibold text-red-600 dark:text-red-400">{formatSAR(m.outstanding)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reorderable widgets — personalize layout via drag-and-drop */}
      <Reorder.Group axis="y" values={visibleOrder} onReorder={handleReorder} className="space-y-6" as="div">
        {visibleOrder.map((key, index) => (
          <Reorder.Item
            key={key}
            value={key}
            as="div"
            dragListener={customizing}
            className={"relative" + (customizing ? " cursor-grab active:cursor-grabbing" : "")}
          >
            {customizing && (
              <div className="absolute -top-2 left-3 z-10 flex items-center gap-1">
                <span className="inline-flex items-center gap-1 rounded-full bg-green-600 px-2 py-0.5 text-[11px] font-medium text-white shadow-sm">
                  <GripVertical className="h-3 w-3" />
                  Drag to reorder
                </span>
                <button
                  type="button"
                  onClick={() => moveWidget(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${key} widget up`}
                  data-testid={`button-move-up-${key}`}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-green-700 shadow-sm ring-1 ring-green-200 enabled:hover:bg-green-50 disabled:opacity-40 dark:bg-slate-800 dark:text-green-400 dark:ring-slate-700"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveWidget(index, 1)}
                  disabled={index === visibleOrder.length - 1}
                  aria-label={`Move ${key} widget down`}
                  data-testid={`button-move-down-${key}`}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-green-700 shadow-sm ring-1 ring-green-200 enabled:hover:bg-green-50 disabled:opacity-40 dark:bg-slate-800 dark:text-green-400 dark:ring-slate-700"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className={customizing ? "ring-2 ring-green-300 dark:ring-green-700 rounded-2xl" : ""}>
              {renderWidget(key)}
            </div>
          </Reorder.Item>
        ))}
      </Reorder.Group>
    </div>
  );
}
