import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSAR, formatDate } from "@/lib/utils";
import {
  UserPlus, CreditCard, HeartHandshake, Banknote, Award, HandHelping, History,
} from "lucide-react";

type Payment = {
  id: string;
  paymentType: string;
  amountPaid: number;
  paidAt?: string | null;
  createdAt?: string | null;
  receiptNumber?: string | null;
};

type AssistanceItem = {
  id: string;
  category: string;
  status: string;
  amountApproved: number;
  referenceNumber?: string | null;
  date?: string | null;
};

type TimelineEvent = {
  key: string;
  date: string | null;
  title: string;
  detail: string;
  icon: typeof UserPlus;
  colorClass: string;
};

const PAYMENT_LABEL: Record<string, string> = {
  membership_fee: "Membership fee paid",
  frf_contribution: "FRF contribution paid",
};

/** Member journey timeline composed from join date, payments, assistance and committee role. */
export function MemberTimeline({
  member,
  payments,
  assistance,
  isLoading,
}: {
  member: { createdAt?: string; designation?: string | null; fullName: string };
  payments: Payment[] | undefined;
  assistance: AssistanceItem[] | undefined;
  isLoading?: boolean;
}) {
  const events: TimelineEvent[] = useMemo(() => {
    const out: TimelineEvent[] = [];
    if (member.createdAt) {
      out.push({
        key: "joined",
        date: member.createdAt,
        title: "Joined DKMO",
        detail: "Membership created",
        icon: UserPlus,
        colorClass: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
      });
    }
    for (const p of payments ?? []) {
      out.push({
        key: `pay-${p.id}`,
        date: p.paidAt || p.createdAt || null,
        title: PAYMENT_LABEL[p.paymentType] ?? "Payment recorded",
        detail: `${formatSAR(Number(p.amountPaid || 0))}${p.receiptNumber ? ` · Receipt ${p.receiptNumber}` : ""}`,
        icon: CreditCard,
        colorClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
      });
    }
    for (const a of assistance ?? []) {
      const cat = a.category.toLowerCase();
      const isLoan = cat.includes("loan");
      const isFrf = cat.includes("frf") || cat.includes("relief");
      out.push({
        key: `as-${a.category}-${a.id}`,
        date: a.date ?? null,
        title: `${a.category} — ${a.status.replace(/_/g, " ")}`,
        detail: `${formatSAR(a.amountApproved)}${a.referenceNumber ? ` · ${a.referenceNumber}` : ""}`,
        icon: isLoan ? Banknote : isFrf ? HeartHandshake : HandHelping,
        colorClass: isLoan
          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400"
          : isFrf
            ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400"
            : "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400",
      });
    }
    if (member.designation) {
      out.push({
        key: "committee",
        date: null,
        title: `Committee — ${member.designation}`,
        detail: "Currently serving on the committee",
        icon: Award,
        colorClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
      });
    }
    // Newest first; undated events sink to the bottom.
    return out.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [member, payments, assistance]);

  return (
    <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-emerald-900 dark:text-slate-100 flex items-center gap-2">
          <History className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> Activity Timeline
        </CardTitle>
        <CardDescription className="dark:text-slate-400">
          {member.fullName}'s journey with DKMO — membership, payments, assistance and roles.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : events.length === 0 ? (
          <p className="text-sm text-emerald-700 dark:text-slate-400 py-6 text-center">No activity recorded yet.</p>
        ) : (
          <ol className="relative ml-4 border-l border-emerald-200 dark:border-slate-700 space-y-5">
            {events.map((e) => {
              const Icon = e.icon;
              return (
                <li key={e.key} className="relative pl-8" data-testid={`timeline-${e.key}`}>
                  <span className={`absolute -left-[15px] top-0 flex h-[30px] w-[30px] items-center justify-center rounded-full ring-4 ring-white dark:ring-slate-900 ${e.colorClass}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <p className="text-sm font-semibold text-emerald-950 dark:text-slate-100">{e.title}</p>
                  <p className="text-xs text-emerald-700/80 dark:text-slate-400">{e.detail}</p>
                  <p className="text-[11px] text-emerald-600/70 dark:text-slate-500 mt-0.5">
                    {e.date ? formatDate(e.date) : "Ongoing"}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
