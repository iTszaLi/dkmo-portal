import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useListMembers, useListPayments } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSAR, formatDate, formatYearMonth } from "@/lib/utils";
import { getMembershipFeeAmount } from "@/lib/membership-fee";
import { ArrowLeft, Search, FileDown, FileSpreadsheet, Printer, Coins, Wallet, HeartHandshake, AlertCircle } from "lucide-react";
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

type PaymentTypeFilter = "all" | "membership" | "frf";

type PaymentRow = {
  receiptNumber: string;
  paidAt: string;
  membershipId: string;
  memberName: string;
  paymentType: string;
  paymentMethod: string;
  amountPaid: number;
  notes: string;
};

type MonthlyRow = {
  month: string; // YYYY-MM
  membershipFees: number;
  frfContributions: number;
  total: number;
};

const isFrf = (t: string) => t === "frf_contribution";

export default function FinancialSummaryReport() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<PaymentTypeFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data: payments, isLoading: isPaymentsLoading } = useListPayments();
  const { data: members, isLoading: isMembersLoading } = useListMembers();

  const isLoading = isPaymentsLoading || isMembersLoading;

  // ── normalize payments ──────────────────────────────────────────────────
  const allRows = useMemo((): PaymentRow[] => {
    if (!payments) return [];
    return payments.map((p) => ({
      receiptNumber: p.receiptNumber,
      paidAt: p.paidAt,
      membershipId: p.membershipId,
      memberName: p.memberName,
      paymentType: p.paymentType,
      paymentMethod: p.paymentMethod,
      amountPaid: Number(p.amountPaid),
      notes: p.notes ?? "",
    }));
  }, [payments]);

  // ── client-side filtering ──────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows
      .filter((r) => {
        if (q && !r.memberName.toLowerCase().includes(q) && !r.receiptNumber.toLowerCase().includes(q)) {
          return false;
        }
        if (typeFilter === "membership" && isFrf(r.paymentType)) return false;
        if (typeFilter === "frf" && !isFrf(r.paymentType)) return false;
        const day = (r.paidAt ?? "").slice(0, 10);
        if (fromDate && day < fromDate) return false;
        if (toDate && day > toDate) return false;
        return true;
      })
      .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""));
  }, [allRows, search, typeFilter, fromDate, toDate]);

  // ── summary cards ────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let totalCollected = 0;
    let membershipFees = 0;
    let frfContributions = 0;
    for (const r of filteredRows) {
      totalCollected += r.amountPaid;
      if (isFrf(r.paymentType)) frfContributions += r.amountPaid;
      else membershipFees += r.amountPaid;
    }
    return { totalCollected, membershipFees, frfContributions };
  }, [filteredRows]);

  // Outstanding membership fees — from members, ignores date filter (all time)
  const outstandingMembershipFees = useMemo(() => {
    if (!members) return 0;
    return members
      .filter((m) => !["paid", "exempt", "not_applicable", "review"].includes(m.feeStatus))
       .reduce((a, m) => a + getMembershipFeeAmount(m.membershipFee), 0);
  }, [members]);

  // ── monthly breakdown ─────────────────────────────────────────────────────
  const monthlyRows = useMemo((): MonthlyRow[] => {
    const map = new Map<string, MonthlyRow>();
    for (const r of filteredRows) {
      const month = (r.paidAt ?? "").slice(0, 7);
      if (!month) continue;
      let row = map.get(month);
      if (!row) {
        row = { month, membershipFees: 0, frfContributions: 0, total: 0 };
        map.set(month, row);
      }
      if (isFrf(r.paymentType)) row.frfContributions += r.amountPaid;
      else row.membershipFees += r.amountPaid;
      row.total += r.amountPaid;
    }
    return [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
  }, [filteredRows]);

  const monthlyTotals = useMemo(
    () =>
      monthlyRows.reduce(
        (acc, r) => {
          acc.membershipFees += r.membershipFees;
          acc.frfContributions += r.frfContributions;
          acc.total += r.total;
          return acc;
        },
        { membershipFees: 0, frfContributions: 0, total: 0 },
      ),
    [monthlyRows],
  );

  const today = new Date().toISOString().slice(0, 10);
  const typeLabel = (t: string) => (isFrf(t) ? "FRF Contribution" : "Membership Fee");

  // ── exports ────────────────────────────────────────────────────────────
  const exportPDF = async () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();
    const green: [number, number, number] = [5, 150, 105];
    const logoDataUrl = await loadImageAsBase64(`${basePath}/logo-circle.png`);

    // Header band
    doc.setFillColor(...green);
    doc.rect(0, 0, pageW, 28, "F");
    if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", 6, 4, 20, 20);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Dakshina Karnataka Muslim Ookota", pageW / 2, 11, { align: "center" });
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("Financial Summary Report", pageW / 2, 19, { align: "center" });

    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.text(
      `Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}   |   Total Collected: SAR ${totals.totalCollected.toLocaleString("en-IN", { minimumFractionDigits: 2 })}   |   Payments: ${filteredRows.length}`,
      pageW / 2,
      33,
      { align: "center" },
    );

    // Monthly summary table
    autoTable(doc, {
      startY: 40,
      head: [["Month", "Membership Fees", "FRF Contributions", "Total"]],
      body: [
        ...monthlyRows.map((r) => [
          formatYearMonth(r.month),
          `SAR ${r.membershipFees.toFixed(2)}`,
          `SAR ${r.frfContributions.toFixed(2)}`,
          `SAR ${r.total.toFixed(2)}`,
        ]),
        [
          "TOTALS",
          `SAR ${monthlyTotals.membershipFees.toFixed(2)}`,
          `SAR ${monthlyTotals.frfContributions.toFixed(2)}`,
          `SAR ${monthlyTotals.total.toFixed(2)}`,
        ],
      ],
      theme: "grid",
      headStyles: { fillColor: green, fontStyle: "bold", fontSize: 8, halign: "center" },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
      didParseCell: (data) => {
        if (data.row.index === monthlyRows.length) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [240, 253, 244];
        }
      },
    });

    // Detailed payments table
    const afterMonthly = (doc as any).lastAutoTable.finalY + 8;
    autoTable(doc, {
      startY: afterMonthly,
      head: [["#", "Receipt", "Date", "Member", "Type", "Method", "Amount"]],
      body: [
        ...filteredRows.map((r, i) => [
          String(i + 1),
          r.receiptNumber,
          formatDate(r.paidAt),
          r.memberName,
          typeLabel(r.paymentType),
          r.paymentMethod,
          `SAR ${r.amountPaid.toFixed(2)}`,
        ]),
        ["", "", "", "", "", "TOTAL", `SAR ${totals.totalCollected.toFixed(2)}`],
      ],
      theme: "grid",
      headStyles: { fillColor: green, fontStyle: "bold", fontSize: 8, halign: "center" },
      bodyStyles: { fontSize: 7.5 },
      columnStyles: { 0: { halign: "center", cellWidth: 10 }, 6: { halign: "right" } },
      didParseCell: (data) => {
        if (data.row.index === filteredRows.length) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [240, 253, 244];
        }
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(7.5);
    doc.setTextColor(130, 130, 130);
    doc.text("Dakshina Karnataka Muslim Ookota — Committed to the Community", pageW / 2, finalY, { align: "center" });
    doc.text("Confidential — For internal use only", pageW / 2, finalY + 5, { align: "center" });

    doc.save(`DKMO_Financial_Summary_${today}.pdf`);
  };

  const exportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "DKMO Portal";
    workbook.created = new Date();

    const green = "FF059669";
    const headerFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: green } };
    const thinBorder = {
      top: { style: "thin" as const },
      bottom: { style: "thin" as const },
      left: { style: "thin" as const },
      right: { style: "thin" as const },
    };

    const genLine = `Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}`;

    // ── Monthly Summary sheet ──
    const monthly = workbook.addWorksheet("Monthly Summary");
    monthly.mergeCells("A1:D1");
    const mTitle = monthly.getCell("A1");
    mTitle.value = "Dakshina Karnataka Muslim Ookota (DKMO)";
    mTitle.font = { bold: true, size: 14 };
    mTitle.alignment = { horizontal: "center" };
    monthly.mergeCells("A2:D2");
    const mSub = monthly.getCell("A2");
    mSub.value = "Financial Summary — Monthly Breakdown";
    mSub.font = { bold: true, size: 11, color: { argb: green } };
    mSub.alignment = { horizontal: "center" };
    monthly.mergeCells("A3:D3");
    const mMeta = monthly.getCell("A3");
    mMeta.value = genLine;
    mMeta.font = { size: 9, color: { argb: "FF6B7280" } };
    mMeta.alignment = { horizontal: "center" };
    monthly.addRow([]);

    const mHeader = monthly.addRow(["Month", "Membership Fees (SAR)", "FRF Contributions (SAR)", "Total (SAR)"]);
    mHeader.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = headerFill;
      cell.alignment = { horizontal: "center" };
      cell.border = thinBorder;
    });
    monthlyRows.forEach((r) => {
      const row = monthly.addRow([
        formatYearMonth(r.month),
        Number(r.membershipFees.toFixed(2)),
        Number(r.frfContributions.toFixed(2)),
        Number(r.total.toFixed(2)),
      ]);
      row.eachCell((cell) => (cell.border = thinBorder));
    });
    const mTotals = monthly.addRow([
      "TOTALS",
      Number(monthlyTotals.membershipFees.toFixed(2)),
      Number(monthlyTotals.frfContributions.toFixed(2)),
      Number(monthlyTotals.total.toFixed(2)),
    ]);
    mTotals.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
      cell.border = { ...thinBorder, top: { style: "medium" }, bottom: { style: "medium" } };
    });
    monthly.columns = [{ width: 18 }, { width: 24 }, { width: 26 }, { width: 18 }];

    // ── Payments sheet ──
    const pay = workbook.addWorksheet("Payments");
    pay.mergeCells("A1:G1");
    const pTitle = pay.getCell("A1");
    pTitle.value = "Dakshina Karnataka Muslim Ookota (DKMO)";
    pTitle.font = { bold: true, size: 14 };
    pTitle.alignment = { horizontal: "center" };
    pay.mergeCells("A2:G2");
    const pSub = pay.getCell("A2");
    pSub.value = "Financial Summary — Detailed Payments";
    pSub.font = { bold: true, size: 11, color: { argb: green } };
    pSub.alignment = { horizontal: "center" };
    pay.mergeCells("A3:G3");
    const pMeta = pay.getCell("A3");
    pMeta.value = genLine;
    pMeta.font = { size: 9, color: { argb: "FF6B7280" } };
    pMeta.alignment = { horizontal: "center" };
    pay.addRow([]);

    const pHeader = pay.addRow(["#", "Receipt No", "Date", "Member", "Type", "Method", "Amount (SAR)"]);
    pHeader.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = headerFill;
      cell.alignment = { horizontal: "center" };
      cell.border = thinBorder;
    });
    filteredRows.forEach((r, i) => {
      const row = pay.addRow([
        i + 1,
        r.receiptNumber,
        formatDate(r.paidAt),
        r.memberName,
        typeLabel(r.paymentType),
        r.paymentMethod,
        Number(r.amountPaid.toFixed(2)),
      ]);
      row.eachCell((cell) => (cell.border = thinBorder));
    });
    const pTotals = pay.addRow(["", "", "", "", "", "TOTAL", Number(totals.totalCollected.toFixed(2))]);
    pTotals.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
      cell.border = { ...thinBorder, top: { style: "medium" }, bottom: { style: "medium" } };
    });
    pay.columns = [
      { width: 5 },
      { width: 16 },
      { width: 16 },
      { width: 26 },
      { width: 18 },
      { width: 14 },
      { width: 14 },
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DKMO_Financial_Summary_${today}.xlsx`;
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
            className="inline-flex items-center gap-1 text-sm text-emerald-700/80 dark:text-slate-400 hover:text-emerald-800 dark:hover:text-slate-200 print:hidden"
            data-testid="link-all-reports"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All Reports
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-950 dark:text-emerald-100 print:text-xl">
            Financial Summary Report
          </h1>
          <p className="text-emerald-700/80 dark:text-slate-400">
            Collections overview — membership fees and FRF contributions
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={exportPDF}
            className="border-emerald-200 text-emerald-800 dark:border-slate-700 dark:text-emerald-300"
            data-testid="button-export-pdf"
          >
            <FileDown className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportExcel}
            className="border-emerald-200 text-emerald-800 dark:border-slate-700 dark:text-emerald-300"
            data-testid="button-export-excel"
          >
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="border-emerald-200 text-emerald-800 dark:border-slate-700 dark:text-emerald-300"
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
              placeholder="Search member name or receipt no…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 dark:bg-slate-800 dark:border-slate-700"
              data-testid="input-search-payments"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as PaymentTypeFilter)}>
            <SelectTrigger className="w-[190px] dark:bg-slate-800 dark:border-slate-700" data-testid="select-payment-type">
              <SelectValue placeholder="Payment type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="membership">Membership Fees</SelectItem>
              <SelectItem value="frf">FRF Contributions</SelectItem>
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
                className="h-9 rounded-md border border-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 px-3 text-sm w-[150px]"
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
                className="h-9 rounded-md border border-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 px-3 text-sm w-[150px]"
                data-testid="input-date-to"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={Wallet}
          label="Total Collected"
          value={formatSAR(totals.totalCollected)}
          accent="text-emerald-700 dark:text-emerald-400"
          loading={isLoading}
          testid="card-total-collected"
        />
        <SummaryCard
          icon={Coins}
          label="Membership Fees Collected"
          value={formatSAR(totals.membershipFees)}
          accent="text-green-700 dark:text-green-400"
          loading={isLoading}
          testid="card-membership-fees"
        />
        <SummaryCard
          icon={HeartHandshake}
          label="FRF Contributions Collected"
          value={formatSAR(totals.frfContributions)}
          accent="text-rose-600 dark:text-rose-400"
          loading={isLoading}
          testid="card-frf-contributions"
        />
        <SummaryCard
          icon={AlertCircle}
          label="Outstanding Membership Fees"
          value={formatSAR(outstandingMembershipFees)}
          accent="text-amber-600 dark:text-amber-400"
          loading={isLoading}
          testid="card-outstanding-fees"
          sublabel="All time"
        />
      </div>

      {/* Monthly breakdown table */}
      <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardContent className="pt-6">
          <h2 className="text-base font-semibold text-emerald-950 dark:text-emerald-100 mb-3">Monthly Breakdown</h2>
          <div className="rounded-md border border-emerald-100 dark:border-slate-800 overflow-hidden">
            <Table>
              <TableHeader className="bg-emerald-50/50 dark:bg-slate-800/60">
                <TableRow className="dark:border-slate-700">
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Month</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Membership Fees</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">FRF Contributions</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i} className="dark:border-slate-800">
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : monthlyRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-10 text-emerald-600 dark:text-slate-500">
                      No payments match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {monthlyRows.map((r) => (
                      <TableRow key={r.month} className="dark:border-slate-800 hover:bg-emerald-50/40 dark:hover:bg-slate-800/40">
                        <TableCell className="font-medium text-emerald-950 dark:text-slate-200">{formatYearMonth(r.month)}</TableCell>
                        <TableCell className="text-right text-emerald-900 dark:text-slate-300">{formatSAR(r.membershipFees)}</TableCell>
                        <TableCell className="text-right text-emerald-900 dark:text-slate-300">{formatSAR(r.frfContributions)}</TableCell>
                        <TableCell className="text-right font-medium text-emerald-900 dark:text-slate-200">{formatSAR(r.total)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-emerald-50/60 dark:bg-slate-800/40 border-t-2 border-emerald-200 dark:border-slate-600">
                      <TableCell className="font-bold text-emerald-950 dark:text-slate-100">Totals</TableCell>
                      <TableCell className="text-right font-bold text-emerald-900 dark:text-slate-200">{formatSAR(monthlyTotals.membershipFees)}</TableCell>
                      <TableCell className="text-right font-bold text-emerald-900 dark:text-slate-200">{formatSAR(monthlyTotals.frfContributions)}</TableCell>
                      <TableCell className="text-right font-bold text-emerald-900 dark:text-slate-200">{formatSAR(monthlyTotals.total)}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detailed payments table */}
      <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardContent className="pt-6">
          <h2 className="text-base font-semibold text-emerald-950 dark:text-emerald-100 mb-3">Detailed Payments</h2>
          <div className="rounded-md border border-emerald-100 dark:border-slate-800 overflow-hidden">
            <Table>
              <TableHeader className="bg-emerald-50/50 dark:bg-slate-800/60">
                <TableRow className="dark:border-slate-700">
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 w-10">#</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Receipt</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Date</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Member</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Type</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Method</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="dark:border-slate-800">
                      <TableCell><Skeleton className="h-4 w-6" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-emerald-600 dark:text-slate-500">
                      No payments match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {filteredRows.map((r, i) => (
                      <TableRow
                        key={`${r.receiptNumber}-${i}`}
                        className="dark:border-slate-800 hover:bg-emerald-50/40 dark:hover:bg-slate-800/40 transition-colors"
                        data-testid={`row-payment-${i}`}
                      >
                        <TableCell className="text-emerald-500 dark:text-slate-500 text-sm">{i + 1}</TableCell>
                        <TableCell className="text-sm text-emerald-900 dark:text-slate-300">{r.receiptNumber}</TableCell>
                        <TableCell className="text-sm text-emerald-700 dark:text-slate-400">{formatDate(r.paidAt)}</TableCell>
                        <TableCell>
                          <div className="font-medium text-emerald-950 dark:text-slate-200">{r.memberName}</div>
                          <div className="text-xs text-emerald-600 dark:text-slate-500">{r.membershipId}</div>
                        </TableCell>
                        <TableCell className="text-sm text-emerald-700 dark:text-slate-400">{typeLabel(r.paymentType)}</TableCell>
                        <TableCell className="text-sm text-emerald-700 dark:text-slate-400 capitalize">{r.paymentMethod}</TableCell>
                        <TableCell className="text-right font-medium text-emerald-900 dark:text-slate-300">{formatSAR(r.amountPaid)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-emerald-50/60 dark:bg-slate-800/40 border-t-2 border-emerald-200 dark:border-slate-600">
                      <TableCell className="font-bold text-emerald-950 dark:text-slate-100" colSpan={6}>
                        Total — {filteredRows.length} payment{filteredRows.length === 1 ? "" : "s"}
                      </TableCell>
                      <TableCell className="text-right font-bold text-emerald-900 dark:text-slate-200">{formatSAR(totals.totalCollected)}</TableCell>
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

function SummaryCard({
  icon: Icon,
  label,
  value,
  accent,
  loading,
  testid,
  sublabel,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  accent: string;
  loading: boolean;
  testid: string;
  sublabel?: string;
}) {
  return (
    <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm" data-testid={testid}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-emerald-900 dark:text-slate-300">{label}</span>
          <Icon className={`h-4 w-4 ${accent}`} />
        </div>
        {loading ? (
          <Skeleton className="h-7 w-24 mt-2" />
        ) : (
          <div className="text-xl font-bold text-emerald-950 dark:text-white mt-2">{value}</div>
        )}
        {sublabel && <div className="text-[11px] text-emerald-600/70 dark:text-slate-500 mt-1">{sublabel}</div>}
      </CardContent>
    </Card>
  );
}
