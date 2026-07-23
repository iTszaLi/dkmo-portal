import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useListLoans, useListMembers } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSAR, formatDate, cn } from "@/lib/utils";
import { ArrowLeft, Search, FileDown, FileSpreadsheet, Printer, X, Landmark } from "lucide-react";
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
  active: "Active",
  overdue: "Overdue",
  closed: "Closed",
  defaulted: "Defaulted",
};

function statusLabel(status: string) {
  return STATUS_LABEL[status] ?? status;
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    active: "bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300",
    overdue: "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300",
    closed: "bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-300",
    defaulted: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400",
  };
  return (
    <Badge className={cn("text-xs font-semibold capitalize", styles[status] ?? "bg-slate-100 text-slate-700")}>
      {statusLabel(status)}
    </Badge>
  );
}

type LoanRow = {
  id: string;
  memberName: string;
  membershipId: string;
  loanType: string;
  principalAmount: number;
  emiAmount: number;
  paidEmis: number;
  totalEmis: number;
  status: string;
  disbursedDate: string | null;
};

const dateKey = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");

export default function LoanReport() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data, isLoading } = useListLoans({ pageSize: 10000 });
  const { data: members } = useListMembers();

  const memberById = useMemo(() => {
    const m = new Map<string, { fullName: string; membershipId: string }>();
    for (const mem of members ?? []) m.set(mem.id, { fullName: mem.fullName, membershipId: mem.membershipId });
    return m;
  }, [members]);

  const rows = useMemo<LoanRow[]>(() => {
    const loans = data?.items ?? [];
    return loans.map((l) => {
      const resolved = l.memberId ? memberById.get(l.memberId) : undefined;
      return {
        id: l.id,
        memberName: l.memberName ?? resolved?.fullName ?? "",
        membershipId: l.membershipId ?? resolved?.membershipId ?? "",
        loanType: l.loanType ?? "",
        principalAmount: Number(l.principalAmount ?? 0),
        emiAmount: Number(l.emiAmount ?? 0),
        paidEmis: Number(l.paidEmis ?? 0),
        totalEmis: Number(l.emiCount ?? 0),
        status: l.status ?? "",
        disbursedDate: l.disbursedDate ?? null,
      };
    });
  }, [data, memberById]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.status) set.add(r.status);
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !(r.memberName.toLowerCase().includes(q) || r.loanType.toLowerCase().includes(q))) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      const d = dateKey(r.disbursedDate);
      if (fromDate && (!d || d < fromDate)) return false;
      if (toDate && (!d || d > toDate)) return false;
      return true;
    });
  }, [rows, search, statusFilter, fromDate, toDate]);

  const totals = useMemo(
    () => ({
      count: filtered.length,
      principal: filtered.reduce((a, r) => a + r.principalAmount, 0),
      emi: filtered.reduce((a, r) => a + r.emiAmount, 0),
      active: filtered.filter((r) => r.status === "active").length,
    }),
    [filtered],
  );

  const hasFilters = search.trim() !== "" || statusFilter !== "all" || fromDate !== "" || toDate !== "";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setFromDate("");
    setToDate("");
  };

  const emisText = (r: LoanRow) => (r.totalEmis > 0 ? `${r.paidEmis} of ${r.totalEmis}` : String(r.paidEmis));

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
    doc.text("Loan Report", pageW / 2, 19, { align: "center" });

    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.text(
      `Generated: ${generatedOn()}   |   Loans: ${totals.count}   |   Total Principal: ${formatSAR(totals.principal)}   |   Active: ${totals.active}`,
      pageW / 2,
      35,
      { align: "center" },
    );

    autoTable(doc, {
      startY: 42,
      head: [["#", "Member", "Loan Type", "Principal", "EMI", "EMIs Paid", "Status", "Disbursed"]],
      body: [
        ...filtered.map((r, i) => [
          String(i + 1),
          r.membershipId ? `${r.memberName || "—"}\n${r.membershipId}` : r.memberName || "—",
          r.loanType || "—",
          `SAR ${r.principalAmount.toFixed(2)}`,
          `SAR ${r.emiAmount.toFixed(2)}`,
          emisText(r),
          statusLabel(r.status),
          r.disbursedDate ? formatDate(r.disbursedDate) : "—",
        ]),
        [
          "",
          "TOTALS",
          "",
          `SAR ${totals.principal.toFixed(2)}`,
          `SAR ${totals.emi.toFixed(2)}`,
          "",
          `${totals.active} active`,
          "",
        ],
      ],
      theme: "grid",
      headStyles: { fillColor: green, fontStyle: "bold", fontSize: 8, halign: "center" },
      bodyStyles: { fontSize: 7.5 },
      columnStyles: {
        0: { halign: "center", cellWidth: 10 },
        2: { textColor: [60, 60, 60] },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "center" },
        6: { halign: "center" },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.row.index === filtered.length) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [240, 253, 244];
        }
        if (data.section === "body" && data.column.index === 2 && data.row.index < filtered.length) {
          data.cell.text = data.cell.text.map((t) => t.charAt(0).toUpperCase() + t.slice(1));
        }
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(7.5);
    doc.setTextColor(130, 130, 130);
    doc.text("Committed to the Community", pageW / 2, finalY, { align: "center" });
    doc.text("Confidential — For internal use only", pageW / 2, finalY + 5, { align: "center" });

    doc.save(`DKMO_Loan_Report_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const exportExcel = async () => {
    if (filtered.length === 0) return;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "DKMO Portal";
    const sheet = workbook.addWorksheet("Loans");

    sheet.mergeCells("A1:H1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "Dakshina Karnataka Muslim Ookota (DKMO)";
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: "center" };

    sheet.mergeCells("A2:H2");
    const subtitleCell = sheet.getCell("A2");
    subtitleCell.value = "Loan Report";
    subtitleCell.font = { bold: true, size: 11, color: { argb: "FF059669" } };
    subtitleCell.alignment = { horizontal: "center" };

    sheet.mergeCells("A3:H3");
    const metaCell = sheet.getCell("A3");
    metaCell.value = `Generated: ${generatedOn()}`;
    metaCell.font = { size: 9, color: { argb: "FF6B7280" } };
    metaCell.alignment = { horizontal: "center" };

    sheet.addRow([]);

    const headerRow = sheet.addRow([
      "#",
      "Member",
      "Membership ID",
      "Loan Type",
      "Principal (SAR)",
      "EMI (SAR)",
      "EMIs Paid",
      "Status",
      "Disbursed",
    ]);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } };
      cell.alignment = { horizontal: "center" };
      cell.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" },
      };
    });

    filtered.forEach((r, i) => {
      const row = sheet.addRow([
        i + 1,
        r.memberName || "—",
        r.membershipId || "—",
        r.loanType ? r.loanType.charAt(0).toUpperCase() + r.loanType.slice(1) : "—",
        Number(r.principalAmount.toFixed(2)),
        Number(r.emiAmount.toFixed(2)),
        emisText(r),
        statusLabel(r.status),
        r.disbursedDate ? formatDate(r.disbursedDate) : "—",
      ]);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
        };
      });
    });

    const totalsRow = sheet.addRow([
      "",
      "TOTALS",
      "",
      "",
      Number(totals.principal.toFixed(2)),
      Number(totals.emi.toFixed(2)),
      "",
      `${totals.active} active`,
      "",
    ]);
    totalsRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
      cell.border = {
        top: { style: "medium" },
        bottom: { style: "medium" },
        left: { style: "thin" },
        right: { style: "thin" },
      };
    });

    sheet.columns = [
      { width: 5 },
      { width: 26 },
      { width: 16 },
      { width: 14 },
      { width: 16 },
      { width: 14 },
      { width: 12 },
      { width: 12 },
      { width: 16 },
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DKMO_Loan_Report_${new Date().toISOString().split("T")[0]}.xlsx`;
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
          <h1 className="text-3xl font-bold tracking-tight text-emerald-950 dark:text-emerald-100 mt-1">Loan Report</h1>
          <p className="text-emerald-700/80 dark:text-slate-400">
            All loans — principal, EMIs paid, status, and disbursement dates
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={exportPDF}
            disabled={isLoading || filtered.length === 0}
            className="border-emerald-300 text-emerald-800 dark:border-slate-700 dark:text-emerald-300"
            data-testid="button-export-pdf"
          >
            <FileDown className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportExcel}
            disabled={isLoading || filtered.length === 0}
            className="border-emerald-300 text-emerald-800 dark:border-slate-700 dark:text-emerald-300"
            data-testid="button-export-excel"
          >
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="border-emerald-300 text-emerald-800 dark:border-slate-700 dark:text-emerald-300"
            data-testid="button-print-report"
          >
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm print:hidden">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500 dark:text-slate-500" />
            <Input
              placeholder="Search member or loan type…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 dark:bg-slate-800 dark:border-slate-700"
              data-testid="input-search-loans"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[170px] dark:bg-slate-800 dark:border-slate-700" data-testid="select-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {statusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <div>
              <label className="text-[11px] text-emerald-700/70 dark:text-slate-500 block mb-1">From</label>
              <input
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-10 w-[150px] rounded-md border border-emerald-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 px-3 text-sm"
                data-testid="input-date-from"
              />
            </div>
            <div>
              <label className="text-[11px] text-emerald-700/70 dark:text-slate-500 block mb-1">To</label>
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(e) => setToDate(e.target.value)}
                className="h-10 w-[150px] rounded-md border border-emerald-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 px-3 text-sm"
                data-testid="input-date-to"
              />
            </div>
          </div>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="text-emerald-700 dark:text-emerald-400"
              data-testid="button-clear-filters"
            >
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300">
          Total Loans: {totals.count}
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-slate-300 border border-emerald-200 dark:border-slate-700">
          Total Principal: {formatSAR(totals.principal)}
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300">
          Active: {totals.active}
        </span>
      </div>

      {/* Table */}
      <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm print:border-0 print:shadow-none">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-emerald-50/50 dark:bg-slate-800/60">
                <TableRow className="dark:border-slate-700">
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 w-10">#</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Member</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Loan Type</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Principal</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">EMI</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-center">EMIs Paid</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Status</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Disbursed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="dark:border-slate-800">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-emerald-600 dark:text-slate-500">
                      <div className="flex flex-col items-center gap-2">
                        <Landmark className="h-8 w-8 text-emerald-200 dark:text-slate-700" />
                        <p>No loans match the current filters.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {filtered.map((row, i) => (
                      <TableRow
                        key={row.id}
                        data-testid={`row-loan-${i}`}
                        className="dark:border-slate-800 hover:bg-emerald-50/40 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <TableCell className="text-emerald-500 dark:text-slate-500 text-sm">{i + 1}</TableCell>
                        <TableCell>
                          <div className="font-medium text-emerald-950 dark:text-slate-200">
                            {row.memberName || <span className="italic text-slate-400">Unknown</span>}
                          </div>
                          {row.membershipId && (
                            <div className="text-xs text-emerald-600 dark:text-slate-500">{row.membershipId}</div>
                          )}
                        </TableCell>
                        <TableCell className="capitalize text-emerald-800 dark:text-slate-300">
                          {row.loanType || "—"}
                        </TableCell>
                        <TableCell className="text-right text-emerald-900 dark:text-slate-300 tabular-nums font-medium">
                          {formatSAR(row.principalAmount)}
                        </TableCell>
                        <TableCell className="text-right text-emerald-900 dark:text-slate-300 tabular-nums">
                          {formatSAR(row.emiAmount)}
                        </TableCell>
                        <TableCell className="text-center text-emerald-700 dark:text-slate-400 tabular-nums">
                          {emisText(row)}
                        </TableCell>
                        <TableCell>{statusBadge(row.status)}</TableCell>
                        <TableCell className="text-sm text-emerald-700 dark:text-slate-400">
                          {row.disbursedDate ? formatDate(row.disbursedDate) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-emerald-50/70 dark:bg-slate-800/70 font-semibold dark:border-slate-700">
                      <TableCell colSpan={3} className="text-emerald-950 dark:text-slate-200">
                        Totals ({totals.count})
                      </TableCell>
                      <TableCell className="text-right text-emerald-950 dark:text-slate-200 tabular-nums">
                        {formatSAR(totals.principal)}
                      </TableCell>
                      <TableCell className="text-right text-emerald-950 dark:text-slate-200 tabular-nums">
                        {formatSAR(totals.emi)}
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-emerald-950 dark:text-slate-200">{totals.active} active</TableCell>
                      <TableCell />
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
