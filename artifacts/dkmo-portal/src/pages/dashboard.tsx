import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useGetDashboardSummary,
  useGetRecentPayments,
  useGetMonthlyCollection,
  useGetPaymentMethodBreakdown,
  useListPayments,
  useListMembers,
  useGetDashboardSponsorPipeline,
  useGetDashboardFinancialSummary,
  useGetDashboardCashFlow,
  useGetFrfMembershipStats,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatSAR, getCurrentMonth, formatDate, formatYearMonth, getCurrentYear } from "@/lib/utils";
import {
  Users,
  TrendingUp,
  AlertCircle,
  Trophy,
  CalendarRange,
  ArrowRight,
  Medal,
  Award,
  Handshake,
  XCircle,
  Clock,
  Wallet,
  Landmark,
  HeartHandshake,
  CalendarDays,
  BookUser,
  ArrowUpCircle,
  ArrowDownCircle,
  Scale,
} from "lucide-react";
import { PaymentMethodIcon } from "@/lib/payment-icons";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useTheme } from "@/lib/theme";

export default function Dashboard() {
  const currentMonth = getCurrentMonth();
  const currentYear = getCurrentYear();
  const [, setLocation] = useLocation();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const today = new Date();
  const fullDateLabel = today.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const todayYear = today.getFullYear();
  const todayQuarter = Math.floor(today.getMonth() / 3) + 1;

  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary({ month: currentMonth });
  const { data: recentPayments, isLoading: isLoadingRecent } = useGetRecentPayments({ limit: 5 });
  const { data: monthlyCollection, isLoading: isLoadingCollection } = useGetMonthlyCollection({ months: 6 });
  const { data: paymentBreakdown, isLoading: isLoadingBreakdown } = useGetPaymentMethodBreakdown({ month: currentMonth });
  const { data: allPayments } = useListPayments();
  const { data: members } = useListMembers();
  const { data: pipeline } = useGetDashboardSponsorPipeline();
  const { data: financialSummary } = useGetDashboardFinancialSummary({ month: currentMonth });
  const { data: cashFlow } = useGetDashboardCashFlow({ year: todayYear, quarter: todayQuarter });
  const { data: frfStats } = useGetFrfMembershipStats();

  const yearToDate = useMemo(() => {
    if (!allPayments) return null;
    return allPayments
      .filter((p) => p.month.startsWith(currentYear))
      .reduce((acc, p) => acc + Number(p.amountPaid), 0);
  }, [allPayments, currentYear]);

  const topContributors = useMemo(() => {
    if (!allPayments) return [];
    const totals = new Map<string, { name: string; membershipId: string; total: number }>();
    for (const p of allPayments) {
      const prev = totals.get(p.memberId) ?? {
        name: p.memberName,
        membershipId: p.membershipId,
        total: 0,
      };
      prev.total += Number(p.amountPaid);
      totals.set(p.memberId, prev);
    }
    return Array.from(totals.entries())
      .map(([memberId, v]) => ({ memberId, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [allPayments]);

  const collectionRate = summary && summary.expectedThisMonth > 0
    ? Math.round((summary.totalCollectedThisMonth / summary.expectedThisMonth) * 100)
    : 0;

  const METHOD_COLORS: Record<string, string> = {
    cash: "#22c55e",
    upi: "#f97316",
    bank_transfer: "#3b82f6",
    card: "#a855f7",
    cheque: "#ef4444",
    other: "#94a3b8",
  };
  const FALLBACK_COLORS = ["#0ea5e9", "#eab308", "#ec4899", "#14b8a6", "#f43f5e", "#8b5cf6"];
  const colorFor = (method: string, index: number) =>
    METHOD_COLORS[method] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];

  const chartAxisColor = isDark ? "#9ca3af" : "#6b7280";
  const chartGridColor = isDark ? "#374151" : "#e5e7eb";
  const chartTooltipStyle = isDark
    ? { backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#f9fafb" }
    : { backgroundColor: "#fff", border: "1px solid #d1fae5", borderRadius: "8px", color: "#1a2e1a" };

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
              <CardTitle className="text-sm font-medium text-green-900 dark:text-slate-300">Collected This Month</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-700 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-green-950 dark:text-green-300">{formatSAR(summary?.totalCollectedThisMonth)}</div>
                  <Progress value={collectionRate} className="mt-2 h-1.5" />
                  <p className="text-xs text-green-700/80 dark:text-slate-500 mt-1">{collectionRate}% of expected</p>
                </>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link href="/pending" className="block group" data-testid="link-summary-pending">
          <Card className="rounded-2xl border-orange-100 dark:border-orange-900/40 dark:bg-slate-900 shadow-sm transition-all duration-200 ease-in-out group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:border-orange-300 group-active:scale-[0.98] cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-orange-900 dark:text-orange-300">Pending Amount</CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{formatSAR(summary?.pendingAmount)}</div>
              )}
              <p className="text-xs text-orange-700/80 dark:text-orange-500/80 mt-1">
                {summary?.unpaidMembersCount || 0} unpaid · {summary?.partialMembersCount || 0} partial
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/reports" className="block group" data-testid="link-summary-ytd">
          <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm transition-all duration-200 ease-in-out group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:border-green-300 dark:group-hover:border-green-700 group-active:scale-[0.98] cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-900 dark:text-slate-300">Year-to-Date {currentYear}</CardTitle>
              <CalendarRange className="h-4 w-4 text-green-700 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              {yearToDate == null ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="text-2xl font-bold text-green-950 dark:text-green-300">{formatSAR(yearToDate)}</div>
              )}
              <p className="text-xs text-green-700/80 dark:text-slate-500 mt-1">All payments this year</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Secondary KPI Row — FRF + Claims + Events */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/frf-membership" className="block group">
          <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:border-green-300 dark:group-hover:border-green-700 group-active:scale-[0.98] cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-900 dark:text-slate-300">FRF Members</CardTitle>
              <BookUser className="h-4 w-4 text-green-700 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              {frfStats == null ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold text-green-950 dark:text-white">{frfStats.total ?? 0}</div>
              )}
              <p className="text-xs text-green-700/80 dark:text-slate-500 mt-1">
                {frfStats?.approved ?? 0} approved · {frfStats?.pending ?? 0} pending
              </p>
            </CardContent>
          </Card>
        </Link>

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
            <CalendarDays className="h-4 w-4 text-blue-600 dark:text-blue-400" />
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
              Q{todayQuarter} · {todayYear}
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

      {/* Cash Flow Widget */}
      {cashFlow && (
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-green-700 dark:text-green-400" />
              Cash Flow Overview
            </CardTitle>
            <CardDescription className="dark:text-slate-400">All-time collection vs welfare disbursements</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50/60 dark:bg-green-950/20 border border-green-100 dark:border-green-900/40">
                <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0">
                  <ArrowUpCircle className="h-5 w-5 text-green-700 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-green-700/70 dark:text-green-600 font-medium">Total Collected</p>
                  <p className="text-xl font-bold text-green-950 dark:text-green-200">{formatSAR(cashFlow.totalCollected)}</p>
                  <p className="text-xs text-green-700/60 dark:text-slate-500">Members + Sponsors</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40">
                <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                  <ArrowDownCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-xs text-red-700/70 dark:text-red-500 font-medium">Total Disbursed</p>
                  <p className="text-xl font-bold text-red-800 dark:text-red-300">{formatSAR(cashFlow.totalDisbursed)}</p>
                  <p className="text-xs text-red-700/60 dark:text-red-600/60">FRF welfare claims</p>
                </div>
              </div>

              <div className={`flex items-center gap-3 p-4 rounded-xl border ${
                (cashFlow.netBalance ?? 0) >= 0
                  ? "bg-blue-50/50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/40"
                  : "bg-orange-50/60 dark:bg-orange-950/20 border-orange-100 dark:border-orange-900/40"
              }`}>
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                  (cashFlow.netBalance ?? 0) >= 0 ? "bg-blue-100 dark:bg-blue-900/40" : "bg-orange-100 dark:bg-orange-900/40"
                }`}>
                  <Scale className={`h-5 w-5 ${(cashFlow.netBalance ?? 0) >= 0 ? "text-blue-700 dark:text-blue-400" : "text-orange-700 dark:text-orange-400"}`} />
                </div>
                <div>
                  <p className={`text-xs font-medium ${(cashFlow.netBalance ?? 0) >= 0 ? "text-blue-700/70 dark:text-blue-500" : "text-orange-700/70 dark:text-orange-500"}`}>
                    Net Balance
                  </p>
                  <p className={`text-xl font-bold ${(cashFlow.netBalance ?? 0) >= 0 ? "text-blue-900 dark:text-blue-200" : "text-orange-800 dark:text-orange-300"}`}>
                    {formatSAR(cashFlow.netBalance)}
                  </p>
                  <p className={`text-xs ${(cashFlow.netBalance ?? 0) >= 0 ? "text-blue-700/60 dark:text-blue-600/60" : "text-orange-700/60 dark:text-orange-600/60"}`}>
                    {(cashFlow.netBalance ?? 0) >= 0 ? "Surplus" : "Deficit"}
                  </p>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            {cashFlow.totalCollected > 0 && (
              <div className="mt-4 space-y-1.5">
                <div className="flex justify-between text-xs text-green-700/70 dark:text-slate-500">
                  <span>Disbursement rate</span>
                  <span>{Math.round((cashFlow.totalDisbursed / cashFlow.totalCollected) * 100)}% of collected</span>
                </div>
                <div className="h-2 bg-green-50 dark:bg-slate-700 rounded-full overflow-hidden border border-green-100 dark:border-transparent">
                  <div
                    className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.round((cashFlow.totalDisbursed / cashFlow.totalCollected) * 100))}%` }}
                  />
                </div>
              </div>
            )}

            {/* Upcoming events preview */}
            {cashFlow.upcomingEvents && cashFlow.upcomingEvents.length > 0 && (
              <div className="mt-4 border-t border-green-100 dark:border-slate-800 pt-4">
                <p className="text-xs font-semibold text-green-900 dark:text-green-400 mb-2 flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" /> Upcoming Events
                </p>
                <div className="space-y-1.5">
                  {cashFlow.upcomingEvents.slice(0, 3).map((ev: any) => (
                    <Link key={ev.id} href={`/events/${ev.id}`} className="flex items-center justify-between text-xs hover:bg-green-50 dark:hover:bg-slate-800 rounded-lg px-2 py-1.5 transition-colors">
                      <span className="font-medium text-green-900 dark:text-slate-300 truncate">{ev.title}</span>
                      <span className="text-green-700/60 dark:text-slate-500 shrink-0 ml-2">
                        {new Date(ev.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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

      {/* Charts row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-full lg:col-span-4 rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-green-950 dark:text-green-100">Collection Trend</CardTitle>
            <CardDescription className="dark:text-slate-400">Last 6 months · click a bar to view that month's report</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            {isLoadingCollection ? (
              <div className="h-[300px] flex items-center justify-center">
                <Skeleton className="h-[250px] w-[90%]" />
              </div>
            ) : (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyCollection || []} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartGridColor} />
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: chartAxisColor, fontSize: 12 }}
                      tickFormatter={formatYearMonth}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: chartAxisColor, fontSize: 12 }}
                      tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatSAR(value), "Collection"]}
                      labelFormatter={(label) => formatYearMonth(String(label))}
                      cursor={{ fill: isDark ? "rgba(34,197,94,0.08)" : "rgba(34,197,94,0.06)" }}
                      contentStyle={chartTooltipStyle}
                    />
                    <Bar
                      dataKey="total"
                      fill={isDark ? "#22c55e" : "hsl(121 65% 24%)"}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={50}
                      cursor="pointer"
                      onClick={(data: any) => {
                        const m = data?.month;
                        if (m) setLocation(`/reports?month=${m}`);
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-full lg:col-span-3 rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-green-950 dark:text-green-100">Payment Methods</CardTitle>
            <CardDescription className="dark:text-slate-400">This month · click a slice to view payments</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingBreakdown ? (
              <div className="h-[300px] flex items-center justify-center">
                <Skeleton className="h-[200px] w-[200px] rounded-full" />
              </div>
            ) : (
              <div className="h-[300px] w-full flex flex-col">
                <div className="flex-1">
                  {(paymentBreakdown || []).length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-green-700/70 dark:text-slate-500">
                      No payments yet this month.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={paymentBreakdown || []}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={2}
                          dataKey="total"
                          nameKey="method"
                          cursor="pointer"
                          onClick={(data: any) => {
                            const method = data?.method ?? data?.payload?.method;
                            setLocation(
                              `/payments?month=${currentMonth}${method ? `&method=${method}` : ""}`,
                            );
                          }}
                        >
                          {(paymentBreakdown || []).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={colorFor(entry.method, index)} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => [formatSAR(value), "Amount"]}
                          contentStyle={chartTooltipStyle}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                  {(paymentBreakdown || []).map((entry, index) => (
                    <div key={entry.method} className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: colorFor(entry.method, index) }} />
                      <span className="capitalize text-green-900 dark:text-slate-300 font-medium">{entry.method.replace("_", " ")}</span>
                      <span className="text-green-700/70 dark:text-slate-500 ml-auto">({entry.count})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top contributors + recent payments */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-full lg:col-span-3 rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-lg text-green-950 dark:text-green-100">Top Contributors</CardTitle>
              <CardDescription className="dark:text-slate-400">By total amount paid · click trophy for full leaderboard</CardDescription>
            </div>
            <Link
              href="/top-contributors"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 dark:bg-orange-950/40 ring-1 ring-orange-200 dark:ring-orange-800/50 hover:bg-orange-100 dark:hover:bg-orange-900/40 hover:ring-orange-300 transition-colors group"
              data-testid="link-top-contributors"
              title="View full leaderboard"
            >
              <Trophy className="h-5 w-5 text-orange-500 group-hover:scale-110 transition-transform" />
            </Link>
          </CardHeader>
          <CardContent>
            {topContributors.length === 0 ? (
              <p className="text-sm text-green-700/70 dark:text-slate-500 text-center py-6">No contributions yet.</p>
            ) : (
              <div className="space-y-4">
                {topContributors.map((c, i) => {
                  const max = topContributors[0]?.total || 1;
                  const pct = Math.round((c.total / max) * 100);
                  const RankMedal = i === 0 ? Trophy : i === 1 ? Medal : i === 2 ? Award : null;
                  const medalColor = i === 0 ? "text-orange-500" : i === 1 ? "text-green-500" : i === 2 ? "text-amber-500" : "";
                  return (
                    <Link key={c.memberId} href={`/members/${c.memberId}`} className="block group">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                          i === 0 ? "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 ring-2 ring-orange-200 dark:ring-orange-800/50"
                          : i === 1 ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 ring-2 ring-green-200 dark:ring-green-800/50"
                          : i === 2 ? "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 ring-2 ring-amber-200 dark:ring-amber-800/50"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400"
                        }`}>
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {RankMedal && <RankMedal className={`h-4 w-4 shrink-0 ${medalColor}`} />}
                              <p className="text-sm font-semibold text-green-950 dark:text-slate-200 truncate group-hover:underline">{c.name}</p>
                            </div>
                            <p className="text-sm font-bold text-green-900 dark:text-green-300 shrink-0">{formatSAR(c.total)}</p>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="text-xs text-green-700/80 dark:text-slate-500">{c.membershipId}</div>
                            <div className="flex-1 h-1.5 bg-green-50 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-green-700 to-orange-400" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
                <Link
                  href="/top-contributors"
                  className="block text-center text-sm font-medium text-orange-700 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300 pt-2 border-t border-green-50 dark:border-slate-800"
                  data-testid="link-view-full-leaderboard"
                >
                  View full leaderboard <ArrowRight className="h-3.5 w-3.5 inline" />
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-full lg:col-span-4 rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-lg text-green-950 dark:text-green-100">Recent Payments</CardTitle>
              <CardDescription className="dark:text-slate-400">Latest 5 contributions</CardDescription>
            </div>
            <Link href="/payments" className="text-sm text-green-800 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 font-medium inline-flex items-center gap-1">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {isLoadingRecent ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-[150px]" />
                        <Skeleton className="h-3 w-[100px]" />
                      </div>
                    </div>
                    <Skeleton className="h-5 w-[80px]" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {(recentPayments || []).map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between border-b border-green-50 dark:border-slate-800 last:border-0 pb-3 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 dark:bg-slate-800 text-green-800 dark:text-green-400 border border-green-100 dark:border-slate-700">
                        <PaymentMethodIcon method={payment.paymentMethod} className="h-5 w-5" />
                      </div>
                      <div>
                        <Link
                          href={`/members/${payment.memberId}`}
                          className="text-sm font-semibold text-green-950 dark:text-slate-200 hover:text-green-700 dark:hover:text-green-300 hover:underline"
                          data-testid={`link-recent-payment-member-${payment.memberId}`}
                        >
                          {payment.memberName}
                        </Link>
                        <p className="text-xs text-green-700/80 dark:text-slate-500">
                          {payment.membershipId} · {formatYearMonth(payment.month)} · {formatDate(payment.paidAt)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-green-900 dark:text-green-300">{formatSAR(payment.amountPaid)}</p>
                      <p className="text-xs text-green-700/80 dark:text-slate-500 capitalize">{payment.paymentMethod.replace("_", " ")}</p>
                    </div>
                  </div>
                ))}
                {recentPayments?.length === 0 && (
                  <p className="text-sm text-green-700/70 dark:text-slate-500 text-center py-4">No recent payments.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
