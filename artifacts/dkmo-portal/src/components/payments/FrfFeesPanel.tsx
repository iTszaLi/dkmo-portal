import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListFrfClaims,
  useGetFrfClaimCollection,
  useListPendingFrfFees,
  useCreatePayment,
  useUpdateFrfContributionStatus,
  getFrfClaimCollection,
  getGetFrfClaimCollectionQueryKey,
  getListPendingFrfFeesQueryKey,
  getListPaymentsQueryKey,
  useGetMemberFrfSummary,
  type FrfContributor,
  type PendingFrfFee,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQueryClient, useQueries } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { normalizeWhatsAppNumber, buildWhatsAppLink, type WhatsAppTarget } from "@/lib/whatsapp";
import { WhatsAppBulkDialog } from "@/components/WhatsAppBulkDialog";
import { useToast } from "@/hooks/use-toast";
import { Send, MessageSquareWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, UserCircle, HeartHandshake, FileDown, FileSpreadsheet, CheckCircle2, Clock, MinusCircle, XCircle, MoreHorizontal, History, ExternalLink } from "lucide-react";
import { formatSAR, formatDate, cn } from "@/lib/utils";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

async function loadImageAsBase64(url: string): Promise<string> {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

const STATUS_LABEL: Record<string, string> = {
  paid: "Paid",
  partial: "Unpaid",
  pending: "Unpaid",
  overdue: "Unpaid",
  cancelled: "Cancelled",
  exempt: "Exempt",
};

function frfStatusBadge(status: string) {
  const styles: Record<string, string> = {
    paid: "bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-300",
    partial: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300",
    pending: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300",
    overdue: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300",
    cancelled: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400",
    exempt: "bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300",
  };
  const icon =
    status === "paid" ? <CheckCircle2 className="h-3 w-3" /> :
    status === "exempt" ? <MinusCircle className="h-3 w-3" /> :
    status === "pending" || status === "partial" || status === "overdue" ? <Clock className="h-3 w-3" /> :
    <XCircle className="h-3 w-3" />;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold", styles[status] ?? "bg-slate-100 text-slate-700")}>
      {icon}
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

type FeeFilter = "all" | "paid" | "pending" | "overdue";

/** Per-member FRF history dialog: one row per case, plus a logo-headed PDF statement. */
function FrfMemberHistoryDialog({
  memberId,
  memberName,
  membershipIdText,
  onClose,
}: {
  memberId: string | null;
  memberName: string;
  membershipIdText: string;
  onClose: () => void;
}) {
  // Generated hook already disables itself while the id is empty.
  const { data: summary, isLoading } = useGetMemberFrfSummary(memberId ?? "");

  const handlePdf = async () => {
    if (!summary) return;
    const logo = await loadImageAsBase64(`${basePath}/logo-circle.png`);
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    if (logo) doc.addImage(logo, "PNG", 14, 10, 22, 22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(6, 78, 59);
    doc.text("Dakshina Karnataka Muslim Okkoota (DKMO)", 40, 18);
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    doc.text("FRF Contribution Statement", 40, 25);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Member: ${memberName}   ·   ID: ${membershipIdText}`, 14, 40);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageW - 14, 40, { align: "right" });

    autoTable(doc, {
      startY: 46,
      head: [["FRF Case", "Type", "Fee", "Paid", "Status", "Paid On", "Receipt"]],
      body: summary.history.map((h) => [
        h.title || h.claimantName,
        h.claimType.replace(/_/g, " "),
        formatSAR(h.amount),
        formatSAR(h.amountPaid),
        STATUS_LABEL[h.status] ?? h.status,
        h.paidAt ? formatDate(h.paidAt) : "—",
        h.receiptNumber || "—",
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [6, 95, 70] },
    });

    let endY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 60;
    if (endY + 20 > doc.internal.pageSize.getHeight()) {
      doc.addPage();
      endY = 10;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(6, 78, 59);
    doc.text(
      `Cases paid: ${summary.casesPaid} of ${summary.totalClaims}   ·   Total contributed: ${formatSAR(summary.totalPaid)}   ·   Outstanding: ${formatSAR(summary.totalOutstanding)}`,
      14,
      endY + 10,
    );
    doc.save(`FRF-Statement-${membershipIdText || memberName}.pdf`);
  };

  return (
    <Dialog open={!!memberId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto dark:bg-slate-900 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <History className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            FRF History — {memberName}
          </DialogTitle>
        </DialogHeader>
        {isLoading || !summary ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-emerald-100 dark:border-slate-800 bg-emerald-50/60 dark:bg-slate-800/60 p-3 text-center">
                <p className="text-xl font-bold text-emerald-800 dark:text-emerald-300">{summary.casesPaid}<span className="text-sm font-medium text-emerald-600/70 dark:text-slate-400"> / {summary.totalClaims}</span></p>
                <p className="text-[11px] text-emerald-700/70 dark:text-slate-400">Cases paid</p>
              </div>
              <div className="rounded-xl border border-emerald-100 dark:border-slate-800 bg-emerald-50/60 dark:bg-slate-800/60 p-3 text-center">
                <p className="text-xl font-bold text-emerald-800 dark:text-emerald-300">{formatSAR(summary.totalPaid)}</p>
                <p className="text-[11px] text-emerald-700/70 dark:text-slate-400">Total contributed</p>
              </div>
              <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-slate-800/60 p-3 text-center">
                <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{formatSAR(summary.totalOutstanding)}</p>
                <p className="text-[11px] text-amber-700/70 dark:text-slate-400">Outstanding</p>
              </div>
            </div>
            {summary.history.length === 0 ? (
              <p className="text-sm text-emerald-700/70 dark:text-slate-400 text-center py-6">No FRF cases recorded for this member yet.</p>
            ) : (
              <div className="rounded-xl border border-emerald-100 dark:border-slate-800 overflow-hidden">
                <Table>
                  <TableHeader className="bg-emerald-50/50 dark:bg-slate-800/60">
                    <TableRow className="dark:border-slate-700">
                      <TableHead className="text-emerald-900 dark:text-slate-300">FRF Case</TableHead>
                      <TableHead className="text-emerald-900 dark:text-slate-300 text-right">Fee</TableHead>
                      <TableHead className="text-emerald-900 dark:text-slate-300 text-right">Paid</TableHead>
                      <TableHead className="text-emerald-900 dark:text-slate-300">Status</TableHead>
                      <TableHead className="text-emerald-900 dark:text-slate-300">Paid On</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.history.map((h) => (
                      <TableRow key={h.contributionId} className="dark:border-slate-800">
                        <TableCell className="text-sm text-emerald-950 dark:text-slate-200 max-w-[220px] truncate">{h.title || h.claimantName}</TableCell>
                        <TableCell className="text-right text-sm font-semibold text-emerald-900 dark:text-green-300">{formatSAR(h.amount)}</TableCell>
                        <TableCell className="text-right text-sm text-emerald-800 dark:text-slate-300">{formatSAR(h.amountPaid)}</TableCell>
                        <TableCell>{frfStatusBadge(h.status)}</TableCell>
                        <TableCell className="text-sm text-emerald-700 dark:text-slate-400">{h.paidAt ? formatDate(h.paidAt) : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" asChild className="dark:border-slate-700 dark:text-slate-300">
                <Link href={`/members/${memberId}`}>
                  <ExternalLink className="mr-1.5 h-4 w-4" /> Full Profile
                </Link>
              </Button>
              <Button onClick={handlePdf} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="button-frf-history-pdf">
                <FileDown className="mr-1.5 h-4 w-4" /> Download PDF
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function buildFrfReminderMessage(fee: PendingFrfFee): string {
  return `Assalamu Alaikum ${fee.fullName},\n\nThis is a gentle reminder from DKMO (Dakshina Karnataka Muslim Ookota — Committed to the Community). Your FRF fee of ${formatSAR(fee.balance)} for the case "${fee.caseTitle}" is currently ${fee.status}.\n\nPlease complete the payment at your earliest convenience.\n\nJazakallah Khair.`;
}

function toFrfWhatsAppTargets(fees: PendingFrfFee[]): WhatsAppTarget[] {
  return fees.flatMap((f) => {
    const number = normalizeWhatsAppNumber(f.mobileNumber);
    return number ? [{ id: f.contributionId, name: f.fullName, number, message: buildFrfReminderMessage(f) }] : [];
  });
}

export default function FrfFeesPanel({ initialFeeFilter }: { initialFeeFilter?: FeeFilter }) {
  const [caseId, setCaseId] = useState("");
  const [search, setSearch] = useState("");
  const [feeFilter, setFeeFilter] = useState<FeeFilter>(initialFeeFilter ?? "all");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTargets, setBulkTargets] = useState<WhatsAppTarget[]>([]);
  const [historyMember, setHistoryMember] = useState<{ id: string; name: string; membershipId: string } | null>(null);
  const { toast } = useToast();
  const { data: pendingFrf } = useListPendingFrfFees();

  const handleRemindAllPending = () => {
    if (remindableFees.length === 0) return;
    const targets = toFrfWhatsAppTargets(remindableFees);
    if (targets.length === 0) {
      toast({ title: "No valid mobile numbers", description: "None of these members have a WhatsApp-capable number.", variant: "destructive" });
      return;
    }
    setBulkTargets(targets);
    setBulkOpen(true);
  };

  const handleRemindOne = (fee: PendingFrfFee) => {
    const number = normalizeWhatsAppNumber(fee.mobileNumber);
    if (!number) {
      toast({ title: "Cannot send reminder", description: "Member has no valid mobile number", variant: "destructive" });
      return;
    }
    window.open(buildWhatsAppLink(number, buildFrfReminderMessage(fee)), "_blank", "noopener");
  };
  const queryClient = useQueryClient();
  const refreshFees = () => {
    queryClient.invalidateQueries({ queryKey: getListPendingFrfFeesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey() });
    // Keep the per-member FRF history dialog fresh after Mark Paid / Exempt.
    queryClient.invalidateQueries({
      predicate: (q) => q.queryKey.some((k) => typeof k === "string" && k.includes("/frf-summary")),
    });
    // Refresh every case ledger so the "All FRF Cases" totals stay accurate too.
    queryClient.invalidateQueries({
      predicate: (q) => q.queryKey.some((k) => typeof k === "string" && k.includes("/frf/claims/") && k.endsWith("/collection")),
    });
    if (caseId && caseId !== "__all__") queryClient.invalidateQueries({ queryKey: getGetFrfClaimCollectionQueryKey(caseId) });
  };

  // Mark Paid records a real payment: receipt number and paid-on date are
  // auto-generated by the portal, and the fee ledger syncs automatically.
  const createPayment = useCreatePayment({
    mutation: {
      onSuccess: (p) => { refreshFees(); toast({ title: "FRF fee marked paid", description: `Receipt ${p.receiptNumber} generated automatically.` }); },
      onError: (e) => toast({ title: "Could not record payment", description: String(e), variant: "destructive" }),
    },
  });
  const statusMutation = useUpdateFrfContributionStatus({
    mutation: {
      onSuccess: () => { refreshFees(); toast({ title: "Fee status updated" }); },
      onError: (e) => toast({ title: "Could not update status", description: String(e), variant: "destructive" }),
    },
  });

  const autoReceiptNumber = () => {
    const d = new Date();
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
    return `DKMO-FRF-${ym}-${String(Date.now()).slice(-6)}`;
  };

  const handleMarkPaid = (row: { memberId: string; claimId: string; amount: number; balance: number; caseTitle: string }) => {
    createPayment.mutate({
      data: {
        memberId: row.memberId,
        paymentType: "frf_contribution",
        frfClaimId: row.claimId,
        amountDue: row.amount,
        amountPaid: row.balance > 0 ? row.balance : row.amount,
        status: "paid",
        paymentMethod: "cash",
        receiptNumber: autoReceiptNumber(),
        notes: `FRF contribution — ${row.caseTitle}`,
      } as any,
    });
  };

  // Pending FRF fees keyed by contribution id so table rows can offer a Remind action.
  const pendingByContribution = useMemo(() => {
    const map = new Map<string, PendingFrfFee>();
    for (const f of pendingFrf ?? []) map.set(f.contributionId, f);
    return map;
  }, [pendingFrf]);

  const { data: claimsData = [], isLoading: claimsLoading } = useListFrfClaims();

  // Only collecting cases have fee ledgers: the active (approved) case and
  // completed (disbursed) history. Claims still in review have no fees yet.
  const cases = useMemo(() => {
    const list = claimsData.filter(
      (c) => (c.title ?? "").trim() !== "" && (c.status === "approved" || c.status === "disbursed"),
    );
    return [...list].sort((a, b) => {
      if (a.status !== b.status) return a.status === "approved" ? -1 : 1; // active case first
      return (a.title ?? "").localeCompare(b.title ?? "");
    });
  }, [claimsData]);

  const ALL_CASES = "__all__";
  const allMode = caseId === ALL_CASES;

  useEffect(() => {
    if (cases.length === 0) return;
    // Default to the active case; also recover if a non-collecting case id was set.
    if (!caseId || (caseId !== ALL_CASES && !cases.some((c) => c.id === caseId))) setCaseId(cases[0]!.id);
  }, [cases, caseId]);

  const { data: collection, isLoading: collectionLoading } = useGetFrfClaimCollection(caseId, {
    query: { queryKey: getGetFrfClaimCollectionQueryKey(caseId), enabled: caseId !== "" && !allMode },
  });

  // "All FRF Cases" view: load every collecting case's ledger and combine the
  // fees per member (e.g. SAR 50 + SAR 50 across two cases = SAR 100).
  const allCollections = useQueries({
    queries: cases.map((c) => ({
      queryKey: getGetFrfClaimCollectionQueryKey(c.id),
      queryFn: () => getFrfClaimCollection(c.id),
      enabled: allMode,
    })),
  });

  type AggContributor = FrfContributor & { casesTotal: number; casesPaid: number; hasOverdue: boolean };
  const aggContributors = useMemo<AggContributor[]>(() => {
    if (!allMode) return [];
    const byMember = new Map<string, AggContributor>();
    for (const q of allCollections) {
      for (const c of q.data?.contributors ?? []) {
        if (c.status === "cancelled" || c.status === "exempt") continue;
        const prev = byMember.get(c.memberId);
        if (!prev) {
          byMember.set(c.memberId, { ...c, casesTotal: 1, casesPaid: c.status === "paid" ? 1 : 0, hasOverdue: c.status === "overdue" });
        } else {
          prev.amount += c.amount;
          prev.amountPaid += c.amountPaid;
          prev.balance += c.balance;
          prev.casesTotal += 1;
          if (c.status === "paid") prev.casesPaid += 1;
          if (c.status === "overdue") prev.hasOverdue = true;
          if (c.paidAt && (!prev.paidAt || c.paidAt > prev.paidAt)) prev.paidAt = c.paidAt;
          prev.receiptNumber = null; // multiple receipts — shown per case, not aggregated
        }
      }
    }
    return [...byMember.values()]
      .map((m) => ({
        ...m,
        // Overdue on any underlying case wins (unless fully paid), so the
        // Overdue card/filter still works in the all-cases view.
        status: (m.casesPaid === m.casesTotal ? "paid" : m.hasOverdue ? "overdue" : m.amountPaid > 0 ? "partial" : "pending") as FrfContributor["status"],
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [allMode, allCollections]);

  const isLoading = claimsLoading || (allMode ? allCollections.some((q) => q.isLoading) : caseId !== "" && collectionLoading);

  const caseTitle = allMode ? "All FRF Cases" : cases.find((c) => c.id === caseId)?.title || "FRF Case";
  const contributors = useMemo<FrfContributor[]>(
    () => (allMode ? aggContributors : collection?.contributors ?? []),
    [allMode, aggContributors, collection],
  );

  // The Pending status view always shows ALL cases (same list as FRF Reminders),
  // so both modules stay identical. Other views show the selected case's ledger.
  const pendingView = feeFilter === "pending";
  type Row = FrfContributor & { caseTitle: string; claimId: string };

  const filtered = useMemo<Row[]>(() => {
    const q = search.trim().toLowerCase();
    const matches = (name: string, membershipId: string) =>
      !q || name.toLowerCase().includes(q) || membershipId.toLowerCase().includes(q);
    // Unpaid view now follows the selected case too (dropdown stays editable):
    // it simply narrows the ledger to members who still owe on that case.
    return contributors
      .filter((c) => {
        if (feeFilter === "paid" && c.status !== "paid") return false;
        if (feeFilter === "overdue" && c.status !== "overdue") return false;
        if (pendingView && !(c.status === "pending" || c.status === "overdue" || c.status === "partial")) return false;
        return matches(c.fullName, c.membershipId);
      })
      .map((c) => {
        const agg = c as Partial<AggContributor>;
        return {
          ...c,
          caseTitle: allMode ? `All cases — paid ${agg.casesPaid ?? 0} of ${agg.casesTotal ?? 0}` : caseTitle,
          claimId: allMode ? "" : caseId,
        };
      });
  }, [contributors, search, feeFilter, pendingView, pendingFrf, caseTitle, caseId, allMode]);

  // Bulk reminders always match what the table shows: in Unpaid view only
  // the visible rows that actually have a pending fee entry are targeted.
  const remindableFees = useMemo<PendingFrfFee[]>(() => {
    const fees = pendingFrf ?? [];
    if (feeFilter !== "pending" && feeFilter !== "overdue") return fees;
    const visible = new Set(filtered.map((r) => r.contributionId));
    return fees.filter((f) => visible.has(f.contributionId));
  }, [pendingFrf, feeFilter, filtered]);

  // Case-level stats (full ledger, cancelled/exempt excluded).
  const stats = useMemo(() => {
    const eligible = contributors.filter((c) => c.status !== "cancelled" && c.status !== "exempt");
    const paid = eligible.filter((c) => c.status === "paid").length;
    const overdue = eligible.filter((c) => c.status === "overdue").length;
    const unpaid = eligible.length - paid - overdue; // pending / partial — not yet past due
    const collected = eligible.reduce((a, c) => a + c.amountPaid, 0);
    const pendingAmount = eligible.reduce((a, c) => a + Math.max(c.amount - c.amountPaid, 0), 0);
    return { participants: eligible.length, paid, unpaid, overdue, collected, pendingAmount };
  }, [contributors]);

  // Export scope: totals must match the exported (filtered) rows.
  const exportStats = useMemo(() => {
    const eligible = filtered.filter((c) => c.status !== "cancelled" && c.status !== "exempt");
    const paid = eligible.filter((c) => c.status === "paid").length;
    const collected = eligible.reduce((a, c) => a + c.amountPaid, 0);
    return { members: filtered.length, paid, pending: eligible.length - paid, collected };
  }, [filtered]);

  const hasFilters = search.trim() !== "" || feeFilter !== "all";

  const generatedOn = () =>
    new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  const exportPDF = async () => {
    if (filtered.length === 0) return;
    const doc = new jsPDF({ orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();
    const green: [number, number, number] = [5, 150, 105];
    const logoDataUrl = await loadImageAsBase64(`${basePath}/logo-circle.png`);

    doc.setFillColor(...green);
    doc.rect(0, 0, pageW, 28, "F");
    if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", 6, 4, 20, 20);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Dakshina Karnataka Muslim Ookota", pageW / 2, 11, { align: "center" });
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`FRF Fees — ${pendingView ? `Unpaid · ${caseTitle}` : caseTitle}`, pageW / 2, 19, { align: "center" });

    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.text(
      `Generated: ${generatedOn()}${hasFilters ? "   |   Filtered view" : ""}   |   Members Listed: ${exportStats.members}   |   Paid: ${exportStats.paid}   |   Unpaid: ${exportStats.pending}   |   Collected: ${formatSAR(exportStats.collected)}`,
      pageW / 2, 35, { align: "center" },
    );

    autoTable(doc, {
      startY: 42,
      head: [["#", "Member Name", "Membership No.", "Responsible", "FRF Case", "Fee Status", "Amount (SAR)", "Paid (SAR)", "Payment Date", "Receipt No."]],
      body: filtered.map((c, i) => [
        String(i + 1), c.fullName, c.membershipId, c.refMemberName || "—", c.caseTitle,
        STATUS_LABEL[c.status] ?? c.status, c.amount.toFixed(2), c.amountPaid.toFixed(2),
        c.paidAt ? formatDate(c.paidAt) : "—", c.receiptNumber || "—",
      ]),
      theme: "grid",
      headStyles: { fillColor: green, fontStyle: "bold", fontSize: 8, halign: "center" },
      bodyStyles: { fontSize: 7.5 },
      columnStyles: { 0: { halign: "center", cellWidth: 10 }, 5: { halign: "center" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "center" } },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(7.5);
    doc.setTextColor(130, 130, 130);
    doc.text("FRF Fee is SAR 50 per member per case — separate from the one-time SAR 100 Membership Fee.", pageW / 2, finalY, { align: "center" });
    doc.text("Confidential — For internal use only", pageW / 2, finalY + 5, { align: "center" });
    doc.save(`DKMO_FRF_Fees_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const exportExcel = async () => {
    if (filtered.length === 0) return;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "DKMO Portal";
    const sheet = workbook.addWorksheet("FRF Fees");

    sheet.mergeCells("A1:J1");
    sheet.getCell("A1").value = "Dakshina Karnataka Muslim Ookota (DKMO)";
    sheet.getCell("A1").font = { bold: true, size: 14 };
    sheet.getCell("A1").alignment = { horizontal: "center" };
    sheet.mergeCells("A2:J2");
    sheet.getCell("A2").value = `FRF Fees — ${pendingView ? `Unpaid · ${caseTitle}` : caseTitle}`;
    sheet.getCell("A2").font = { bold: true, size: 11, color: { argb: "FF059669" } };
    sheet.getCell("A2").alignment = { horizontal: "center" };
    sheet.mergeCells("A3:J3");
    sheet.getCell("A3").value = `Generated: ${generatedOn()}${hasFilters ? "  |  Filtered view" : ""}  |  Members Listed: ${exportStats.members}  |  Paid: ${exportStats.paid}  |  Unpaid: ${exportStats.pending}  |  Collected: ${formatSAR(exportStats.collected)}`;
    sheet.getCell("A3").font = { size: 9, color: { argb: "FF6B7280" } };
    sheet.getCell("A3").alignment = { horizontal: "center" };
    sheet.addRow([]);

    const headerRow = sheet.addRow(["#", "Member Name", "Membership No.", "Responsible", "FRF Case", "Fee Status", "Amount (SAR)", "Paid (SAR)", "Payment Date", "Receipt No."]);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } };
      cell.alignment = { horizontal: "center" };
      cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    });
    filtered.forEach((c, i) => {
      const row = sheet.addRow([
        i + 1, c.fullName, c.membershipId, c.refMemberName || "—", c.caseTitle,
        STATUS_LABEL[c.status] ?? c.status, Number(c.amount.toFixed(2)), Number(c.amountPaid.toFixed(2)),
        c.paidAt ? formatDate(c.paidAt) : "—", c.receiptNumber || "—",
      ]);
      row.eachCell((cell) => {
        cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
      });
    });
    const totalsRow = sheet.addRow(["", "TOTALS", "", "", "", `${exportStats.paid} paid / ${exportStats.pending} unpaid`, "", Number(exportStats.collected.toFixed(2)), "", ""]);
    totalsRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
      cell.border = { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "thin" }, right: { style: "thin" } };
    });
    sheet.columns = [
      { width: 5 }, { width: 26 }, { width: 16 }, { width: 22 }, { width: 28 }, { width: 12 },
      { width: 14 }, { width: 12 }, { width: 16 }, { width: 16 },
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DKMO_FRF_Fees_${new Date().toISOString().split("T")[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <WhatsAppBulkDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        targets={bulkTargets}
        title="FRF Fee Reminders"
      />
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-emerald-100 dark:border-slate-800 bg-emerald-50/50 dark:bg-slate-900 p-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 shrink-0">
          <HeartHandshake className="h-5 w-5" />
        </div>
        <div className="text-sm flex-1">
          <p className="font-semibold text-emerald-900 dark:text-slate-200">Family Relief Fund (FRF) fees — SAR 50 per member per case</p>
          <p className="text-emerald-700/80 dark:text-slate-400">
            Tracked per FRF case, separate from the one-time SAR 100 membership fee.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            onClick={handleRemindAllPending}
            disabled={bulkOpen || remindableFees.length === 0}
            className="bg-[#25D366] hover:bg-[#128C7E] text-white"
            data-testid="button-frf-remind-all"
          >
            <Send className="h-4 w-4 mr-1" /> Remind All Unpaid ({remindableFees.length})
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF} disabled={isLoading || filtered.length === 0} className="border-emerald-300 text-emerald-800 dark:border-slate-700 dark:text-emerald-300" data-testid="button-frf-export-pdf">
            <FileDown className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={isLoading || filtered.length === 0} className="border-emerald-300 text-emerald-800 dark:border-slate-700 dark:text-emerald-300" data-testid="button-frf-export-excel">
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
          </Button>
        </div>
      </div>

      {/* Summary cards — Paid / Unpaid / Overdue / Amount Due for the selected case */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => setFeeFilter("paid")}
          aria-pressed={feeFilter === "paid"}
          className={cn("rounded-2xl border border-emerald-100 dark:border-slate-800 dark:bg-slate-900 bg-white p-4 shadow-sm text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500", feeFilter === "paid" && "ring-2 ring-emerald-500 dark:ring-emerald-400")}
          data-testid="card-frf-paid"
        >
          <p className="text-sm font-medium text-emerald-700 dark:text-green-400">Paid</p>
          {isLoading ? <Skeleton className="h-8 w-16 mt-1" /> : (
            <p className="text-2xl font-bold text-emerald-700 dark:text-green-400 mt-1" data-testid="text-frf-paid">{stats.paid}</p>
          )}
          <p className="text-xs text-emerald-700/70 dark:text-slate-500 mt-0.5">{formatSAR(stats.collected)} collected in total · {caseTitle}</p>
        </button>
        <button
          type="button"
          onClick={() => setFeeFilter("pending")}
          aria-pressed={feeFilter === "pending"}
          className={cn("rounded-2xl border border-emerald-100 dark:border-slate-800 dark:bg-slate-900 bg-white p-4 shadow-sm text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500", feeFilter === "pending" && "ring-2 ring-emerald-500 dark:ring-emerald-400")}
          data-testid="card-frf-unpaid"
        >
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Unpaid</p>
          {isLoading ? <Skeleton className="h-8 w-16 mt-1" /> : (
            <p className="text-2xl font-bold text-emerald-950 dark:text-white mt-1" data-testid="text-frf-unpaid">{stats.unpaid}</p>
          )}
          <p className="text-xs text-emerald-700/70 dark:text-slate-500 mt-0.5">Not yet paid (within 30 days of approval)</p>
        </button>
        <button
          type="button"
          onClick={() => setFeeFilter("overdue")}
          aria-pressed={feeFilter === "overdue"}
          className={cn("rounded-2xl border border-red-200 dark:border-red-900/40 dark:bg-slate-900 bg-white p-4 shadow-sm text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400", feeFilter === "overdue" && "ring-2 ring-red-400")}
          data-testid="card-frf-overdue"
        >
          <p className="text-sm font-medium text-red-700 dark:text-red-400">Overdue</p>
          {isLoading ? <Skeleton className="h-8 w-16 mt-1" /> : (
            <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1" data-testid="text-frf-overdue">{stats.overdue}</p>
          )}
          <p className="text-xs text-emerald-700/70 dark:text-slate-500 mt-0.5">Still unpaid 30+ days after approval</p>
        </button>
        <button
          type="button"
          onClick={() => setFeeFilter("pending")}
          aria-pressed={feeFilter === "pending"}
          className={cn("rounded-2xl border border-amber-200 dark:border-amber-900/40 dark:bg-slate-900 bg-white p-4 shadow-sm text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400", feeFilter === "pending" && "ring-2 ring-amber-400/70")}
          data-testid="card-frf-amount-due"
        >
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Amount Due</p>
          {isLoading ? <Skeleton className="h-8 w-24 mt-1" /> : (
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1" data-testid="text-frf-pending">{formatSAR(stats.pendingAmount)}</p>
          )}
          <p className="text-xs text-emerald-700/70 dark:text-slate-500 mt-0.5">{stats.unpaid + stats.overdue} member{stats.unpaid + stats.overdue === 1 ? "" : "s"} yet to pay this case</p>
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-emerald-100 dark:border-slate-800 shadow-sm">
        <div className="space-y-1">
          <label className="text-xs font-medium text-emerald-700 dark:text-slate-400">
            Select FRF Case{pendingView && <span className="ml-1 text-emerald-500 dark:text-slate-500">(showing unpaid for this case)</span>}
          </label>
          <Select value={caseId} onValueChange={setCaseId}>
            <SelectTrigger className="border-emerald-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 h-10" data-testid="select-payments-frf-case">
              <SelectValue placeholder={claimsLoading ? "Loading cases…" : "Select FRF Case"} />
            </SelectTrigger>
            <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
              <SelectItem value={ALL_CASES} className="font-semibold dark:text-slate-200 dark:focus:bg-slate-800" data-testid="select-item-frf-all-cases">
                All FRF Cases — total per member
              </SelectItem>
              {cases.map((c) => (
                <SelectItem key={c.id} value={c.id} className="dark:text-slate-300 dark:focus:bg-slate-800">
                  {c.title} {c.status === "approved" ? "· Active" : "· Closed"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-emerald-700 dark:text-slate-400">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-400 dark:text-slate-500" />
            <Input
              placeholder="Name or membership no…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 border-emerald-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500"
              data-testid="input-payments-frf-search"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-emerald-700 dark:text-slate-400">Filter by Status</label>
          <Select value={feeFilter} onValueChange={(v) => setFeeFilter(v as FeeFilter)}>
            <SelectTrigger className="border-emerald-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 h-10" data-testid="select-payments-frf-status">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
              <SelectItem value="all" className="dark:text-slate-300 dark:focus:bg-slate-800">All Statuses</SelectItem>
              <SelectItem value="paid" className="dark:text-slate-300 dark:focus:bg-slate-800">Paid</SelectItem>
              <SelectItem value="pending" className="dark:text-slate-300 dark:focus:bg-slate-800">Unpaid</SelectItem>
              <SelectItem value="overdue" className="dark:text-slate-300 dark:focus:bg-slate-800">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-emerald-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-emerald-50/50 dark:bg-slate-800/60">
            <TableRow className="dark:border-slate-700">
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Member</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Responsible / Referred By</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">FRF Case</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Fee</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Status</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Paid On</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Receipt No.</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="dark:border-slate-800">
                  <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-emerald-600 dark:text-slate-500">
                  <div className="flex flex-col items-center justify-center">
                    <HeartHandshake className="h-8 w-8 text-emerald-200 dark:text-slate-700 mb-2" />
                    <p>{hasFilters ? "No FRF fee records match the selected filters." : "No FRF fee records for this case yet."}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.contributionId} className="hover:bg-emerald-50/30 dark:hover:bg-slate-800/50 dark:border-slate-800 transition-colors">
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setHistoryMember({ id: c.memberId, name: c.fullName, membershipId: c.membershipId })}
                      className="flex items-center gap-3 group text-left"
                      data-testid={`button-frf-history-${c.membershipId}`}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-900/60 transition-colors shrink-0">
                        <UserCircle className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-medium text-emerald-950 dark:text-slate-200 group-hover:text-emerald-700 dark:group-hover:text-green-300 transition-colors">{c.fullName}</div>
                        <div className="text-xs text-emerald-600 dark:text-slate-500">ID: {c.membershipId} · click for history</div>
                      </div>
                    </button>
                  </TableCell>
                  <TableCell className="text-sm text-emerald-800 dark:text-slate-300" data-testid={`text-frf-responsible-${c.membershipId}`}>
                    {c.refMemberName || <span className="text-emerald-600/60 dark:text-slate-500">—</span>}
                  </TableCell>
                  <TableCell className="text-sm text-emerald-800/80 dark:text-slate-400 max-w-[220px] truncate">{c.caseTitle}</TableCell>
                  <TableCell className="text-right font-bold text-emerald-900 dark:text-green-300">{formatSAR(c.amount)}</TableCell>
                  <TableCell>{frfStatusBadge(c.status)}</TableCell>
                  <TableCell className="text-sm text-emerald-700 dark:text-slate-400">{c.paidAt ? formatDate(c.paidAt) : "—"}</TableCell>
                  <TableCell className="text-right text-sm text-emerald-700 dark:text-slate-400">{c.receiptNumber || "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {pendingByContribution.has(c.contributionId) && (
                        <Button
                          size="sm"
                          className="bg-[#25D366] hover:bg-[#128C7E] text-white"
                          onClick={() => handleRemindOne(pendingByContribution.get(c.contributionId)!)}
                          data-testid={`button-frf-remind-${c.membershipId}`}
                        >
                          <MessageSquareWarning className="mr-1.5 h-4 w-4" />
                          Remind
                        </Button>
                      )}
                      {allMode ? (
                        <span className="text-sm text-emerald-600/60 dark:text-slate-500">—</span>
                      ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800" data-testid={`button-frf-actions-${c.membershipId}`}>
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="dark:bg-slate-900 dark:border-slate-800">
                          {(c.status === "pending" || c.status === "overdue" || c.status === "partial") && (
                            <DropdownMenuItem
                              disabled={createPayment.isPending}
                              onClick={() => handleMarkPaid(c)}
                              className="text-emerald-700 dark:text-emerald-400 dark:focus:bg-slate-800"
                              data-testid={`menu-frf-mark-paid-${c.membershipId}`}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Paid (auto receipt)
                            </DropdownMenuItem>
                          )}
                          {/* Exempt is only possible before any money is recorded (server rule). */}
                          {(c.status === "pending" || c.status === "overdue") && (
                            <DropdownMenuItem
                              disabled={statusMutation.isPending}
                              onClick={() => statusMutation.mutate({ id: c.claimId, contributionId: c.contributionId, data: { status: "exempt" } })}
                              className="dark:text-slate-300 dark:focus:bg-slate-800"
                            >
                              <MinusCircle className="mr-2 h-4 w-4" /> Mark Exempt
                            </DropdownMenuItem>
                          )}
                          {c.status === "exempt" && (
                            <DropdownMenuItem
                              disabled={statusMutation.isPending}
                              onClick={() => statusMutation.mutate({ id: c.claimId, contributionId: c.contributionId, data: { status: "pending" } })}
                              className="dark:text-slate-300 dark:focus:bg-slate-800"
                            >
                              <Clock className="mr-2 h-4 w-4" /> Revert to Unpaid
                            </DropdownMenuItem>
                          )}
                          {c.status === "paid" && (
                            <DropdownMenuItem disabled className="dark:text-slate-500">
                              <CheckCircle2 className="mr-2 h-4 w-4" /> Paid — receipt {c.receiptNumber || "recorded"}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <FrfMemberHistoryDialog
        memberId={historyMember?.id ?? null}
        memberName={historyMember?.name ?? ""}
        membershipIdText={historyMember?.membershipId ?? ""}
        onClose={() => setHistoryMember(null)}
      />
    </div>
  );
}
