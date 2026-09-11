import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useListFrfClaims } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSAR, formatDate, cn } from "@/lib/utils";
import { ArrowLeft, Search, FileDown, FileSpreadsheet, Printer, X, HeartHandshake } from "lucide-react";
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
  pending: "Pending",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
  disbursed: "Disbursed",
};

function statusLabel(status: string) {
  return STATUS_LABEL[status] ?? status.replace(/_/g, " ");
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    pending: "bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300",
    under_review: "bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300",
    approved: "bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-300",
    rejected: "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300",
    disbursed: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300",
  };
  return (
    <Badge className={cn("text-xs font-semibold capitalize", styles[status] ?? "bg-slate-100 text-slate-700")}>
      {statusLabel(status)}
    </Badge>
  );
}

type FrfRow = {
  id: string;
  title: string;
  claimantName: string;
  status: string;
  amountRequested: number;
  amountApproved: number;
  amountDisbursed: number;
  collectedAmount: number;
  claimDate: string | null;
};

const dateKey = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");

export default function FrfReport() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data: rawClaims = [], isLoading } = useListFrfClaims();

  const rows = useMemo<FrfRow[]>(
    () =>
      (rawClaims as any[]).map((c) => ({
        id: c.id,
        title: c.title ?? "",
        claimantName: c.claimantName ?? "",
        status: c.status ?? "",
        amountRequested: Number(c.amountRequested ?? 0),
        amountApproved: Number(c.amountApproved ?? 0),
        amountDisbursed: Number(c.disbursedAmount ?? (c.status === "disbursed" ? c.amountApproved : 0)),
        collectedAmount: Number(c.collectedAmount ?? 0),
        claimDate: c.claimDate ?? null,
      })),
    [rawClaims],
  );

  const statuses = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.status) set.add(r.status);
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !(r.title.toLowerCase().includes(q) || r.claimantName.toLowerCase().includes(q))) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      const d = dateKey(r.claimDate);
      if (fromDate && (!d || d < fromDate)) return false;
      if (toDate && (!d || d > toDate)) return false;
      return true;
    });
  }, [rows, search, statusFilter, fromDate, toDate]);

  const totals = useMemo(
    () => ({
      count: filtered.length,
      approved: filtered.reduce((a, r) => a + r.amountApproved, 0),
      disbursed: filtered.reduce((a, r) => a + r.amountDisbursed, 0),
      collected: filtered.reduce((a, r) => a + r.collectedAmount, 0),
      requested: filtered.reduce((a, r) => a + r.amountRequested, 0),
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
    doc.text("Family Relief Fund (FRF) Report", pageW / 2, 19, { align: "center" });

    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.text(
      `Generated: ${generatedOn()}   |   Claims: ${totals.count}   |   Relief approved: ${formatSAR(totals.approved)}   |   Relief disbursed: ${formatSAR(totals.disbursed)}   |   Member contributions: ${formatSAR(totals.collected)}`,
      pageW / 2,
      35,
      { align: "center" },
    );

    autoTable(doc, {
      startY: 42,
       head: [["#", "Claim / Claimant", "Status", "Relief Requested", "Relief Approved", "Relief Disbursed", "Member Contributions", "Claim Date"]],
      body: [
        ...filtered.map((r, i) => [
          String(i + 1),
          `${r.title || "—"}\n${r.claimantName}`,
          statusLabel(r.status),
          `SAR ${r.amountRequested.toFixed(2)}`,
          `SAR ${r.amountApproved.toFixed(2)}`,
          `SAR ${r.amountDisbursed.toFixed(2)}`,
          `SAR ${r.collectedAmount.toFixed(2)}`,
          r.claimDate ? formatDate(r.claimDate) : "—",
        ]),
        [
          "",
          "TOTALS",
          "",
          `SAR ${totals.requested.toFixed(2)}`,
          `SAR ${totals.approved.toFixed(2)}`,
          `SAR ${totals.disbursed.toFixed(2)}`,
          `SAR ${totals.collected.toFixed(2)}`,
          "",
        ],
      ],
      theme: "grid",
      headStyles: { fillColor: green, fontStyle: "bold", fontSize: 8, halign: "center" },
      bodyStyles: { fontSize: 7.5 },
      columnStyles: {
        0: { halign: "center", cellWidth: 10 },
        2: { halign: "center" },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.row.index === filtered.length) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [240, 253, 244];
        }
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(7.5);
    doc.setTextColor(130, 130, 130);
    doc.text("Committed to the Community", pageW / 2, finalY, { align: "center" });
    doc.text("Confidential — For internal use only", pageW / 2, finalY + 5, { align: "center" });

    doc.save(`DKMO_FRF_Report_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const exportExcel = async () => {
    if (filtered.length === 0) return;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "DKMO Portal";
    const sheet = workbook.addWorksheet("FRF Claims");

    sheet.mergeCells("A1:G1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "Dakshina Karnataka Muslim Ookota (DKMO)";
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: "center" };

    sheet.mergeCells("A2:G2");
    const subtitleCell = sheet.getCell("A2");
    subtitleCell.value = "Family Relief Fund (FRF) Report";
    subtitleCell.font = { bold: true, size: 11, color: { argb: "FF059669" } };
    subtitleCell.alignment = { horizontal: "center" };

    sheet.mergeCells("A3:G3");
    const metaCell = sheet.getCell("A3");
    metaCell.value = `Generated: ${generatedOn()}`;
    metaCell.font = { size: 9, color: { argb: "FF6B7280" } };
    metaCell.alignment = { horizontal: "center" };

    sheet.addRow([]);

    const headerRow = sheet.addRow([
      "#",
      "Claim Title",
      "Claimant",
      "Status",
      "Requested (SAR)",
      "Approved (SAR)",
      "Collected (SAR)",
      "Claim Date",
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
        r.title || "—",
        r.claimantName,
        statusLabel(r.status),
        Number(r.amountRequested.toFixed(2)),
         Number(r.amountApproved.toFixed(2)),
         Number(r.amountDisbursed.toFixed(2)),
        Number(r.collectedAmount.toFixed(2)),
        r.claimDate ? formatDate(r.claimDate) : "—",
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
      "",
      "TOTALS",
      "",
      Number(totals.requested.toFixed(2)),
      Number(totals.approved.toFixed(2)),
       Number(totals.disbursed.toFixed(2)),
      Number(totals.collected.toFixed(2)),
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
      { width: 28 },
      { width: 24 },
      { width: 16 },
      { width: 18 },
      { width: 18 },
      { width: 18 },
      { width: 16 },
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DKMO_FRF_Report_${new Date().toISOString().split("T")[0]}.xlsx`;
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
          <h1 className="text-3xl font-bold tracking-tight text-emerald-950 dark:text-emerald-100 mt-1">FRF Report</h1>
          <p className="text-emerald-700/80 dark:text-slate-400">
            Family Relief Fund claims — amounts requested, approved, and collected
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
              placeholder="Search claim title or claimant…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 dark:bg-slate-800 dark:border-slate-700"
              data-testid="input-search-frf"
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
          Total Claims: {totals.count}
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-slate-300 border border-emerald-200 dark:border-slate-700">
           Relief Approved: {formatSAR(totals.approved)}
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-slate-300 border border-emerald-200 dark:border-slate-700">
           Relief Disbursed: {formatSAR(totals.disbursed)}
         </span>
         <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-slate-300 border border-emerald-200 dark:border-slate-700">
           Member Contributions Collected: {formatSAR(totals.collected)}
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
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Claim</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Status</TableHead>
                   <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Relief Requested</TableHead>
                   <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Relief Approved</TableHead>
                   <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Relief Disbursed</TableHead>
                   <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Member Contributions</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Claim Date</TableHead>
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
                        <HeartHandshake className="h-8 w-8 text-emerald-200 dark:text-slate-700" />
                        <p>No FRF claims match the current filters.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {filtered.map((row, i) => (
                      <TableRow
                        key={row.id}
                        data-testid={`row-frf-${i}`}
                        className="dark:border-slate-800 hover:bg-emerald-50/40 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <TableCell className="text-emerald-500 dark:text-slate-500 text-sm">{i + 1}</TableCell>
                        <TableCell>
                          {row.title && (
                            <div className="font-medium text-emerald-950 dark:text-slate-200">{row.title}</div>
                          )}
                          <div className={cn("text-emerald-700 dark:text-slate-400", row.title ? "text-xs" : "font-medium text-emerald-950 dark:text-slate-200")}>
                            {row.claimantName || "—"}
                          </div>
                        </TableCell>
                        <TableCell>{statusBadge(row.status)}</TableCell>
                        <TableCell className="text-right text-emerald-900 dark:text-slate-300 tabular-nums">
                          {formatSAR(row.amountRequested)}
                        </TableCell>
                        <TableCell className="text-right text-emerald-900 dark:text-slate-300 tabular-nums font-medium">
                          {formatSAR(row.amountApproved)}
                        </TableCell>
                         <TableCell className="text-right text-emerald-700 dark:text-emerald-400 tabular-nums font-medium">
                           {formatSAR(row.amountDisbursed)}
                         </TableCell>
                        <TableCell className="text-right text-emerald-700 dark:text-emerald-400 tabular-nums font-medium">
                          {formatSAR(row.collectedAmount)}
                        </TableCell>
                        <TableCell className="text-sm text-emerald-700 dark:text-slate-400">
                          {row.claimDate ? formatDate(row.claimDate) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-emerald-50/70 dark:bg-slate-800/70 font-semibold dark:border-slate-700">
                       <TableCell colSpan={3} className="text-emerald-950 dark:text-slate-200">
                        Totals ({totals.count})
                      </TableCell>
                      <TableCell className="text-right text-emerald-950 dark:text-slate-200 tabular-nums">
                        {formatSAR(totals.requested)}
                      </TableCell>
                      <TableCell className="text-right text-emerald-950 dark:text-slate-200 tabular-nums">
                        {formatSAR(totals.approved)}
                      </TableCell>
                       <TableCell className="text-right text-emerald-950 dark:text-slate-200 tabular-nums">
                         {formatSAR(totals.disbursed)}
                       </TableCell>
                      <TableCell className="text-right text-emerald-950 dark:text-slate-200 tabular-nums">
                        {formatSAR(totals.collected)}
                      </TableCell>
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
