import { useMemo } from "react";
import { Link } from "wouter";
import type { Member, MemberFrfHistoryItem } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSAR, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { withReturnTo } from "@/lib/navigation";
import { getMembershipFeeAmount } from "@/lib/membership-fee";
import { CheckCircle2, CircleDot, XCircle, MinusCircle, BookOpen, AlertTriangle, Pencil, Trash2, Plus } from "lucide-react";

interface LedgerEntry {
  key: string;
  label: string;
  sub?: string;
  href?: string;
  amountDue: number;
  amountPaid: number;
  status: "paid" | "partial" | "outstanding" | "exempt";
  date?: string | null;
  paymentId?: string;
}

function entryIcon(status: LedgerEntry["status"]) {
  switch (status) {
    case "paid":
      return <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />;
    case "partial":
      return <CircleDot className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />;
    case "exempt":
      return <MinusCircle className="h-4 w-4 text-slate-400 shrink-0" />;
    default:
      return <XCircle className="h-4 w-4 text-red-500 dark:text-red-400 shrink-0" />;
  }
}

/**
 * Bank-statement style ledger for a member: membership fee + FRF case
 * contributions, grouped by year, with partials and an outstanding total.
 */
export function MemberLedger({
  member,
  frfHistory,
  payments,
  onAddPayment,
  onEditPayment,
  onDeletePayment,
  isLoading,
}: {
  member: Member;
  frfHistory: MemberFrfHistoryItem[] | undefined;
  payments?: any[];
  onAddPayment?: () => void;
  onEditPayment?: (payment: any) => void;
  onDeletePayment?: (paymentId: string) => void;
  isLoading?: boolean;
}) {
  const { groups, outstanding, totalOutstanding, totalPaid } = useMemo(() => {
    const entries: LedgerEntry[] = [];

    // Membership fee entry
    const fee = getMembershipFeeAmount(member.membershipFee);
    const fs = member.feeStatus;
    entries.push({
      key: "membership-fee",
      label: "Membership Fee",
      amountDue: ["exempt", "not_applicable", "review"].includes(fs) ? 0 : fee,
      amountPaid: fs === "paid" ? fee : 0, // partial amount for membership fee is not tracked; treated as due
      status: fs === "paid" ? "paid" : fs === "exempt" ? "exempt" : fs === "partial" ? "partial" : "outstanding",
      date: member.feePaidAt ?? null,
      paymentId: payments?.find((p) => p.paymentType === "membership_fee")?.id,
    });

    // FRF contributions — one line per case. Cancelled contributions are not
    // dues, so they are skipped entirely (keeps totals in sync with
    // frfSummary.totalOutstanding, which also excludes cancelled/exempt).
    for (const h of frfHistory ?? []) {
      const raw = String(h.status);
      if (raw === "cancelled") continue;
      const paidAmt = Number(h.amountPaid || 0);
      const status: LedgerEntry["status"] =
        raw === "paid" ? "paid"
        : raw === "exempt" ? "exempt"
        : raw === "partial" || paidAmt > 0 ? "partial"
        : "outstanding"; // pending / overdue / anything else still owing
      entries.push({
        key: h.contributionId,
        label: h.title || `FRF Case`,
        sub: h.claimantName ? `Claimant: ${h.claimantName}` : undefined,
        href: withReturnTo(`/frf/${h.claimId}`),
        amountDue: status === "exempt" ? 0 : Number(h.amount),
        amountPaid: paidAmt,
        status,
        date: h.paidAt ?? null,
        paymentId: payments?.find((p) => p.paymentType === "frf_contribution" && p.frfClaimId === h.claimId)?.id,
      });
    }
    for (const p of payments ?? []) {
      if (p.paymentType === "membership_fee" || p.paymentType === "frf_contribution") continue;
      entries.push({
        key: `payment-${p.id}`,
        paymentId: p.id,
        label: `${String(p.paymentType).replace(/_/g, " ")} payment`,
        sub: p.receiptNumber ? `Receipt ${p.receiptNumber}` : undefined,
        amountDue: Number(p.amountDue || p.amountPaid || 0),
        amountPaid: Number(p.amountPaid || 0),
        status: p.status === "paid" ? "paid" : p.status === "cancelled" || p.status === "refunded" ? "exempt" : "partial",
        date: p.paidAt ?? p.createdAt ?? null,
      });
    }

    // Settled (paid / exempt) entries group by year; anything still owing goes to "Outstanding"
    const byYear = new Map<string, LedgerEntry[]>();
    const owing: LedgerEntry[] = [];
    for (const e of entries) {
      if (e.status === "paid" || e.status === "exempt") {
        const year = e.date ? String(new Date(e.date).getFullYear()) : "Earlier";
        if (!byYear.has(year)) byYear.set(year, []);
        byYear.get(year)!.push(e);
      } else {
        owing.push(e);
      }
    }
    const sortedGroups = Array.from(byYear.entries()).sort((a, b) => {
      if (a[0] === "Earlier") return 1;
      if (b[0] === "Earlier") return -1;
      return Number(b[0]) - Number(a[0]);
    });

    const totOut = owing.reduce((acc, e) => acc + Math.max(0, e.amountDue - e.amountPaid), 0);
    const totPaid = entries.reduce((acc, e) => acc + e.amountPaid, 0);
    return { groups: sortedGroups, outstanding: owing, totalOutstanding: totOut, totalPaid: totPaid };
  }, [member, frfHistory, payments]);

  return (
    <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm" data-testid="card-member-ledger">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-green-700 dark:text-green-400" />
          Payment Ledger
        </CardTitle>
        <CardDescription className="dark:text-slate-400">
          All dues in one statement — membership fee and FRF case contributions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          <>
            {outstanding.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                  <h3 className="text-xs font-bold uppercase tracking-wide text-orange-700 dark:text-orange-400">Outstanding</h3>
                </div>
                <div className="rounded-xl border border-orange-100 dark:border-orange-900/40 divide-y divide-orange-50 dark:divide-slate-800 overflow-hidden">
                      {outstanding.map((e) => <LedgerRow key={e.key} entry={e} payments={payments} onEditPayment={onEditPayment} onDeletePayment={onDeletePayment} />)}
                </div>
              </div>
            )}
            {groups.map(([year, items]) => (
              <div key={year}>
                <h3 className="text-xs font-bold uppercase tracking-wide text-green-700/70 dark:text-slate-500 mb-2">{year}</h3>
                <div className="rounded-xl border border-green-100 dark:border-slate-800 divide-y divide-green-50 dark:divide-slate-800 overflow-hidden">
                  {items.map((e) => <LedgerRow key={e.key} entry={e} payments={payments} onEditPayment={onEditPayment} onDeletePayment={onDeletePayment} />)}
                </div>
              </div>
            ))}
            {outstanding.length === 0 && groups.length === 0 && (
              <p className="text-sm text-green-700/70 dark:text-slate-500 py-4 text-center">No dues or payments recorded yet.</p>
            )}
            <div className="flex flex-wrap gap-x-6 gap-y-1 pt-3 border-t border-green-100 dark:border-slate-800 text-sm">
              <span className="text-green-700/80 dark:text-slate-400">
                Total paid: <strong className="text-emerald-700 dark:text-emerald-300">{formatSAR(totalPaid)}</strong>
              </span>
              <span className="text-green-700/80 dark:text-slate-400">
                Outstanding:{" "}
                <strong className={totalOutstanding > 0 ? "text-orange-700 dark:text-orange-300" : "text-emerald-700 dark:text-emerald-300"}>
                  {formatSAR(totalOutstanding)}
                </strong>
              </span>
            </div>
            {onAddPayment ? <Button size="sm" variant="outline" onClick={onAddPayment}><Plus className="mr-1.5 h-4 w-4" /> Add payment</Button> : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LedgerRow({ entry, payments, onEditPayment, onDeletePayment }: {
  entry: LedgerEntry;
  payments?: any[];
  onEditPayment?: (payment: any) => void;
  onDeletePayment?: (paymentId: string) => void;
}) {
  const remaining = Math.max(0, entry.amountDue - entry.amountPaid);
  const inner = (
    <div className="flex items-start gap-3 px-3 py-2.5 bg-white dark:bg-slate-900" data-testid={`row-ledger-${entry.key}`}>
      <span className="mt-0.5">{entryIcon(entry.status)}</span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium text-green-950 dark:text-slate-200 truncate", entry.href && "group-hover:underline")}>{entry.label}</p>
        {entry.sub && <p className="text-xs text-green-700/60 dark:text-slate-500 truncate">{entry.sub}</p>}
        {entry.status === "partial" && (
          <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">
            Paid {formatSAR(entry.amountPaid)} of {formatSAR(entry.amountDue)} · Outstanding {formatSAR(remaining)}
          </p>
        )}
      </div>
      <div className="text-right shrink-0">
        <p className={cn(
          "text-sm font-semibold tabular-nums",
          entry.status === "paid" ? "text-emerald-700 dark:text-emerald-300"
          : entry.status === "exempt" ? "text-slate-400"
          : entry.status === "partial" ? "text-yellow-700 dark:text-yellow-300"
          : "text-red-600 dark:text-red-400",
        )}>
          {entry.status === "exempt"
            ? entry.amountPaid > 0 ? `Exempt · paid ${formatSAR(entry.amountPaid)}` : "Exempt"
            : entry.status === "outstanding" ? formatSAR(entry.amountDue) : formatSAR(entry.amountPaid)}
        </p>
        <p className="text-[11px] text-green-700/60 dark:text-slate-500">
          {entry.status === "outstanding" ? "due" : entry.date ? formatDate(entry.date) : ""}
        </p>
      </div>
      {entry.paymentId && (onEditPayment || onDeletePayment) ? (
        <div className="flex items-center gap-0.5 shrink-0">
          {onEditPayment ? <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit payment" onClick={(event) => { event.preventDefault(); event.stopPropagation(); const p = payments?.find((item) => item.id === entry.paymentId); if (p) onEditPayment(p); }}><Pencil className="h-3.5 w-3.5" /></Button> : null}
          {onDeletePayment ? <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" title="Delete payment" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onDeletePayment(entry.paymentId!); }}><Trash2 className="h-3.5 w-3.5" /></Button> : null}
        </div>
      ) : null}
    </div>
  );
  return entry.href ? <Link href={entry.href} className="block group">{inner}</Link> : inner;
}
