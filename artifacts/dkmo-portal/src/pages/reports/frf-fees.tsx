import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListFrfClaims,
  useGetFrfClaimCollection,
  type FrfContributor,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSAR, formatDate, cn } from "@/lib/utils";
import { ArrowLeft, Search, FileDown, FileSpreadsheet, Printer, X, HeartHandshake, Users, CheckCircle2, Clock, Wallet } from "lucide-react";
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
  partial: "Partial",
  pending: "Pending",
  overdue: "Overdue",
  cancelled: "Cancelled",
  exempt: "Exempt",
};

function feeStatusBadge(status: string) {
  const styles: Record<string, string> = {
    paid: "bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-300",
    partial: "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300",
    pending: "bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300",
    overdue: "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300",
    cancelled: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400",
    exempt: "bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300",
  };
  return (
    <Badge className={cn("text-xs font-semibold", styles[status] ?? "bg-slate-100 text-slate-700")}>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

type FeeFilter = "all" | "paid" | "pending";

export default function FrfFeeReport() {
  const [caseId, setCaseId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [feeFilter, setFeeFilter] = useState<FeeFilter>("all");

  const { data: claimsData = [], isLoading: claimsLoading } = useListFrfClaims();

  // Only titled cases (those set up as named FRF fee cases) are selectable.
  const cases = useMemo(() => {
    const list = claimsData.filter((c) => (c.title ?? "").trim() !== "");
    return [...list].sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
  }, [claimsData]);

  // Default to the first case once cases load.
  useEffect(() => {
    if (!caseId && cases.length > 0) setCaseId(cases[0]!.id);
  }, [cases, caseId]);

  const { data: collection, isLoading: collectionLoading } = useGetFrfClaimCollection(caseId);

  const isLoading = claimsLoading || (caseId !== "" && collectionLoading);
  const selectedCase = cases.find((c) => c.id === caseId);
  const caseTitle = selectedCase?.title || "FRF Case";

  const contributors = useMemo<FrfContributor[]>(() => collection?.contributors ?? [], [collection]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contributors.filter((c) => {
      if (feeFilter === "paid" && !(c.status === "paid" || c.status === "partial")) return false;
      if (feeFilter === "pending" && !(c.status === "pending" || c.status === "overdue")) return false;
      if (q && !c.fullName.toLowerCase().includes(q) && !c.membershipId.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [contributors, search, feeFilter]);

  // Case-level summary (from the full case ledger, not the filtered view).
  const caseStats = useMemo(() => {
    const eligible = contributors.filter((c) => c.status !== "cancelled" && c.status !== "exempt");
    const paid = eligible.filter((c) => c.status === "paid" || c.status === "partial").length;
    const collected = eligible.reduce((a, c) => a + c.amountPaid, 0);
    return { totalCases: cases.length, eligible: eligible.length, paid, pending: eligible.length - paid, collected };
  }, [contributors, cases]);

  // Export scope: stats over exactly the rows being exported (the filtered view),
  // so exported totals always match exported rows.
  const exportStats = useMemo(() => {
    const eligible = filtered.filter((c) => c.status !== "cancelled" && c.status !== "exempt");
    const paid = eligible.filter((c) => c.status === "paid" || c.status === "partial").length;
    const collected = eligible.reduce((a, c) => a + c.amountPaid, 0);
    return { members: filtered.length, eligible: eligible.length, paid, pending: eligible.length - paid, collected };
  }, [filtered]);

  const hasFilters = search.trim() !== "" || feeFilter !== "all";
  const clearFilters = () => { setSearch(""); setFeeFilter("all"); };

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
    doc.text(`FRF Fee Report — ${caseTitle}`, pageW / 2, 19, { align: "center" });

    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.text(
      `Generated: ${generatedOn()}${hasFilters ? "   |   Filtered view" : ""}   |   Members Listed: ${exportStats.members}   |   Paid: ${exportStats.paid}   |   Pending: ${exportStats.pending}   |   Collected: ${formatSAR(exportStats.collected)}`,
      pageW / 2,
      35,
      { align: "center" },
    );

    autoTable(doc, {
      startY: 42,
      head: [["#", "Member Name", "Membership No.", "FRF Case", "Fee Status", "Amount (SAR)", "Paid (SAR)", "Payment Date", "Receipt No."]],
      body: filtered.map((c, i) => [
        String(i + 1),
        c.fullName,
        c.membershipId,
        caseTitle,
        STATUS_LABEL[c.status] ?? c.status,
        c.amount.toFixed(2),
        c.amountPaid.toFixed(2),
        c.paidAt ? formatDate(c.paidAt) : "—",
        c.receiptNumber || "—",
      ]),
      theme: "grid",
      headStyles: { fillColor: green, fontStyle: "bold", fontSize: 8, halign: "center" },
      bodyStyles: { fontSize: 7.5 },
      columnStyles: {
        0: { halign: "center", cellWidth: 10 },
        4: { halign: "center" },
        5: { halign: "right" },
        6: { halign: "right" },
        7: { halign: "center" },
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(7.5);
    doc.setTextColor(130, 130, 130);
    doc.text("FRF Fee is SAR 50 per member per case — separate from the one-time SAR 100 Membership Fee.", pageW / 2, finalY, { align: "center" });
    doc.text("Confidential — For internal use only", pageW / 2, finalY + 5, { align: "center" });
    doc.save(`DKMO_FRF_Fee_Report_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const exportExcel = async () => {
    if (filtered.length === 0) return;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "DKMO Portal";
    const sheet = workbook.addWorksheet("FRF Fees");

    sheet.mergeCells("A1:I1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "Dakshina Karnataka Muslim Ookota (DKMO)";
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: "center" };

    sheet.mergeCells("A2:I2");
    const subtitleCell = sheet.getCell("A2");
    subtitleCell.value = `FRF Fee Report — ${caseTitle}`;
    subtitleCell.font = { bold: true, size: 11, color: { argb: "FF059669" } };
    subtitleCell.alignment = { horizontal: "center" };

    sheet.mergeCells("A3:I3");
    const metaCell = sheet.getCell("A3");
    metaCell.value = `Generated: ${generatedOn()}${hasFilters ? "  |  Filtered view" : ""}  |  Members Listed: ${exportStats.members}  |  Paid: ${exportStats.paid}  |  Pending: ${exportStats.pending}  |  Collected: ${formatSAR(exportStats.collected)}`;
    metaCell.font = { size: 9, color: { argb: "FF6B7280" } };
    metaCell.alignment = { horizontal: "center" };

    sheet.addRow([]);
    const headerRow = sheet.addRow([
      "#", "Member Name", "Membership No.", "FRF Case", "Fee Status",
      "Amount (SAR)", "Paid (SAR)", "Payment Date", "Receipt No.",
    ]);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } };
      cell.alignment = { horizontal: "center" };
      cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    });

    filtered.forEach((c, i) => {
      const row = sheet.addRow([
        i + 1,
        c.fullName,
        c.membershipId,
        caseTitle,
        STATUS_LABEL[c.status] ?? c.status,
        Number(c.amount.toFixed(2)),
        Number(c.amountPaid.toFixed(2)),
        c.paidAt ? formatDate(c.paidAt) : "—",
        c.receiptNumber || "—",
      ]);
      row.eachCell((cell) => {
        cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
      });
    });

    const totalsRow = sheet.addRow([
      "", "TOTALS", "", "", `${exportStats.paid} paid / ${exportStats.pending} pending`,
      "", Number(exportStats.collected.toFixed(2)), "", "",
    ]);
    totalsRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
      cell.border = { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "thin" }, right: { style: "thin" } };
    });

    sheet.columns = [
      { width: 5 }, { width: 26 }, { width: 16 }, { width: 28 }, { width: 12 },
      { width: 14 }, { width: 12 }, { width: 16 }, { width: 16 },
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DKMO_FRF_Fee_Report_${new Date().toISOString().split("T")[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 print:space-y-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Link
            href="/reports"
            className="inline-flex items-center gap-1 text-sm text-emerald-700/80 dark:text-slate-400 hover:text-emerald-900 dark:hover:text-emerald-200 print:hidden"
            data-testid="link-all-reports"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All Reports
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-950 dark:text-emerald-100 mt-1">FRF Fee Report</h1>
          <p className="text-emerald-700/80 dark:text-slate-400">
            Per-case FRF fee tracking — SAR 50 per member per case, separate from the SAR 100 membership fee
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={exportPDF} disabled={isLoading || filtered.length === 0} className="border-emerald-300 text-emerald-800 dark:border-slate-700 dark:text-emerald-300" data-testid="button-export-pdf">
            <FileDown className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={isLoading || filtered.length === 0} className="border-emerald-300 text-emerald-800 dark:border-slate-700 dark:text-emerald-300" data-testid="button-export-excel">
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="border-emerald-300 text-emerald-800 dark:border-slate-700 dark:text-emerald-300" data-testid="button-print-report">
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
        </div>
      </div>

      {/* Case selector + filters */}
      <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm print:hidden">
        <CardContent className="pt-6 flex flex-wrap items-center gap-3">
          <div className="min-w-[260px]">
            <label className="text-xs font-medium text-emerald-800 dark:text-slate-400 mb-1 block">Select FRF Case</label>
            <Select value={caseId} onValueChange={setCaseId}>
              <SelectTrigger className="w-full dark:bg-slate-800 dark:border-slate-700" data-testid="select-frf-case">
                <SelectValue placeholder={claimsLoading ? "Loading cases…" : "Select FRF Case"} />
              </SelectTrigger>
              <SelectContent>
                {cases.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative flex-1 min-w-[200px] self-end">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500 dark:text-slate-500" />
            <Input
              placeholder="Search by member name or membership no…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 dark:bg-slate-800 dark:border-slate-700"
              data-testid="input-search-frf-fees"
            />
          </div>
          <div className="self-end">
            <Select value={feeFilter} onValueChange={(v) => setFeeFilter(v as FeeFilter)}>
              <SelectTrigger className="w-[160px] dark:bg-slate-800 dark:border-slate-700" data-testid="select-fee-status">
                <SelectValue placeholder="Fee status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-emerald-700 dark:text-emerald-400 self-end" data-testid="button-clear-frf-filters">
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 print:grid-cols-4">
        <SummaryCard icon={HeartHandshake} accent="text-rose-600 dark:text-rose-400" label="Total FRF Cases" value={String(caseStats.totalCases)} loading={claimsLoading} />
        <SummaryCard icon={Wallet} accent="text-emerald-700 dark:text-emerald-400" label="FRF Fees Collected" value={formatSAR(caseStats.collected)} sub={caseTitle} loading={isLoading} />
        <SummaryCard icon={CheckCircle2} accent="text-green-700 dark:text-green-400" label="Paid Members" value={String(caseStats.paid)} sub={`of ${caseStats.eligible} eligible`} loading={isLoading} />
        <SummaryCard icon={Clock} accent="text-orange-600 dark:text-orange-400" label="Pending Members" value={String(caseStats.pending)} sub={caseTitle} loading={isLoading} />
      </div>

      {/* Detailed table */}
      <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-emerald-700/70 dark:text-slate-500 py-12 text-center">
              {hasFilters
                ? "No members match the current filters for this case."
                : "No FRF fee records have been created for this case yet."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-emerald-100 dark:border-slate-800">
                    <TableHead>Member Name</TableHead>
                    <TableHead>Membership No.</TableHead>
                    <TableHead>FRF Case</TableHead>
                    <TableHead>Fee Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Payment Date</TableHead>
                    <TableHead className="text-right">Receipt No.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c, i) => (
                    <TableRow key={c.contributionId} className="border-emerald-50 dark:border-slate-800/60" data-testid={`row-frf-fee-${i}`}>
                      <TableCell className="font-medium text-emerald-950 dark:text-slate-100">{c.fullName}</TableCell>
                      <TableCell className="text-emerald-800/90 dark:text-slate-300">{c.membershipId}</TableCell>
                      <TableCell className="text-emerald-800/80 dark:text-slate-400 max-w-[220px] truncate">{caseTitle}</TableCell>
                      <TableCell>{feeStatusBadge(c.status)}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-900 dark:text-slate-200">{formatSAR(c.amount)}</TableCell>
                      <TableCell className="text-right text-xs text-emerald-800/80 dark:text-slate-400">
                        {c.paidAt ? formatDate(c.paidAt) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs text-emerald-800/80 dark:text-slate-400">{c.receiptNumber || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  loading,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  sub?: string;
  accent: string;
  loading: boolean;
}) {
  return (
    <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 shrink-0 ${accent}`} />
          <span className="text-[11px] font-medium text-emerald-900 dark:text-slate-300 leading-tight">{label}</span>
        </div>
        {loading ? (
          <Skeleton className="h-6 w-16 mt-2" />
        ) : (
          <>
            <div className="text-lg font-bold text-emerald-950 dark:text-white mt-2 tabular-nums truncate">{value}</div>
            {sub ? (
              <p className="text-[11px] text-emerald-700/70 dark:text-slate-400 mt-0.5 truncate">{sub}</p>
            ) : (
              <p className="text-[11px] text-transparent mt-0.5 select-none" aria-hidden>—</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
