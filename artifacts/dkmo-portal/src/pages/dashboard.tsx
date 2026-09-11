import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Activity,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  HeartHandshake,
  Info,
  Landmark,
  ListChecks,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  getGetDashboardAlertsQueryKey,
  getGetDashboardCommandCenterQueryKey,
  useGetDashboardCommandCenter,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ActionRequired } from "@/components/dashboard/ActionRequired";
import { AnimatedNumber } from "@/components/dashboard/AnimatedNumber";
import { DashboardClock } from "@/components/dashboard/DashboardClock";
import { QuickActionsMenu } from "@/components/dashboard/QuickActionsMenu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatSAR } from "@/lib/utils";
import { withReturnTo } from "@/lib/navigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const sectionCard =
  "rounded-[1.35rem] border-[#dbe6df] bg-white/90 shadow-[0_10px_35px_-22px_rgba(31,75,54,0.45)] dark:border-slate-800 dark:bg-slate-900";
const ink = "text-[#18362a] dark:text-slate-100";
const muted = "text-[#6b8177] dark:text-slate-400";

function formatKind(value: string) {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatActivityDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatActivityAction(action: string, entityName: string) {
  const readable = formatKind(action);
  return entityName ? `${entityName} · ${readable}` : readable;
}

function SectionHeading({
  eyebrow,
  title,
  description,
  href,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#bc6a2c]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className={`text-lg font-semibold tracking-tight ${ink}`}>{title}</h2>
        {description ? <p className={`mt-1 text-sm ${muted}`}>{description}</p> : null}
      </div>
      {href && action ? (
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-[#26704d] transition-colors hover:bg-[#edf5ef] hover:text-[#16452f] dark:text-emerald-400 dark:hover:bg-emerald-950/40"
        >
          {action}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

function ProgressBar({ value, tone = "bg-[#26704d]" }: { value: number; tone?: string }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-[#e8eee9] dark:bg-slate-800"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safeValue)}
    >
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${safeValue}%` }} />
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  href,
  icon: Icon,
  tone = "green",
}: {
  label: string;
  value: number | string;
  detail: string;
  href?: string;
  icon: typeof Users;
  tone?: "green" | "orange" | "blue" | "rose";
}) {
  const tones = {
    green: "bg-[#e8f3eb] text-[#26704d] dark:bg-emerald-950/40 dark:text-emerald-300",
    orange: "bg-[#fff1e4] text-[#b65d25] dark:bg-orange-950/40 dark:text-orange-300",
    blue: "bg-[#e9f1f6] text-[#38657c] dark:bg-sky-950/40 dark:text-sky-300",
    rose: "bg-[#f8ebea] text-[#a45151] dark:bg-rose-950/40 dark:text-rose-300",
  };
  const body = (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        {href ? <ChevronRight className={`h-4 w-4 ${muted}`} /> : null}
      </div>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${muted}`}>{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${ink}`}>{value}</p>
      <p className={`mt-1 text-xs ${muted}`}>{detail}</p>
    </>
  );
  return href ? (
    <Link
      href={href}
      className="group rounded-2xl border border-[#e4ece6] bg-[#fbfdfb] p-4 transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-[#bad4c1] hover:shadow-md dark:border-slate-800 dark:bg-slate-950/30"
    >
      {body}
    </Link>
  ) : (
    <div className="rounded-2xl border border-[#e4ece6] bg-[#fbfdfb] p-4 dark:border-slate-800 dark:bg-slate-950/30">
      {body}
    </div>
  );
}

function LoadingDashboard() {
  return (
    <div className="space-y-6" aria-label="Loading command center">
      <div className="rounded-[1.5rem] bg-[#173d2d] p-6">
        <Skeleton className="h-4 w-28 bg-white/15" />
        <Skeleton className="mt-3 h-10 w-72 bg-white/15" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full bg-white/15" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-36 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Skeleton className="h-80 rounded-[1.35rem]" />
        <Skeleton className="h-80 rounded-[1.35rem]" />
      </div>
    </div>
  );
}

function EmptyDashboard({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className={`${sectionCard} border-dashed`}>
      <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf5ef] text-[#26704d] dark:bg-emerald-950/40 dark:text-emerald-300">
          <BarChart3 className="h-7 w-7" />
        </div>
        <h2 className={`text-lg font-semibold ${ink}`}>Command center data is unavailable</h2>
        <p className={`mt-2 max-w-md text-sm ${muted}`}>
          There is no current operating picture to show. Try loading the dashboard again.
        </p>
        <Button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-xl bg-[#26704d] text-white hover:bg-[#1e5d40]"
        >
          Reload dashboard
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { data, isLoading, isError, isFetching, refetch } = useGetDashboardCommandCenter({
    query: {
      queryKey: getGetDashboardCommandCenterQueryKey(),
      refetchInterval: 60_000,
    },
  });
  useEffect(() => {
    if (data) setLastUpdated(new Date());
  }, [data]);

  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
      }).format(new Date()),
    [],
  );

  if (isLoading) return <LoadingDashboard />;
  if (isError || !data) return <EmptyDashboard onRetry={() => void refetch()} />;

  const { membership, referrals, frf, committee, finance, tasks, welfare, documents } = data;
  const hasUpcoming = data.upcoming.length > 0;
  const hasTasks = tasks.items.length > 0;
  const hasActivity = data.recentActivity.length > 0;
  const collectionRate = Math.round(membership.collectionRate);
  const frfCollectionRate = Math.round(frf.collectionPercentage);
  const maxGrowth = Math.max(1, ...membership.growth.map((item) => item.count));
  const refreshDashboard = async () => {
    const result = await refetch();
    await queryClient.invalidateQueries({ queryKey: getGetDashboardAlertsQueryKey() });
    if (result.data) setLastUpdated(new Date());
  };

  return (
    <div className="space-y-7 pb-8">
      <header className="relative overflow-hidden rounded-[1.6rem] bg-[#173d2d] px-5 py-6 text-white shadow-[0_18px_50px_-28px_rgba(23,61,45,0.9)] sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full border-[28px] border-[#d9a15b]/15" />
        <div className="pointer-events-none absolute -bottom-32 right-24 h-72 w-72 rounded-full bg-[#b9d9be]/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.23em] text-[#efc987]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#efc987]" />
              Executive / Committee workspace
            </div>
            <h1 className="max-w-2xl text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
              The operating picture, at a glance.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#d2e2d7]">
              Current operational status and {todayLabel} activity.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <DashboardClock />
            <QuickActionsMenu />
          </div>
        </div>
        <div className="relative mt-7 grid gap-3 border-t border-white/15 pt-4 sm:grid-cols-3">
          <div className="flex items-center gap-2 text-xs text-[#d2e2d7]">
            <ShieldCheck className="h-4 w-4 text-[#efc987]" />
            Current status and operational summary
          </div>
          <div className="flex items-center gap-2 text-xs text-[#d2e2d7]">
            <Clock3 className="h-4 w-4 text-[#efc987]" />
            {lastUpdated
              ? `Last updated ${lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
              : "Updating"}
          </div>
          <div className="flex items-center gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => void refreshDashboard()}
              disabled={isFetching}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/10 disabled:cursor-wait disabled:opacity-70"
              aria-label="Refresh dashboard data"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              {isFetching ? "Refreshing" : "Refresh data"}
            </button>
            <span className="hidden items-center gap-2 text-xs text-[#d2e2d7] sm:inline-flex">
              <Activity className="h-4 w-4 text-[#efc987]" />
              {data.recentActivity.length} recent audit events
            </span>
          </div>
        </div>
      </header>

      <ActionRequired />

      <section aria-labelledby="headline-signals">
        <SectionHeading
          eyebrow="Executive attention"
          title="What needs action now"
          description="Current-state signals for the committee’s next decision."
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Active members"
            value={membership.active}
            detail={`${membership.newThisMonth} new this month · ${membership.inactive} not fee-paid`}
            href="/members"
            icon={Users}
          />
          <Metric
            label="Membership collection"
            value={`${collectionRate}%`}
            detail={`${formatSAR(finance.membershipOutstanding)} outstanding · current balance`}
            href="/payments?view=unpaid"
            icon={Banknote}
            tone="orange"
          />
          <Metric
            label="FRF position"
            value={frf.activeCase ? formatSAR(frf.outstanding) : "No active case"}
            detail={
              frf.activeCase
                ? `${frfCollectionRate}% collected · ${frf.pendingClaims} claims pending`
                : "No active FRF collection case"
            }
            href="/frf"
            icon={HeartHandshake}
            tone="rose"
          />
          <Metric
            label="Work requiring follow-through"
            value={tasks.overdue + tasks.dueToday}
            detail={`${tasks.overdue} overdue · ${tasks.dueThisWeek} due this week`}
            href="/tasks"
            icon={ListChecks}
            tone="blue"
          />
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]" aria-label="Membership and committee overview">
        <Card className={sectionCard}>
          <CardHeader className="pb-3">
            <SectionHeading
              eyebrow="Membership"
              title="Current membership"
              description="Registered members, fee status, approval flow and referral momentum."
              href="/members"
              action="Open members"
            />
          </CardHeader>
          <CardContent className="grid gap-6 pt-0 md:grid-cols-[1fr_0.95fr]">
            <div>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className={`text-4xl font-semibold tracking-tight ${ink}`}>
                    <AnimatedNumber value={membership.total} />
                  </p>
                   <p className={`mt-1 text-sm ${muted}`}>registered members · current total</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-[#26704d] dark:text-emerald-400">
                    {membership.newThisMonth} new
                  </p>
                  <p className={`text-xs ${muted}`}>this month</p>
                </div>
              </div>
              <div className="mt-6">
                <div className="mb-2 flex justify-between text-xs">
                   <span className={muted}>Fee-paid member share</span>
                  <span className={`font-semibold ${ink}`}>
                    {membership.total ? Math.round((membership.active / membership.total) * 100) : 0}%
                  </span>
                </div>
                <ProgressBar
                  value={membership.total ? (membership.active / membership.total) * 100 : 0}
                />
              </div>
              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between">
                  <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${muted}`}>
                     New members · last 12 months
                  </p>
                  <Link href="/members" className="text-xs font-semibold text-[#26704d] hover:underline dark:text-emerald-400">
                    View base
                  </Link>
                </div>
                {membership.growth.some((item) => item.count > 0) ? (
                  <div className="flex h-20 items-end gap-1.5" aria-label="Member growth by month">
                    {membership.growth.map((item) => (
                      <div key={item.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                        <div className="flex h-14 w-full items-end">
                          <div
                            className="w-full rounded-t-md bg-[#8fbd9d] transition-[height] dark:bg-emerald-700"
                            style={{ height: `${Math.max(8, (item.count / maxGrowth) * 100)}%` }}
                            title={`${item.count} members in ${item.month}`}
                          />
                        </div>
                        <span className={`text-[9px] ${muted}`}>{item.month.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyNote text="No member growth recorded in the last 12 months." />
                )}
              </div>
               <div className="mt-5 grid grid-cols-2 gap-3">
                 <MetricMini label="Fee paid" value={membership.paidFees} />
                 <MetricMini label="Fee unpaid" value={membership.unpaidFees} />
                  <MetricMini
                    label="Fee unassessed"
                    value={membership.unassessedFees}
                    tooltip="Unassessed means the membership fee status has not yet been confirmed. It is not counted as unpaid until assessed."
                  />
                 <MetricMini label="Awaiting approval" value={membership.awaitingApproval} />
                 <MetricMini label="Assessed fee collection" value={`${collectionRate}%`} />
              </div>
            </div>
            <div className="border-t border-[#e6eee8] pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0 dark:border-slate-800">
              <p className={`mb-3 text-xs font-semibold uppercase tracking-[0.14em] ${muted}`}>
                 Referral momentum · lifetime
              </p>
              <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-semibold ${ink}`}>{referrals.totalReferred}</span>
                <span className={`text-xs ${muted}`}>members referred</span>
              </div>
              <p className={`mt-1 text-xs ${muted}`}>
                {referrals.activeReferred} active across {referrals.activeReferrers} active referrers
              </p>
              {referrals.topReferrers.length > 0 ? (
                <ul className="mt-5 space-y-3">
                  {referrals.topReferrers.slice(0, 3).map((referrer) => (
                    <li key={referrer.memberId} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`truncate text-sm font-medium ${ink}`}>{referrer.fullName}</p>
                        <p className={`text-xs ${muted}`}>{referrer.membershipId}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-[#edf5ef] px-2 py-1 text-xs font-semibold text-[#26704d] dark:bg-emerald-950/40 dark:text-emerald-300">
                        {referrer.activeCount}/{referrer.count} active
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyNote text="No referral activity recorded." />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className={sectionCard}>
          <CardHeader className="pb-3">
            <SectionHeading
              eyebrow="Committee"
              title="Governance pulse"
              description="Attendance and the next shared decision point."
              href="/committee"
              action="Open committee"
            />
          </CardHeader>
          <CardContent className="space-y-5 pt-0">
            <div className="flex items-center justify-between rounded-2xl bg-[#f4f8f4] p-4 dark:bg-slate-950/45">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#dcecdf] text-[#26704d] dark:bg-emerald-950/50 dark:text-emerald-300">
                  <Users className="h-5 w-5" />
                </span>
                <div>
                  <p className={`text-sm font-semibold ${ink}`}>{committee.memberCount} committee members</p>
                  <p className={`text-xs ${muted}`}>{committee.term ?? "Current committee term"}</p>
                </div>
              </div>
              <Link href="/committee" className="text-xs font-semibold text-[#26704d] hover:underline dark:text-emerald-400">
                Details
              </Link>
            </div>
            {committee.lastMeeting ? (
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${muted}`}>Last meeting</p>
                    <p className={`mt-1 text-sm font-medium ${ink}`}>{committee.lastMeeting.title}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={committee.lastMeeting.attendanceRecorded
                      ? "border-[#b9d8c1] bg-[#f1f8f2] text-[#26704d]"
                      : "border-[#f1cf9f] bg-[#fff8ed] text-[#a45c24]"}
                  >
                    {committee.lastMeeting.attendanceRecorded ? `${Math.round(committee.lastMeeting.attendancePercentage)}% present` : "Attendance pending"}
                  </Badge>
                </div>
                <ProgressBar
                  value={committee.lastMeeting.attendancePercentage}
                  tone="bg-[#4f8a68]"
                />
                <p className={`mt-2 text-xs ${muted}`}>
                  {formatDate(committee.lastMeeting.meetingDate)} · {committee.lastMeeting.present} of{" "}
                  {committee.lastMeeting.eligible} recorded present
                </p>
              </div>
            ) : (
              <EmptyNote text="No committee meeting has been recorded yet." />
            )}
            <div className="border-t border-[#e6eee8] pt-4 dark:border-slate-800">
              <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${muted}`}>Next on the calendar</p>
              {committee.upcomingMeeting ? (
                <Link
                  href="/meetings"
                  className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-[#e1ebe3] p-3 transition-colors hover:border-[#b9d4c0] dark:border-slate-800"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <CalendarDays className="h-4 w-4 shrink-0 text-[#bc6a2c]" />
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-semibold ${ink}`}>{committee.upcomingMeeting.title}</p>
                      <p className={`text-xs ${muted}`}>{formatDate(committee.upcomingMeeting.meetingDate)}</p>
                    </div>
                  </div>
                  <ChevronRight className={`h-4 w-4 shrink-0 ${muted}`} />
                </Link>
              ) : (
                <EmptyNote text="No upcoming committee meeting." />
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]" aria-label="Finance and FRF overview">
        <Card className={sectionCard}>
          <CardHeader className="pb-3">
            <SectionHeading
              eyebrow="Finance"
              title="Cash and commitments"
              description="Where funds are collected, owed and deployed."
              href="/reports"
              action="Open reports"
            />
          </CardHeader>
          <CardContent className="space-y-5 pt-0">
            <FinanceRow
              label="Membership collected · lifetime"
              value={finance.membershipCollected}
              detail={`${formatSAR(finance.membershipOutstanding)} outstanding · current balance`}
              icon={Banknote}
              href="/payments"
              tone="green"
            />
            <FinanceRow
              label="FRF collected · current case"
              value={finance.frfCollected}
              detail={`${formatSAR(finance.frfOutstanding)} outstanding · current case`}
              icon={HeartHandshake}
              href="/frf"
              tone="orange"
            />
            <FinanceRow
              label="Loan book outstanding · current balance"
              value={finance.loanOutstanding}
              detail={`${finance.activeLoans} active loans · ${finance.pendingLoanApplications} applications pending`}
              icon={Landmark}
              href="/loans"
              tone="blue"
            />
            <div className="grid grid-cols-2 gap-3 border-t border-[#e6eee8] pt-4 dark:border-slate-800">
              <div>
                <p className={`text-xs ${muted}`}>Sponsors</p>
                <p className={`mt-1 text-lg font-semibold ${ink}`}>{finance.totalSponsors}</p>
                <p className={`text-[11px] ${muted}`}>{formatSAR(finance.sponsorOutstanding)} outstanding</p>
              </div>
              <div>
                <p className={`text-xs ${muted}`}>Pledged</p>
                <p className={`mt-1 text-lg font-semibold ${ink}`}>{formatSAR(finance.sponsorPledged)}</p>
                <p className={`text-[11px] ${muted}`}>{formatSAR(finance.sponsorCollected)} collected</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={sectionCard}>
          <CardHeader className="pb-3">
            <SectionHeading
              eyebrow="FRF"
              title="FRF — Current Collection Case"
              description={frf.activeCase ? `Approved ${formatDate(frf.activeCase.approvedDate)}` : "Current collection position"}
              href="/frf"
              action="Open FRF"
            />
          </CardHeader>
          <CardContent className="pt-0">
            {frf.activeCase ? (
              <div className="rounded-2xl bg-[#fff8ed] p-4 dark:bg-orange-950/20">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a45c24]">Collected</p>
                    <p className={`mt-1 text-2xl font-semibold ${ink}`}>{formatSAR(frf.collected)}</p>
                  </div>
                  <p className="text-right text-xs text-[#a45c24]">
                    Target
                    <strong className="mt-1 block text-sm">{formatSAR(frf.activeCase.targetAmount)}</strong>
                  </p>
                </div>
                <div className="mt-4">
                  <ProgressBar value={frfCollectionRate} tone="bg-[#d1843d]" />
                  <div className="mt-2 flex justify-between text-xs text-[#a45c24]">
                    <span>{frfCollectionRate}% collected</span>
                    <span>{formatSAR(frf.outstanding)} remaining</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#e8d7c1] bg-[#fffaf3] px-4 py-6 dark:border-orange-900/50 dark:bg-orange-950/15">
                <CircleAlert className="h-5 w-5 text-[#bc6a2c]" />
                <p className={`mt-3 text-sm font-semibold ${ink}`}>No active FRF collection case</p>
                <p className={`mt-1 text-xs ${muted}`}>There is no outstanding active-case amount to collect.</p>
              </div>
            )}
            <div className="mt-5 grid grid-cols-3 gap-3">
              <MetricMini label="Pending claims" value={frf.pendingClaims} />
               <MetricMini label="Eligible contributors" value={frf.eligibleMembers} />
               <MetricMini label="Contributors paid" value={frf.paidMembers} />
               <MetricMini label="Contributors unpaid" value={frf.unpaidMembers} />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]" aria-label="Upcoming work and task queue">
        <Card className={sectionCard}>
          <CardHeader className="pb-3">
            <SectionHeading
              eyebrow="Forward view"
              title="Upcoming work"
              description="Events and meetings already on the operational calendar."
              href="/calendar"
              action="View calendar"
            />
          </CardHeader>
          <CardContent className="pt-0">
            {hasUpcoming ? (
              <div className="divide-y divide-[#e8eee9] dark:divide-slate-800">
                {data.upcoming.slice(0, 5).map((item) => (
                  <Link
                    key={item.id}
                    href={withReturnTo(item.href)}
                    className="group flex items-center gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-[#f3f7f3] text-[#26704d] dark:bg-slate-950/60 dark:text-emerald-300">
                      <span className="text-[10px] font-bold uppercase">{new Date(item.date).toLocaleDateString("en-US", { month: "short" })}</span>
                      <span className="text-sm font-semibold">{new Date(item.date).getDate()}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-semibold ${ink}`}>{item.title}</p>
                      <p className={`mt-0.5 text-xs ${muted}`}>{formatKind(item.kind)} · {formatDate(item.date)}</p>
                    </div>
                    <ChevronRight className={`h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 ${muted}`} />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyNote text="No upcoming work is scheduled." />
            )}
          </CardContent>
        </Card>

        <Card className={sectionCard}>
          <CardHeader className="pb-3">
            <SectionHeading
              eyebrow="Task control"
              title="Follow-through"
              description="A short queue of work that keeps the operation moving."
              href="/tasks"
              action="Open tasks"
            />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <TaskStat label="Overdue" value={tasks.overdue} tone="rose" />
              <TaskStat label="Today" value={tasks.dueToday} tone="orange" />
              <TaskStat label="This week" value={tasks.dueThisWeek} tone="green" />
              <TaskStat label="Completed" value={tasks.recentlyCompleted} tone="blue" />
            </div>
            {hasTasks ? (
              <div className="space-y-2">
                {tasks.items.slice(0, 4).map((task) => (
                  <Link
                    key={task.id}
                    href={withReturnTo(task.href)}
                    className="flex items-center gap-3 rounded-xl border border-[#e7eee9] px-3 py-2.5 transition-colors hover:border-[#bcd8c4] dark:border-slate-800"
                  >
                    <ClipboardCheck className="h-4 w-4 shrink-0 text-[#4f8a68]" />
                    <span className={`min-w-0 flex-1 truncate text-sm ${ink}`}>{task.title}</span>
                    <span className={`shrink-0 text-[11px] ${muted}`}>{formatDate(task.date)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl bg-[#f3f8f4] px-4 py-4 dark:bg-emerald-950/20">
                <CheckCircle2 className="h-5 w-5 text-[#4f8a68]" />
                <p className={`text-sm ${ink}`}>No task items are currently queued.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr_0.9fr]" aria-label="Welfare, documents and recent activity">
        <Card className={sectionCard}>
          <CardHeader className="pb-3">
            <SectionHeading
              eyebrow="Welfare"
              title="Community response"
              description="The human impact behind the operating numbers."
              href="/welfare-programs"
              action="View welfare"
            />
          </CardHeader>
           <CardContent className="pt-0">
             {welfare.activePrograms || welfare.pendingApplications || welfare.activeCases || welfare.beneficiaries || welfare.amountDistributed ? (
               <div className="grid grid-cols-2 gap-3">
                 <ImpactMetric label="Active programs" value={welfare.activePrograms} icon={HeartHandshake} />
                 <ImpactMetric label="Pending applications" value={welfare.pendingApplications} icon={LoaderCircle} />
                 <ImpactMetric label="Active cases" value={welfare.activeCases} icon={Users} />
                 <ImpactMetric label="Beneficiaries" value={welfare.beneficiaries} icon={CheckCircle2} />
                 <div className="col-span-2 flex items-center justify-between rounded-xl border border-[#e6eee8] px-3 py-3 dark:border-slate-800">
                   <span className={`text-xs ${muted}`}>Amount distributed · lifetime</span>
                   <span className={`text-sm font-semibold ${ink}`}>{formatSAR(welfare.amountDistributed)}</span>
                 </div>
               </div>
             ) : (
               <EmptyNote text="No active welfare programs or cases." />
             )}
           </CardContent>
        </Card>

        <Card className={sectionCard}>
          <CardHeader className="pb-3">
            <SectionHeading
              eyebrow="Records"
              title="Document health"
              description="Review and expiry signals across the document room."
              href="/documents"
              action="Open documents"
            />
          </CardHeader>
           <CardContent className="pt-0">
             {documents.pendingReview || documents.expiringSoon || documents.expired ? (
               <div className="space-y-3">
                 <DocumentRow label="Pending review" value={documents.pendingReview} tone="orange" />
                 <DocumentRow label="Expiring soon" value={documents.expiringSoon} tone="blue" />
                 <DocumentRow label="Expired" value={documents.expired} tone="rose" />
                 <div className="mt-5 rounded-xl bg-[#f4f8f4] p-3 dark:bg-slate-950/50">
                   <div className="flex gap-3">
                     <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-[#4f8a68]" />
                     <p className={`text-xs leading-5 ${muted}`}>
                       Keep approvals, versions and expiry dates visible before they become operational blockers.
                     </p>
                   </div>
                 </div>
               </div>
             ) : (
               <EmptyNote text="No documents requiring attention." />
             )}
           </CardContent>
        </Card>

        <Card className={sectionCard}>
          <CardHeader className="pb-3">
            <SectionHeading
              eyebrow="Audit trail"
              title="Recent activity"
              description="Latest changes recorded in the portal."
              href="/audit"
              action="Open audit"
            />
          </CardHeader>
          <CardContent className="pt-0">
            {hasActivity ? (
              <div className="space-y-4">
                {data.recentActivity.slice(0, 5).map((activity) => (
                  <div key={activity.id} className="relative flex gap-3">
                    <div className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#edf5ef] text-[#26704d] dark:bg-emerald-950/40 dark:text-emerald-300">
                      <FileText className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                       <p className={`truncate text-xs font-semibold ${ink}`}>
                         {formatActivityAction(activity.action, activity.entityName)}
                       </p>
                      <p className={`mt-0.5 truncate text-[11px] ${muted}`}>
                         {activity.userName} · {formatKind(activity.module)}
                      </p>
                       <p className={`mt-0.5 truncate text-[10px] ${muted}`}>
                         {formatActivityDate(activity.createdAt)}
                         {activity.details ? ` · ${activity.details}` : ""}
                       </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyNote text="No audit activity has been recorded." />
            )}
          </CardContent>
        </Card>
      </section>

    </div>
  );
}

function MetricMini({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: number | string;
  tooltip?: string;
}) {
  return (
    <div className="rounded-xl bg-[#f4f8f4] px-3 py-2.5 dark:bg-slate-950/45">
      <p className={`flex items-center gap-1 text-[11px] ${muted}`}>
        {label}
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="rounded-full" aria-label={`About ${label}`}>
                <Info className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
          </Tooltip>
        ) : null}
      </p>
      <p className={`mt-1 text-base font-semibold ${ink}`}>{value}</p>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className={`rounded-xl border border-dashed border-[#dce8df] px-3 py-4 text-xs ${muted} dark:border-slate-800`}>{text}</p>;
}

function FinanceRow({
  label,
  value,
  detail,
  icon: Icon,
  href,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  icon: typeof Banknote;
  href: string;
  tone: "green" | "orange" | "blue";
}) {
  const styles = {
    green: "bg-[#e8f3eb] text-[#26704d]",
    orange: "bg-[#fff1e4] text-[#b65d25]",
    blue: "bg-[#e9f1f6] text-[#38657c]",
  };
  return (
    <Link href={href} className="group flex items-center gap-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${styles[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold ${ink}`}>{label}</p>
        <p className={`mt-0.5 truncate text-[11px] ${muted}`}>{detail}</p>
      </div>
      <span className={`shrink-0 text-sm font-semibold ${ink}`}>{formatSAR(value)}</span>
      <ChevronRight className={`h-4 w-4 shrink-0 ${muted} transition-transform group-hover:translate-x-0.5`} />
    </Link>
  );
}

function TaskStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "rose" | "orange" | "green" | "blue";
}) {
  const styles = {
    rose: "text-[#a45151] bg-[#f8ebea]",
    orange: "text-[#a45c24] bg-[#fff1e4]",
    green: "text-[#26704d] bg-[#e8f3eb]",
    blue: "text-[#38657c] bg-[#e9f1f6]",
  };
  return (
    <div className={`rounded-xl px-3 py-2.5 ${styles[tone]}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em]">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function ImpactMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-xl border border-[#e6eee8] p-3 dark:border-slate-800">
      <Icon className="h-4 w-4 text-[#4f8a68]" />
      <p className={`mt-2 text-lg font-semibold ${ink}`}>{value}</p>
      <p className={`text-[11px] ${muted}`}>{label}</p>
    </div>
  );
}

function DocumentRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "orange" | "blue" | "rose";
}) {
  const styles = {
    orange: "bg-[#fff1e4] text-[#b65d25]",
    blue: "bg-[#e9f1f6] text-[#38657c]",
    rose: "bg-[#f8ebea] text-[#a45151]",
  };
  return (
    <Link href="/documents" className="flex items-center gap-3 rounded-xl border border-[#e6eee8] p-3 transition-colors hover:border-[#bcd8c4] dark:border-slate-800">
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${styles[tone]}`}>
        <FileText className="h-4 w-4" />
      </span>
      <span className={`flex-1 text-sm ${ink}`}>{label}</span>
      <span className={`text-lg font-semibold ${ink}`}>{value}</span>
      <ChevronRight className={`h-4 w-4 ${muted}`} />
    </Link>
  );
}