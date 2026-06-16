import { useMemo, useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  useGetDashboardSummary,
  useGetDashboardSponsorPipeline,
  useGetDashboardFinancialSummary,
  useGetDashboardCashFlow,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatSAR, getCurrentMonth } from "@/lib/utils";
import {
  Users,
  TrendingUp,
  AlertCircle,
  CalendarRange,
  ArrowRight,
  Handshake,
  XCircle,
  Clock,
  Wallet,
  Landmark,
  HeartHandshake,
  CalendarDays,
  Scale,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const currentMonth = getCurrentMonth();
  const [, setLocation] = useLocation();

  const today = new Date();
  const fullDateLabel = today.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const todayYear = today.getFullYear();
  const todayQuarter = Math.floor(today.getMonth() / 3) + 1;

  // Adjustable Events quarter/year
  const [eventsYear, setEventsYear] = useState(todayYear);
  const [eventsQuarter, setEventsQuarter] = useState(todayQuarter);
  const [showQuarterPicker, setShowQuarterPicker] = useState(false);
  const quarterPickerRef = useRef<HTMLDivElement>(null);

  // Close pickers on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (quarterPickerRef.current && !quarterPickerRef.current.contains(e.target as Node)) setShowQuarterPicker(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: pipeline } = useGetDashboardSponsorPipeline();
  const { data: financialSummary } = useGetDashboardFinancialSummary({ month: currentMonth });
  const { data: cashFlow } = useGetDashboardCashFlow({ year: eventsYear, quarter: eventsQuarter });

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

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
              <p className="text-xs text-green-700/80 dark:text-slate-500 mt-1">Active registrations</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/payments" className="block group" data-testid="link-summary-collected">
          <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm transition-all duration-200 ease-in-out group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:border-green-300 dark:group-hover:border-green-700 group-active:scale-[0.98] cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-900 dark:text-slate-300">Fees Collected</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-700 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="text-2xl font-bold text-green-950 dark:text-green-300">{formatSAR(summary?.totalFeesCollected)}</div>
              )}
              <p className="text-xs text-green-700/80 dark:text-slate-500 mt-1">
                {summary?.paidMembersCount || 0} members paid
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/pending" className="block group" data-testid="link-summary-pending">
          <Card className="rounded-2xl border-orange-100 dark:border-orange-900/40 dark:bg-slate-900 shadow-sm transition-all duration-200 ease-in-out group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:border-orange-300 group-active:scale-[0.98] cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-orange-900 dark:text-orange-300">Outstanding Fees</CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{formatSAR(summary?.outstandingFees)}</div>
              )}
              <p className="text-xs text-orange-700/80 dark:text-orange-500/80 mt-1">
                {summary?.unpaidMembersCount || 0} unpaid · {summary?.pendingMembersCount || 0} pending
              </p>
            </CardContent>
          </Card>
        </Link>

        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm h-full" data-testid="link-summary-fee-total">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-900 dark:text-slate-300">
              Expected Fee Total
            </CardTitle>
            <Wallet className="h-4 w-4 text-green-700 dark:text-green-400" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold text-green-950 dark:text-green-300">{formatSAR(summary?.membershipFeeTotal)}</div>
            )}
            <p className="text-xs text-green-700/80 dark:text-slate-500 mt-1">All registration fees combined</p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary KPI Row — Claims + Events */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/frf" className="block group">
          <Card className="rounded-2xl border-orange-100 dark:border-orange-900/40 dark:bg-slate-900 shadow-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:border-orange-300 group-active:scale-[0.98] cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-orange-900 dark:text-orange-300">Claims Pending</CardTitle>
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

        <Card className="rounded-2xl border-blue-100 dark:border-blue-900/40 dark:bg-slate-900 shadow-sm h-full">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle
              className="text-sm font-medium text-blue-900 dark:text-blue-300 cursor-pointer hover:text-blue-700 dark:hover:text-blue-200 transition-colors"
              onClick={() => setLocation("/events")}
            >
              Events This Quarter
            </CardTitle>
            <div className="relative" ref={quarterPickerRef}>
              <button
                type="button"
                onClick={() => setShowQuarterPicker((v) => !v)}
                title="Change quarter"
                className="rounded-lg p-1 hover:bg-blue-100 dark:hover:bg-slate-700 transition-colors"
              >
                <CalendarDays className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </button>
              {showQuarterPicker && (
                <div className="absolute right-0 top-7 z-50 bg-white dark:bg-slate-800 border border-blue-200 dark:border-slate-700 rounded-xl shadow-lg p-2.5 min-w-[130px]">
                  <div className="flex items-center justify-between mb-2">
                    <button
                      type="button"
                      onClick={() => setEventsYear((y) => y - 1)}
                      className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                    >‹</button>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{eventsYear}</span>
                    <button
                      type="button"
                      onClick={() => setEventsYear((y) => y + 1)}
                      className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                    >›</button>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {[1, 2, 3, 4].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => { setEventsQuarter(q); setShowQuarterPicker(false); }}
                        className={`text-xs px-2 py-1.5 rounded-lg font-medium transition-colors ${
                          eventsQuarter === q
                            ? "bg-blue-600 text-white"
                            : "text-blue-900 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-700"
                        }`}
                      >
                        Q{q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {cashFlow == null ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div
                className="text-2xl font-bold text-blue-800 dark:text-blue-300 cursor-pointer hover:text-blue-600 transition-colors"
                onClick={() => setLocation("/events")}
              >
                {cashFlow.eventsThisQuarter ?? 0}
              </div>
            )}
            <p className="text-xs text-blue-700/80 dark:text-blue-500/80 mt-1">
              Q{eventsQuarter} · {eventsYear}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm h-full">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-900 dark:text-slate-300">Net Balance</CardTitle>
            <Scale className="h-4 w-4 text-green-700 dark:text-green-400" />
          </CardHeader>
          <CardContent>
            {cashFlow == null ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <div className={`text-2xl font-bold ${(cashFlow.netBalance ?? 0) >= 0 ? "text-green-950 dark:text-green-300" : "text-red-700 dark:text-red-400"}`}>
                {formatSAR(cashFlow.netBalance)}
              </div>
            )}
            <p className="text-xs text-green-700/80 dark:text-slate-500 mt-1">Collected minus disbursed</p>
          </CardContent>
        </Card>
      </div>

      {/* Financial Summary */}
      {financialSummary && (
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
              <Landmark className="h-4 w-4 text-green-700 dark:text-green-400" />
              Financial Summary
            </CardTitle>
            <CardDescription className="dark:text-slate-400">
              Total collected = Member contributions + Sponsorship receipts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Member collections */}
              <div className="rounded-xl border border-green-100 dark:border-green-900/40 bg-green-50/40 dark:bg-green-950/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                    <Users className="h-4 w-4 text-green-700 dark:text-green-400" />
                  </div>
                  <p className="text-sm font-semibold text-green-900 dark:text-green-300">Member Collections</p>
                </div>
                <div>
                  <p className="text-xs text-green-700/70 dark:text-green-600">All-time collected</p>
                  <p className="text-xl font-bold text-green-950 dark:text-green-200">{formatSAR(financialSummary.members.collectedAllTime)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white/80 dark:bg-slate-800 rounded-lg p-2 border border-green-100 dark:border-slate-700">
                    <p className="text-green-700/70 dark:text-slate-400">This month</p>
                    <p className="font-bold text-green-900 dark:text-green-300">{formatSAR(financialSummary.members.collectedThisMonth)}</p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-2 border border-orange-100 dark:border-orange-900/40">
                    <p className="text-orange-700/70 dark:text-orange-500">Pending</p>
                    <p className="font-bold text-orange-800 dark:text-orange-400">{formatSAR(financialSummary.members.pendingThisMonth)}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-green-700/70 dark:text-slate-500">
                    <span>Month progress</span>
                    <span>{financialSummary.members.expectedThisMonth > 0 ? Math.round((financialSummary.members.collectedThisMonth / financialSummary.members.expectedThisMonth) * 100) : 0}%</span>
                  </div>
                  <div className="h-1.5 bg-green-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-600 to-green-500 rounded-full"
                      style={{
                        width: financialSummary.members.expectedThisMonth > 0
                          ? `${Math.min(100, Math.round((financialSummary.members.collectedThisMonth / financialSummary.members.expectedThisMonth) * 100))}%`
                          : "0%",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Sponsor collections */}
              <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/30 dark:bg-blue-950/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                    <Handshake className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                  </div>
                  <p className="text-sm font-semibold text-blue-900 dark:text-blue-300">Sponsorship Collections</p>
                </div>
                <div>
                  <p className="text-xs text-blue-700/70 dark:text-blue-600">All-time collected</p>
                  <p className="text-xl font-bold text-blue-950 dark:text-blue-200">{formatSAR(financialSummary.sponsors.collectedAllTime)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white/80 dark:bg-slate-800 rounded-lg p-2 border border-blue-100 dark:border-slate-700">
                    <p className="text-blue-700/70 dark:text-slate-400">Total pledged</p>
                    <p className="font-bold text-blue-900 dark:text-blue-300">{formatSAR(financialSummary.sponsors.pledgedAllTime)}</p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-2 border border-orange-100 dark:border-orange-900/40">
                    <p className="text-orange-700/70 dark:text-orange-500">Outstanding</p>
                    <p className="font-bold text-orange-800 dark:text-orange-400">{formatSAR(financialSummary.sponsors.pendingAllTime)}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-blue-700/70 dark:text-slate-500">
                    <span>Collection rate</span>
                    <span>{financialSummary.sponsors.pledgedAllTime > 0 ? Math.round((financialSummary.sponsors.collectedAllTime / financialSummary.sponsors.pledgedAllTime) * 100) : 0}%</span>
                  </div>
                  <div className="h-1.5 bg-blue-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-600 to-blue-500 rounded-full"
                      style={{
                        width: financialSummary.sponsors.pledgedAllTime > 0
                          ? `${Math.min(100, Math.round((financialSummary.sponsors.collectedAllTime / financialSummary.sponsors.pledgedAllTime) * 100))}%`
                          : "0%",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Combined total */}
              <div className="rounded-xl border border-purple-100 dark:border-purple-900/40 bg-gradient-to-br from-green-50/60 to-blue-50/40 dark:from-green-950/20 dark:to-blue-950/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
                    <Wallet className="h-4 w-4 text-purple-700 dark:text-purple-400" />
                  </div>
                  <p className="text-sm font-semibold text-purple-900 dark:text-purple-300">Total Combined</p>
                </div>
                <div>
                  <p className="text-xs text-purple-700/70 dark:text-purple-600">Grand total all-time</p>
                  <p className="text-xl font-bold text-purple-950 dark:text-purple-200">{formatSAR(financialSummary.combined.collectedAllTime)}</p>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between bg-white/70 dark:bg-slate-800/80 rounded-lg p-2 border border-purple-100 dark:border-slate-700">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                      <span className="text-green-800 dark:text-green-400">Members</span>
                    </div>
                    <span className="font-semibold text-green-900 dark:text-green-300">{formatSAR(financialSummary.members.collectedAllTime)}</span>
                  </div>
                  <div className="flex items-center justify-between bg-white/70 dark:bg-slate-800/80 rounded-lg p-2 border border-purple-100 dark:border-slate-700">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-blue-500" />
                      <span className="text-blue-800 dark:text-blue-400">Sponsors</span>
                    </div>
                    <span className="font-semibold text-blue-900 dark:text-blue-300">{formatSAR(financialSummary.sponsors.collectedAllTime)}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sponsor pipeline */}
      {pipeline && pipeline.totalSponsors > 0 && (
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-lg text-green-950 dark:text-green-100 flex items-center gap-2">
                <Handshake className="h-5 w-5 text-green-700 dark:text-green-400" />
                Sponsor Pipeline
              </CardTitle>
              <CardDescription className="dark:text-slate-400">
                {pipeline.totalSponsors} sponsor{pipeline.totalSponsors === 1 ? "" : "s"} · {formatSAR(pipeline.totalPledged)} pledged
              </CardDescription>
            </div>
            <Link href="/sponsors" className="text-sm text-green-800 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 font-medium inline-flex items-center gap-1">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {(pipeline.overdueCount > 0 || pipeline.upcomingDueCount > 0) && (
              <div className="flex flex-wrap gap-3">
                {pipeline.overdueCount > 0 && (
                  <Link href="/sponsors?status=overdue" className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-400 rounded-xl px-4 py-2 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors">
                    <XCircle className="h-4 w-4 shrink-0" />
                    {pipeline.overdueCount} overdue sponsor{pipeline.overdueCount === 1 ? "" : "s"}
                  </Link>
                )}
                {pipeline.upcomingDueCount > 0 && (
                  <div className="flex items-center gap-2 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/50 text-orange-800 dark:text-orange-400 rounded-xl px-4 py-2 text-sm font-medium">
                    <Clock className="h-4 w-4 shrink-0" />
                    {pipeline.upcomingDueCount} due within 7 days
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-green-700 dark:text-green-400 font-medium">Collected</span>
                  <span className="text-green-950 dark:text-green-200 font-semibold">
                    {formatSAR(pipeline.totalCollected)} / {formatSAR(pipeline.totalPledged)}
                  </span>
                </div>
                <div className="h-2 bg-green-50 dark:bg-slate-700 rounded-full overflow-hidden border border-green-100 dark:border-transparent">
                  <div
                    className="h-full bg-gradient-to-r from-green-600 to-green-500 rounded-full transition-all duration-500"
                    style={{
                      width: pipeline.totalPledged > 0
                        ? `${Math.min(100, Math.round((pipeline.totalCollected / pipeline.totalPledged) * 100))}%`
                        : "0%",
                    }}
                  />
                </div>
                <p className="text-xs text-green-700/70 dark:text-slate-500 mt-1">
                  {pipeline.totalPledged > 0
                    ? `${Math.round((pipeline.totalCollected / pipeline.totalPledged) * 100)}% collected · ${formatSAR(pipeline.totalPending)} pending`
                    : "No pledges yet"}
                </p>
              </div>
            </div>

            {pipeline.tierBreakdown.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(["platinum", "gold", "silver", "bronze"] as const)
                  .map((tier) => pipeline.tierBreakdown.find((b) => b.tier === tier))
                  .filter(Boolean)
                  .map((b) => {
                    const TIER_STYLE: Record<string, string> = {
                      platinum: "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-900/50 text-violet-800 dark:text-violet-300",
                      gold: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900/50 text-yellow-800 dark:text-yellow-300",
                      silver: "bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-900/50 text-sky-700 dark:text-sky-300",
                      bronze: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900/50 text-orange-800 dark:text-orange-300",
                    };
                    const TIER_HOVER: Record<string, string> = {
                      platinum: "hover:border-violet-400 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.97]",
                      gold: "hover:border-yellow-400 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.97]",
                      silver: "hover:border-sky-400 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.97]",
                      bronze: "hover:border-orange-400 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.97]",
                    };
                    return (
                      <Link
                        key={b!.tier}
                        href={`/sponsors?tier=${b!.tier}`}
                        className={`rounded-xl border p-3 text-center cursor-pointer transition-all duration-150 block ${TIER_STYLE[b!.tier] ?? ""} ${TIER_HOVER[b!.tier] ?? ""}`}
                      >
                        <p className="text-xs font-semibold capitalize mb-1">{b!.tier}</p>
                        <p className="text-lg font-bold">{b!.count}</p>
                        <p className="text-xs opacity-70">{formatSAR(b!.collected)}</p>
                      </Link>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
