import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import {
  Users,
  CreditCard,
  HeartHandshake,
  Landmark,
  HandCoins,
  Wallet,
  Activity,
  BarChart3,
  UserRoundPlus,
  ArrowRight,
} from "lucide-react";

const REPORTS = [
  {
    href: "/reports/membership",
    title: "Membership Report",
    description: "Full member directory — designations, locations, references, and join dates.",
    icon: Users,
    tone: "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30",
  },
  {
    href: "/reports/fees",
    title: "Membership Fee Report",
    description: "Fee status for every member — paid, pending, unpaid, and collections.",
    icon: CreditCard,
    tone: "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30",
  },
  {
    href: "/reports/frf",
    title: "FRF Report",
    description: "Family Relief Fund claims — amounts requested, approved, and collected.",
    icon: HeartHandshake,
    tone: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30",
  },
  {
    href: "/reports/frf-fees",
    title: "FRF Fee Report",
    description: "Per-case FRF fee tracking — SAR 50 per member, paid vs pending, and collections.",
    icon: Wallet,
    tone: "text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/30",
  },
  {
    href: "/reports/loans",
    title: "Loan Report",
    description: "All loans — principal, EMIs paid, status, and disbursement dates.",
    icon: Landmark,
    tone: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30",
  },
  {
    href: "/reports/loan-recovery",
    title: "Top Loan Conveyors",
    description: "Loan recovery leaderboard — loans assigned, recovered, amounts, and recovery rates.",
    icon: HandCoins,
    tone: "text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30",
  },
  {
    href: "/reports/committee-performance",
    title: "Committee Performance Report",
    description: "Per-member committee activity — recruitment, collections, and case handling.",
    icon: Activity,
    tone: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30",
  },
  {
    href: "/reports/financial-summary",
    title: "Financial Summary Report",
    description: "Overall financial position — collections by type, period totals, and outstanding.",
    icon: BarChart3,
    tone: "text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/30",
  },
  {
    href: "/membership-drive",
    title: "Membership Drive Report",
    description: "Referral tracking — top referrers, monthly growth, and downloadable referral reports.",
    icon: UserRoundPlus,
    tone: "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30",
  },
];

export default function Reports() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-emerald-950 dark:text-emerald-100">Reports</h1>
        <p className="text-emerald-700/80 dark:text-slate-400">
          All reporting and exports in one place — every report supports search, filters, date range, PDF, Excel, and print.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map(({ href, title, description, icon: Icon, tone }) => (
          <Link key={href} href={href}>
            <Card
              className="group h-full rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm cursor-pointer transition hover:shadow-md hover:-translate-y-0.5"
              data-testid={`card-report-${href.split("/").pop()}`}
            >
              <CardContent className="pt-5 pb-5 flex flex-col h-full">
                <div className={`inline-flex h-10 w-10 rounded-xl items-center justify-center ${tone} mb-3 shrink-0`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="font-semibold text-emerald-950 dark:text-slate-100">{title}</h2>
                <p className="text-sm text-emerald-700/70 dark:text-slate-400 mt-1 flex-1">{description}</p>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400 mt-3 group-hover:gap-2 transition-all">
                  Open report <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
