import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useListMembers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSAR, formatDate, feeStatusLabel, cn } from "@/lib/utils";
import { getMembershipFeeAmount } from "@/lib/membership-fee";
import { ArrowLeft, Search, FileDown, FileSpreadsheet, Printer, BarChart3 } from "lucide-react";
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

// ── types ────────────────────────────────────────────────────────────────────
type FeeStatus = "paid" | "partial" | "pending" | "unpaid" | "exempt" | "review";

type FeeSummaryRow = {
  membershipId: string;
  fullName: string;
  designation: string;
  city: string;
  refMemberName: string;
  membershipFee: number;
  feeStatus: FeeStatus;
  feePaidAt: string | null;
};

export default function FeesReport() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data: members, isLoading } = useListMembers();

  const feeSummaryRows = useMemo((): FeeSummaryRow[] => {
    if (!members) return [];
    return members.filter((m) => m.feeStatus !== "not_applicable").map((m) => ({
      membershipId: m.membershipId,
      fullName: m.fullName,
      designation: m.designation ?? "",
      city: m.city,
      refMemberName: m.refMemberName ?? "",
      membershipFee: m.feeStatus === "review" ? Number(m.membershipFee) : getMembershipFeeAmount(m.membershipFee),
      feeStatus: m.feeStatus as FeeStatus,
      feePaidAt: m.feePaidAt ?? null,
    }));
  }, [members]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const hasDateBound = fromDate !== "" || toDate !== "";
    return feeSummaryRows.filter((r) => {
      if (q) {
        const hay = [r.fullName, r.membershipId, r.designation, r.city, r.refMemberName]
          .map((v) => v.toLowerCase())
          .join(" ");
        if (!hay.includes(q)) return false;
      }
      if (statusFilter !== "all" && r.feeStatus !== statusFilter) return false;
      if (hasDateBound) {
        if (!r.feePaidAt) return false;
        const d = r.feePaidAt.slice(0, 10);
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
      }
      return true;
    });
  }, [feeSummaryRows, search, statusFilter, fromDate, toDate]);

  const summaryTotals = useMemo(() => ({
    totalFee: filteredRows.reduce((a, r) => a + r.membershipFee, 0),
    collected: filteredRows.filter((r) => r.feeStatus === "paid").reduce((a, r) => a + r.membershipFee, 0),
    outstanding: filteredRows.filter((r) => !["paid", "exempt", "review"].includes(r.feeStatus)).reduce((a, r) => a + r.membershipFee, 0),
    paidCount: filteredRows.filter((r) => r.feeStatus === "paid").length,
    pendingCount: filteredRows.filter((r) => r.feeStatus === "pending" || r.feeStatus === "partial").length,
    unpaidCount: filteredRows.filter((r) => r.feeStatus === "unpaid").length,
  }), [filteredRows]);

  const hasFilters = search.trim() !== "" || statusFilter !== "all" || fromDate !== "" || toDate !== "";

  // ── exports: membership fee summary ───────────────────────────────────────
  const exportFeeSummaryExcel = async () => {
    if (filteredRows.length === 0) return;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "DKMO Portal";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Membership Fees");

    // Title rows
    sheet.mergeCells("A1:H1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "Dakshina Karnataka Muslim Ookota (DKMO)";
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: "center" };

    sheet.mergeCells("A2:H2");
    const subtitleCell = sheet.getCell("A2");
    subtitleCell.value = "Membership Fee Summary";
    subtitleCell.font = { bold: true, size: 11, color: { argb: "FF059669" } };
    subtitleCell.alignment = { horizontal: "center" };

    sheet.mergeCells("A3:H3");
    const metaCell = sheet.getCell("A3");
    metaCell.value = `Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}`;
    metaCell.font = { size: 9, color: { argb: "FF6B7280" } };
    metaCell.alignment = { horizontal: "center" };

    sheet.addRow([]); // spacer

    // Header row
    const headerRow = sheet.addRow([
      "#", "Member ID", "Full Name", "City", "Reference Member",
      "Membership Fee (SAR)", "Fee Status", "Fee Paid On",
    ]);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } };
      cell.alignment = { horizontal: "center" };
      cell.border = {
        top: { style: "thin" }, bottom: { style: "thin" },
        left: { style: "thin" }, right: { style: "thin" },
      };
    });

    // Data rows
    filteredRows.forEach((r, i) => {
      const row = sheet.addRow([
        i + 1, r.membershipId, r.fullName, r.city, r.refMemberName || "—",
        Number(r.membershipFee.toFixed(2)),
        feeStatusLabel(r.feeStatus),
        r.feePaidAt ? formatDate(r.feePaidAt) : "—",
      ]);
      const statusColor = r.feeStatus === "paid" ? "FFD1FAE5" : r.feeStatus === "pending" || r.feeStatus === "partial" ? "FFFEF9C3" : r.feeStatus === "exempt" ? "FFF1F5F9" : "FFFEE2E2";
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: statusColor } };
        cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
      });
    });

    // Totals row
    const totalsRow = sheet.addRow([
      "", "", "TOTALS", "", "",
      Number(summaryTotals.totalFee.toFixed(2)),
      `${summaryTotals.paidCount} paid / ${summaryTotals.pendingCount} pending / ${summaryTotals.unpaidCount} unpaid`,
      "",
    ]);
    totalsRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
      cell.border = { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "thin" }, right: { style: "thin" } };
    });

    // Column widths
    sheet.columns = [
      { width: 5 }, { width: 14 }, { width: 26 }, { width: 14 }, { width: 24 },
      { width: 20 }, { width: 14 }, { width: 16 },
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DKMO_Membership_Fees_${new Date().toISOString().split("T")[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportFeeSummaryPDF = async () => {
    if (filteredRows.length === 0) return;
    const doc = new jsPDF({ orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();
    const green: [number, number, number] = [5, 150, 105];
    const logoDataUrl = await loadImageAsBase64(`${basePath}/logo-circle.png`);

    // Header band
    doc.setFillColor(...green);
    doc.rect(0, 0, pageW, 28, "F");

    // Logo (real image)
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", 6, 4, 20, 20);
    }

    // Title text (centre)
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Dakshina Karnataka Muslim Ookota", pageW / 2, 11, { align: "center" });
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("Membership Fee Summary", pageW / 2, 19, { align: "center" });

    // Meta line
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.text(
      `Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}   |   Total Members: ${filteredRows.length}   |   Collected: SAR ${summaryTotals.collected.toLocaleString("en-IN", { minimumFractionDigits: 2 })}   |   Outstanding: SAR ${summaryTotals.outstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      pageW / 2, 33, { align: "center" },
    );

    // Status chips row
    doc.setFontSize(9);
    doc.setFillColor(209, 250, 229); doc.roundedRect(10, 36, 55, 8, 2, 2, "F");
    doc.setTextColor(5, 150, 105); doc.text(`Paid: ${summaryTotals.paidCount} members`, 37, 41.5, { align: "center" });

    doc.setFillColor(254, 249, 195); doc.roundedRect(70, 36, 55, 8, 2, 2, "F");
    doc.setTextColor(180, 130, 0); doc.text(`Pending: ${summaryTotals.pendingCount} members`, 97, 41.5, { align: "center" });

    doc.setFillColor(254, 226, 226); doc.roundedRect(130, 36, 55, 8, 2, 2, "F");
    doc.setTextColor(220, 38, 38); doc.text(`Unpaid: ${summaryTotals.unpaidCount} members`, 157, 41.5, { align: "center" });

    // Main table
    autoTable(doc, {
      startY: 48,
      head: [["#", "Member ID", "Full Name", "City", "Reference Member", "Fee", "Status", "Paid On"]],
      body: [
        ...filteredRows.map((r, i) => [
          String(i + 1),
          r.membershipId,
          r.fullName,
          r.city,
          r.refMemberName || "—",
          `SAR ${r.membershipFee.toFixed(2)}`,
          feeStatusLabel(r.feeStatus),
          r.feePaidAt ? formatDate(r.feePaidAt) : "—",
        ]),
        // Totals row
        [
          "", "", "TOTALS", "", "",
          `SAR ${summaryTotals.totalFee.toFixed(2)}`,
          "", "",
        ],
      ],
      theme: "grid",
      headStyles: { fillColor: green, fontStyle: "bold", fontSize: 8, halign: "center" },
      bodyStyles: { fontSize: 7.5 },
      columnStyles: {
        0: { halign: "center", cellWidth: 10 },
        1: { cellWidth: 26 },
        2: { cellWidth: 50 },
        3: { cellWidth: 28 },
        4: { cellWidth: 45 },
        5: { halign: "right", cellWidth: 28 },
        6: { halign: "center", cellWidth: 22 },
        7: { cellWidth: 28 },
      },
      didParseCell: (data) => {
        const isLastRow = data.row.index === filteredRows.length;
        if (isLastRow) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [240, 253, 244];
        }
        if (!isLastRow && data.column.index === 6 && data.section === "body") {
          const status = (data.cell.raw as string).toLowerCase();
          if (status === "paid") data.cell.styles.textColor = [5, 150, 105];
          else if (status === "pending") data.cell.styles.textColor = [180, 130, 0];
          else if (status === "unpaid") data.cell.styles.textColor = [220, 38, 38];
        }
      },
    });

    // Footer
    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(7.5);
    doc.setTextColor(130, 130, 130);
    doc.text("Dakshina Karnataka Muslim Ookota — Committed to the Community", pageW / 2, finalY, { align: "center" });
    doc.text(`Page 1 of 1  |  Confidential — For internal use only`, pageW / 2, finalY + 5, { align: "center" });

    doc.save(`DKMO_Membership_Fees_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <Link href="/reports" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline" data-testid="link-all-reports">
          <ArrowLeft className="h-3.5 w-3.5" /> All Reports
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-950 dark:text-emerald-100">Membership Fee Report</h1>
          <p className="text-emerald-700/80 dark:text-slate-400">Fee status for every member — paid, pending, unpaid, and collections.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={exportFeeSummaryPDF} disabled={isLoading || filteredRows.length === 0} className="border-emerald-300 text-emerald-800 dark:border-slate-700 dark:text-emerald-300" data-testid="button-export-pdf">
            <FileDown className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportFeeSummaryExcel} disabled={isLoading || filteredRows.length === 0} className="border-emerald-300 text-emerald-800 dark:border-slate-700 dark:text-emerald-300" data-testid="button-export-excel">
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="border-emerald-300 text-emerald-800 dark:border-slate-700 dark:text-emerald-300" data-testid="button-print-report">
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
              placeholder="Search member, ID, city, reference…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 border-emerald-100 dark:bg-slate-800 dark:border-slate-700"
              data-testid="input-search-fees"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] dark:bg-slate-800 dark:border-slate-700" data-testid="select-fee-status">
              <SelectValue placeholder="Fee status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="exempt">Exempt</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <div>
              <label className="text-[11px] text-emerald-700/70 dark:text-slate-500 block mb-1">From</label>
              <input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className="w-[150px] h-9 rounded-md border border-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 px-3 text-sm" data-testid="input-date-from" />
            </div>
            <div>
              <label className="text-[11px] text-emerald-700/70 dark:text-slate-500 block mb-1">To</label>
              <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className="w-[150px] h-9 rounded-md border border-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 px-3 text-sm" data-testid="input-date-to" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
            <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Membership Fee Summary
          </CardTitle>
          <CardDescription className="dark:text-slate-400">
            Recorded membership fees and preserved Access evidence. Missing legacy information is excluded, not treated as unpaid.
            {hasFilters ? ` Showing ${filteredRows.length} of ${feeSummaryRows.length}.` : ""}
          </CardDescription>

          {!isLoading && (
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300">
                Paid: {summaryTotals.paidCount}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">
                Pending: {summaryTotals.pendingCount}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300">
                Unpaid: {summaryTotals.unpaidCount}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-slate-300 border border-emerald-200 dark:border-slate-700">
                Collected: {formatSAR(summaryTotals.collected)}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 dark:bg-slate-800 text-red-700 dark:text-red-400 border border-red-200 dark:border-slate-700">
                Outstanding: {formatSAR(summaryTotals.outstanding)}
              </span>
            </div>
          )}
        </CardHeader>

        <CardContent>
          <div className="rounded-md border border-emerald-100 dark:border-slate-800 overflow-hidden">
            <Table>
              <TableHeader className="bg-emerald-50/50 dark:bg-slate-800/60">
                <TableRow className="dark:border-slate-700">
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 w-10">#</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Member</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Reference Member</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Membership Fee</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-center">Status</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Paid On</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="dark:border-slate-800">
                      <TableCell><Skeleton className="h-4 w-6" /></TableCell>
                      <TableCell><Skeleton className="h-10 w-44" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 mx-auto rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-emerald-600 dark:text-slate-500">
                      {hasFilters ? "No members match the current filters." : "No members yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {filteredRows.map((row, i) => (
                      <TableRow
                        key={row.membershipId}
                        className={cn(
                          "dark:border-slate-800 transition-colors",
                          row.feeStatus === "paid"
                            ? "hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20"
                            : row.feeStatus === "pending" || row.feeStatus === "partial"
                            ? "hover:bg-amber-50/40 dark:hover:bg-amber-950/10"
                            : row.feeStatus === "exempt"
                            ? "hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                            : "hover:bg-red-50/40 dark:hover:bg-red-950/10",
                        )}
                        data-testid={`row-fee-${i}`}
                      >
                        <TableCell className="text-emerald-500 dark:text-slate-500 text-sm">{i + 1}</TableCell>
                        <TableCell>
                          <div className="font-medium text-emerald-950 dark:text-slate-200">{row.fullName}</div>
                          <div className="text-xs text-emerald-600 dark:text-slate-500">{row.membershipId} · {row.city}</div>
                        </TableCell>
                        <TableCell className="text-sm text-emerald-700 dark:text-slate-400">{row.refMemberName || "—"}</TableCell>
                        <TableCell className="text-right text-emerald-900 dark:text-slate-300 font-medium">{formatSAR(row.membershipFee)}</TableCell>
                        <TableCell className="text-center">
                          <Badge
                            className={cn(
                              "text-xs font-semibold uppercase",
                              row.feeStatus === "paid"
                                ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100"
                                : row.feeStatus === "pending" || row.feeStatus === "partial"
                                ? "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100"
                                : row.feeStatus === "exempt"
                                ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100"
                                : "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300 hover:bg-red-100",
                            )}
                          >
                            {feeStatusLabel(row.feeStatus)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-emerald-700 dark:text-slate-400">
                          {row.feePaidAt ? formatDate(row.feePaidAt) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}

                    {/* Totals row */}
                    <TableRow className="bg-emerald-50/60 dark:bg-slate-800/40 border-t-2 border-emerald-200 dark:border-slate-600">
                      <TableCell />
                      <TableCell className="font-bold text-emerald-950 dark:text-slate-100" colSpan={2}>
                        Totals — {filteredRows.length} members
                      </TableCell>
                      <TableCell className="text-right font-bold text-emerald-900 dark:text-slate-200">{formatSAR(summaryTotals.totalFee)}</TableCell>
                      <TableCell colSpan={2} />
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
