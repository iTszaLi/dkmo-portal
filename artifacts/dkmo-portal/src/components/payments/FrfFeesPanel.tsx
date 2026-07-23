import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListFrfClaims,
  useGetFrfClaimCollection,
  type FrfContributor,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, UserCircle, HeartHandshake, FileDown, FileSpreadsheet, CheckCircle2, Clock, MinusCircle, XCircle } from "lucide-react";
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
  partial: "Partial",
  pending: "Pending",
  overdue: "Overdue",
  cancelled: "Cancelled",
  exempt: "Exempt",
};

function frfStatusBadge(status: string) {
  const styles: Record<string, string> = {
    paid: "bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-300",
    partial: "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300",
    pending: "bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300",
    overdue: "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300",
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

type FeeFilter = "all" | "paid" | "pending";

export default function FrfFeesPanel() {
  const [caseId, setCaseId] = useState("");
  const [search, setSearch] = useState("");
  const [feeFilter, setFeeFilter] = useState<FeeFilter>("all");

  const { data: claimsData = [], isLoading: claimsLoading } = useListFrfClaims();

  const cases = useMemo(() => {
    const list = claimsData.filter((c) => (c.title ?? "").trim() !== "");
    return [...list].sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
  }, [claimsData]);

  useEffect(() => {
    if (!caseId && cases.length > 0) setCaseId(cases[0]!.id);
  }, [cases, caseId]);

  const { data: collection, isLoading: collectionLoading } = useGetFrfClaimCollection(caseId);
  const isLoading = claimsLoading || (caseId !== "" && collectionLoading);

  const caseTitle = cases.find((c) => c.id === caseId)?.title || "FRF Case";
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

  // Case-level stats (full ledger, cancelled/exempt excluded).
  const stats = useMemo(() => {
    const eligible = contributors.filter((c) => c.status !== "cancelled" && c.status !== "exempt");
    const paid = eligible.filter((c) => c.status === "paid" || c.status === "partial").length;
    const collected = eligible.reduce((a, c) => a + c.amountPaid, 0);
    const pendingAmount = eligible.reduce((a, c) => a + Math.max(c.amount - c.amountPaid, 0), 0);
    return { participants: eligible.length, paid, pending: eligible.length - paid, collected, pendingAmount };
  }, [contributors]);

  // Export scope: totals must match the exported (filtered) rows.
  const exportStats = useMemo(() => {
    const eligible = filtered.filter((c) => c.status !== "cancelled" && c.status !== "exempt");
    const paid = eligible.filter((c) => c.status === "paid" || c.status === "partial").length;
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
    doc.text(`FRF Fees — ${caseTitle}`, pageW / 2, 19, { align: "center" });

    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.text(
      `Generated: ${generatedOn()}${hasFilters ? "   |   Filtered view" : ""}   |   Members Listed: ${exportStats.members}   |   Paid: ${exportStats.paid}   |   Pending: ${exportStats.pending}   |   Collected: ${formatSAR(exportStats.collected)}`,
      pageW / 2, 35, { align: "center" },
    );

    autoTable(doc, {
      startY: 42,
      head: [["#", "Member Name", "Membership No.", "FRF Case", "Fee Status", "Amount (SAR)", "Paid (SAR)", "Payment Date", "Receipt No."]],
      body: filtered.map((c, i) => [
        String(i + 1), c.fullName, c.membershipId, caseTitle,
        STATUS_LABEL[c.status] ?? c.status, c.amount.toFixed(2), c.amountPaid.toFixed(2),
        c.paidAt ? formatDate(c.paidAt) : "—", c.receiptNumber || "—",
      ]),
      theme: "grid",
      headStyles: { fillColor: green, fontStyle: "bold", fontSize: 8, halign: "center" },
      bodyStyles: { fontSize: 7.5 },
      columnStyles: { 0: { halign: "center", cellWidth: 10 }, 4: { halign: "center" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "center" } },
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

    sheet.mergeCells("A1:I1");
    sheet.getCell("A1").value = "Dakshina Karnataka Muslim Ookota (DKMO)";
    sheet.getCell("A1").font = { bold: true, size: 14 };
    sheet.getCell("A1").alignment = { horizontal: "center" };
    sheet.mergeCells("A2:I2");
    sheet.getCell("A2").value = `FRF Fees — ${caseTitle}`;
    sheet.getCell("A2").font = { bold: true, size: 11, color: { argb: "FF059669" } };
    sheet.getCell("A2").alignment = { horizontal: "center" };
    sheet.mergeCells("A3:I3");
    sheet.getCell("A3").value = `Generated: ${generatedOn()}${hasFilters ? "  |  Filtered view" : ""}  |  Members Listed: ${exportStats.members}  |  Paid: ${exportStats.paid}  |  Pending: ${exportStats.pending}  |  Collected: ${formatSAR(exportStats.collected)}`;
    sheet.getCell("A3").font = { size: 9, color: { argb: "FF6B7280" } };
    sheet.getCell("A3").alignment = { horizontal: "center" };
    sheet.addRow([]);

    const headerRow = sheet.addRow(["#", "Member Name", "Membership No.", "FRF Case", "Fee Status", "Amount (SAR)", "Paid (SAR)", "Payment Date", "Receipt No."]);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } };
      cell.alignment = { horizontal: "center" };
      cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    });
    filtered.forEach((c, i) => {
      const row = sheet.addRow([
        i + 1, c.fullName, c.membershipId, caseTitle,
        STATUS_LABEL[c.status] ?? c.status, Number(c.amount.toFixed(2)), Number(c.amountPaid.toFixed(2)),
        c.paidAt ? formatDate(c.paidAt) : "—", c.receiptNumber || "—",
      ]);
      row.eachCell((cell) => {
        cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
      });
    });
    const totalsRow = sheet.addRow(["", "TOTALS", "", "", `${exportStats.paid} paid / ${exportStats.pending} pending`, "", Number(exportStats.collected.toFixed(2)), "", ""]);
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
    a.download = `DKMO_FRF_Fees_${new Date().toISOString().split("T")[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
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
          <Button variant="outline" size="sm" onClick={exportPDF} disabled={isLoading || filtered.length === 0} className="border-emerald-300 text-emerald-800 dark:border-slate-700 dark:text-emerald-300" data-testid="button-frf-export-pdf">
            <FileDown className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={isLoading || filtered.length === 0} className="border-emerald-300 text-emerald-800 dark:border-slate-700 dark:text-emerald-300" data-testid="button-frf-export-excel">
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-100 dark:border-slate-800 dark:bg-slate-900 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-emerald-700 dark:text-slate-400">Total FRF Participants</p>
          {isLoading ? <Skeleton className="h-8 w-16 mt-1" /> : (
            <p className="text-2xl font-bold text-emerald-950 dark:text-white mt-1" data-testid="text-frf-participants">{stats.participants}</p>
          )}
          <p className="text-xs text-emerald-700/70 dark:text-slate-500 mt-0.5 truncate">{caseTitle}</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 dark:border-slate-800 dark:bg-slate-900 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-emerald-700 dark:text-slate-400">Total FRF Collected</p>
          {isLoading ? <Skeleton className="h-8 w-24 mt-1" /> : (
            <p className="text-2xl font-bold text-emerald-700 dark:text-green-400 mt-1" data-testid="text-frf-collected">{formatSAR(stats.collected)}</p>
          )}
          <p className="text-xs text-emerald-700/70 dark:text-slate-500 mt-0.5">from {stats.paid} paid member{stats.paid === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-2xl border border-red-100 dark:border-red-900/40 dark:bg-slate-900 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-emerald-700 dark:text-slate-400">Pending FRF Fees</p>
          {isLoading ? <Skeleton className="h-8 w-24 mt-1" /> : (
            <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1" data-testid="text-frf-pending">{formatSAR(stats.pendingAmount)}</p>
          )}
          <p className="text-xs text-emerald-700/70 dark:text-slate-500 mt-0.5">{stats.pending} member{stats.pending === 1 ? "" : "s"} pending × SAR 50</p>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-emerald-100 dark:border-slate-800 shadow-sm">
        <div className="space-y-1">
          <label className="text-xs font-medium text-emerald-700 dark:text-slate-400">Select FRF Case</label>
          <Select value={caseId} onValueChange={setCaseId}>
            <SelectTrigger className="border-emerald-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 h-10" data-testid="select-payments-frf-case">
              <SelectValue placeholder={claimsLoading ? "Loading cases…" : "Select FRF Case"} />
            </SelectTrigger>
            <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
              {cases.map((c) => (
                <SelectItem key={c.id} value={c.id} className="dark:text-slate-300 dark:focus:bg-slate-800">{c.title}</SelectItem>
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
              <SelectItem value="pending" className="dark:text-slate-300 dark:focus:bg-slate-800">Pending</SelectItem>
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
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">FRF Case</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Fee</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Status</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Paid On</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Receipt No.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="dark:border-slate-800">
                  <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-emerald-600 dark:text-slate-500">
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
                    <Link href={`/members/${c.memberId}`} className="flex items-center gap-3 group">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-900/60 transition-colors shrink-0">
                        <UserCircle className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-medium text-emerald-950 dark:text-slate-200 group-hover:text-emerald-700 dark:group-hover:text-green-300 transition-colors">{c.fullName}</div>
                        <div className="text-xs text-emerald-600 dark:text-slate-500">ID: {c.membershipId}</div>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-emerald-800/80 dark:text-slate-400 max-w-[220px] truncate">{caseTitle}</TableCell>
                  <TableCell className="text-right font-bold text-emerald-900 dark:text-green-300">{formatSAR(c.amount)}</TableCell>
                  <TableCell>{frfStatusBadge(c.status)}</TableCell>
                  <TableCell className="text-sm text-emerald-700 dark:text-slate-400">{c.paidAt ? formatDate(c.paidAt) : "—"}</TableCell>
                  <TableCell className="text-right text-sm text-emerald-700 dark:text-slate-400">{c.receiptNumber || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
