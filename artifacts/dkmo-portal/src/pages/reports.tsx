import { useMemo, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { useListMembers, useListPayments, useGetDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FileText, Printer, FileSpreadsheet, Search, CalendarRange, X, Users, CreditCard, BarChart3, CalendarDays } from "lucide-react";
import { formatSAR, formatDate, getCurrentMonth, formatYearMonth } from "@/lib/utils";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── types ────────────────────────────────────────────────────────────────────
type MonthlySummaryRow = {
  membershipId: string;
  fullName: string;
  designation: string;
  city: string;
  monthlyDue: number;
  amountPaid: number;
  amountOwed: number;
  status: "paid" | "partial" | "unpaid";
  paymentMethod: string;
  receiptNumber: string;
};

export default function Reports() {
  const [search, setSearch] = useState("");
  const [summaryMonth, setSummaryMonth] = useState(getCurrentMonth());
  const currentMonth = getCurrentMonth();
  const searchString = useSearch();
  const [, setLocation] = useLocation();

  const monthFilter = useMemo(() => {
    const params = new URLSearchParams(searchString);
    const m = params.get("month");
    if (m && /^\d{4}-\d{2}$/.test(m)) return m;
    return null;
  }, [searchString]);

  const { data: members, isLoading: isMembersLoading } = useListMembers();
  const { data: payments, isLoading: isPaymentsLoading } = useListPayments();
  const { data: summary } = useGetDashboardSummary({ month: currentMonth });

  // ── existing receipt-search scope ────────────────────────────────────────
  const monthScopedPayments = useMemo(() => {
    if (!payments) return [];
    if (!monthFilter) return payments;
    return payments.filter((p) => p.month === monthFilter);
  }, [payments, monthFilter]);

  const monthTotal = useMemo(
    () => monthScopedPayments.reduce((acc, p) => acc + Number(p.amountPaid), 0),
    [monthScopedPayments],
  );

  // ── monthly collection summary ────────────────────────────────────────────
  const monthlySummaryRows = useMemo((): MonthlySummaryRow[] => {
    if (!members || !payments) return [];

    const paymentsForMonth = payments.filter((p) => p.month === summaryMonth);

    return members.map((m) => {
      const memberPayments = paymentsForMonth.filter((p) => p.memberId === m.id);
      const amountPaid = memberPayments.reduce((acc, p) => acc + Number(p.amountPaid), 0);
      const monthlyDue = Number(m.monthlyAmount);
      const amountOwed = Math.max(0, monthlyDue - amountPaid);
      const status: MonthlySummaryRow["status"] =
        amountPaid >= monthlyDue ? "paid" : amountPaid > 0 ? "partial" : "unpaid";
      const lastPayment = memberPayments[memberPayments.length - 1];

      return {
        membershipId: m.membershipId,
        fullName: m.fullName,
        designation: m.designation ?? "",
        city: m.city,
        monthlyDue,
        amountPaid,
        amountOwed,
        status,
        paymentMethod: lastPayment?.paymentMethod ?? "—",
        receiptNumber: lastPayment?.receiptNumber ?? "—",
      };
    });
  }, [members, payments, summaryMonth]);

  const summaryTotals = useMemo(() => ({
    totalDue: monthlySummaryRows.reduce((a, r) => a + r.monthlyDue, 0),
    totalPaid: monthlySummaryRows.reduce((a, r) => a + r.amountPaid, 0),
    totalOwed: monthlySummaryRows.reduce((a, r) => a + r.amountOwed, 0),
    paidCount: monthlySummaryRows.filter((r) => r.status === "paid").length,
    partialCount: monthlySummaryRows.filter((r) => r.status === "partial").length,
    unpaidCount: monthlySummaryRows.filter((r) => r.status === "unpaid").length,
  }), [monthlySummaryRows]);

  // ── helpers ───────────────────────────────────────────────────────────────
  const downloadExcel = async (
    filename: string,
    sheetName: string,
    columns: { header: string; key: string; width?: number }[],
    rows: Record<string, unknown>[],
  ) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetName);
    sheet.columns = columns;
    sheet.addRows(rows);
    sheet.getRow(1).font = { bold: true };
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── exports: members / payments ───────────────────────────────────────────
  const exportMembersExcel = () => {
    if (!members) return;
    downloadExcel(
      `DKMO_Members_${new Date().toISOString().split("T")[0]}.xlsx`,
      "Members",
      [
        { header: "Member ID", key: "memberId", width: 16 },
        { header: "Full Name", key: "fullName", width: 24 },
        { header: "Designation", key: "designation", width: 24 },
        { header: "Mobile", key: "mobile", width: 16 },
        { header: "City", key: "city", width: 16 },
        { header: "Country", key: "country", width: 16 },
        { header: "Monthly Amount", key: "monthlyAmount", width: 16 },
        { header: "Joined Date", key: "joinedDate", width: 16 },
      ],
      members.map((m) => ({
        memberId: m.membershipId,
        fullName: m.fullName,
        designation: m.designation ?? "",
        mobile: m.mobileNumber,
        city: m.city,
        country: m.country,
        monthlyAmount: m.monthlyAmount,
        joinedDate: formatDate(m.createdAt),
      })),
    );
  };

  const exportPaymentsExcel = () => {
    if (!payments) return;
    downloadExcel(
      `DKMO_Payments_${new Date().toISOString().split("T")[0]}.xlsx`,
      "Payments",
      [
        { header: "Receipt No", key: "receiptNo", width: 16 },
        { header: "Date", key: "date", width: 16 },
        { header: "Member ID", key: "memberId", width: 16 },
        { header: "Member Name", key: "memberName", width: 24 },
        { header: "Month", key: "month", width: 12 },
        { header: "Method", key: "method", width: 14 },
        { header: "Amount", key: "amount", width: 12 },
        { header: "Notes", key: "notes", width: 24 },
      ],
      payments.map((p) => ({
        receiptNo: p.receiptNumber,
        date: formatDate(p.paidAt),
        memberId: p.membershipId,
        memberName: p.memberName,
        month: p.month,
        method: p.paymentMethod,
        amount: p.amountPaid,
        notes: p.notes ?? "",
      })),
    );
  };

  const exportMembersPDF = () => {
    if (!members) return;
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("DKMO Members Report", 14, 22);
    doc.setFontSize(11);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);
    autoTable(doc, {
      startY: 40,
      head: [["ID", "Name", "Designation", "Mobile", "City", "Amount"]],
      body: members.map((m) => [m.membershipId, m.fullName, m.designation ?? "", m.mobileNumber, m.city, `SAR ${m.monthlyAmount}`]),
      theme: "grid",
      headStyles: { fillColor: [5, 150, 105] },
    });
    doc.save(`DKMO_Members_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const exportPaymentsPDF = () => {
    if (!payments) return;
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("DKMO Payments Report", 14, 22);
    doc.setFontSize(11);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);
    autoTable(doc, {
      startY: 40,
      head: [["Receipt", "Date", "Member", "Month", "Amount"]],
      body: payments.map((p) => [p.receiptNumber, formatDate(p.paidAt), p.memberName, p.month, `SAR ${p.amountPaid}`]),
      theme: "grid",
      headStyles: { fillColor: [5, 150, 105] },
    });
    doc.save(`DKMO_Payments_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  // ── exports: monthly summary ──────────────────────────────────────────────
  const exportMonthlySummaryExcel = async () => {
    if (monthlySummaryRows.length === 0) return;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "DKMO Portal";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(`Collection ${summaryMonth}`);

    // Title rows
    sheet.mergeCells("A1:J1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "Dakshina Karnataka Muslim Ookota (DKMO)";
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: "center" };

    sheet.mergeCells("A2:J2");
    const subtitleCell = sheet.getCell("A2");
    subtitleCell.value = `Monthly Collection Summary — ${formatYearMonth(summaryMonth)}`;
    subtitleCell.font = { bold: true, size: 11, color: { argb: "FF059669" } };
    subtitleCell.alignment = { horizontal: "center" };

    sheet.mergeCells("A3:J3");
    const metaCell = sheet.getCell("A3");
    metaCell.value = `Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}`;
    metaCell.font = { size: 9, color: { argb: "FF6B7280" } };
    metaCell.alignment = { horizontal: "center" };

    sheet.addRow([]); // spacer

    // Header row
    const headerRow = sheet.addRow([
      "#", "Member ID", "Full Name", "Designation", "City",
      "Monthly Due (SAR)", "Amount Paid (SAR)", "Balance Due (SAR)", "Status", "Payment Method",
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
    monthlySummaryRows.forEach((r, i) => {
      const row = sheet.addRow([
        i + 1, r.membershipId, r.fullName, r.designation, r.city,
        Number(r.monthlyDue.toFixed(2)),
        Number(r.amountPaid.toFixed(2)),
        Number(r.amountOwed.toFixed(2)),
        r.status.toUpperCase(),
        r.paymentMethod === "—" ? "—" : r.paymentMethod.replace("_", " ").toUpperCase(),
      ]);
      const statusColor = r.status === "paid" ? "FFD1FAE5" : r.status === "partial" ? "FFFEF9C3" : "FFFEE2E2";
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: statusColor } };
        cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
      });
      // Red balance cell if owed
      if (r.amountOwed > 0) {
        row.getCell(8).font = { color: { argb: "FFDC2626" }, bold: true };
      }
    });

    // Totals row
    const totalsRow = sheet.addRow([
      "", "", "TOTALS", "", "",
      Number(summaryTotals.totalDue.toFixed(2)),
      Number(summaryTotals.totalPaid.toFixed(2)),
      Number(summaryTotals.totalOwed.toFixed(2)),
      `${summaryTotals.paidCount} paid / ${summaryTotals.partialCount} partial / ${summaryTotals.unpaidCount} unpaid`,
      "",
    ]);
    totalsRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
      cell.border = { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "thin" }, right: { style: "thin" } };
    });
    totalsRow.getCell(8).font = { bold: true, color: { argb: "FFDC2626" } };

    // Column widths
    sheet.columns = [
      { width: 5 }, { width: 14 }, { width: 26 }, { width: 24 }, { width: 14 },
      { width: 18 }, { width: 18 }, { width: 18 }, { width: 12 }, { width: 18 },
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DKMO_Monthly_Summary_${summaryMonth}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportMonthlySummaryPDF = () => {
    if (monthlySummaryRows.length === 0) return;
    const doc = new jsPDF({ orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();
    const green: [number, number, number] = [5, 150, 105];

    // Header band
    doc.setFillColor(...green);
    doc.rect(0, 0, pageW, 28, "F");

    // Logo placeholder area (left)
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(6, 4, 20, 20, 2, 2, "F");
    doc.setFontSize(7);
    doc.setTextColor(5, 150, 105);
    doc.text("DKMO", 16, 16, { align: "center" });

    // Title text (centre)
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Dakshina Karnataka Muslim Ookota", pageW / 2, 11, { align: "center" });
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Monthly Collection Summary — ${formatYearMonth(summaryMonth)}`, pageW / 2, 19, { align: "center" });

    // Meta line
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.text(
      `Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}   |   Total Members: ${monthlySummaryRows.length}   |   Collected: SAR ${summaryTotals.totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}   |   Outstanding: SAR ${summaryTotals.totalOwed.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      pageW / 2, 33, { align: "center" },
    );

    // Status chips row
    doc.setFontSize(9);
    doc.setFillColor(209, 250, 229); doc.roundedRect(10, 36, 55, 8, 2, 2, "F");
    doc.setTextColor(5, 150, 105); doc.text(`✓ Paid: ${summaryTotals.paidCount} members`, 37, 41.5, { align: "center" });

    doc.setFillColor(254, 249, 195); doc.roundedRect(70, 36, 55, 8, 2, 2, "F");
    doc.setTextColor(180, 130, 0); doc.text(`◑ Partial: ${summaryTotals.partialCount} members`, 97, 41.5, { align: "center" });

    doc.setFillColor(254, 226, 226); doc.roundedRect(130, 36, 55, 8, 2, 2, "F");
    doc.setTextColor(220, 38, 38); doc.text(`✗ Unpaid: ${summaryTotals.unpaidCount} members`, 157, 41.5, { align: "center" });

    // Main table
    autoTable(doc, {
      startY: 48,
      head: [["#", "Member ID", "Full Name", "Designation", "City", "Monthly Due", "Paid", "Balance Due", "Status", "Method"]],
      body: [
        ...monthlySummaryRows.map((r, i) => [
          String(i + 1),
          r.membershipId,
          r.fullName,
          r.designation || "—",
          r.city,
          `SAR ${r.monthlyDue.toFixed(2)}`,
          r.amountPaid > 0 ? `SAR ${r.amountPaid.toFixed(2)}` : "—",
          r.amountOwed > 0 ? `SAR ${r.amountOwed.toFixed(2)}` : "—",
          r.status.toUpperCase(),
          r.paymentMethod === "—" ? "—" : r.paymentMethod.replace("_", " "),
        ]),
        // Totals row
        [
          "", "", "TOTALS", "", "",
          `SAR ${summaryTotals.totalDue.toFixed(2)}`,
          `SAR ${summaryTotals.totalPaid.toFixed(2)}`,
          `SAR ${summaryTotals.totalOwed.toFixed(2)}`,
          "", "",
        ],
      ],
      theme: "grid",
      headStyles: { fillColor: green, fontStyle: "bold", fontSize: 8, halign: "center" },
      bodyStyles: { fontSize: 7.5 },
      columnStyles: {
        0: { halign: "center", cellWidth: 8 },
        1: { cellWidth: 22 },
        2: { cellWidth: 38 },
        3: { cellWidth: 30 },
        4: { cellWidth: 20 },
        5: { halign: "right", cellWidth: 22 },
        6: { halign: "right", cellWidth: 22 },
        7: { halign: "right", cellWidth: 22 },
        8: { halign: "center", cellWidth: 16 },
        9: { cellWidth: 18 },
      },
      didParseCell: (data) => {
        const isLastRow = data.row.index === monthlySummaryRows.length;
        if (isLastRow) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [240, 253, 244];
        }
        if (!isLastRow && data.column.index === 7 && data.section === "body") {
          const val = data.cell.raw as string;
          if (val && val !== "—") data.cell.styles.textColor = [220, 38, 38];
        }
        if (!isLastRow && data.column.index === 8 && data.section === "body") {
          const status = (data.cell.raw as string).toLowerCase();
          if (status === "paid") data.cell.styles.textColor = [5, 150, 105];
          else if (status === "partial") data.cell.styles.textColor = [180, 130, 0];
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

    doc.save(`DKMO_Monthly_Summary_${summaryMonth}.pdf`);
  };

  // ── receipt print ─────────────────────────────────────────────────────────
  const printReceipt = (payment: any) => {
    const printContent = document.getElementById(`receipt-${payment.id}`);
    if (!printContent) return;
    const originalBody = document.body.innerHTML;
    document.body.innerHTML = printContent.innerHTML;
    window.print();
    document.body.innerHTML = originalBody;
    window.location.reload();
  };

  const filteredPayments = monthScopedPayments.filter(
    (p) =>
      p.memberName.toLowerCase().includes(search.toLowerCase()) ||
      p.receiptNumber.toLowerCase().includes(search.toLowerCase()) ||
      p.membershipId.toLowerCase().includes(search.toLowerCase()),
  );

  const clearMonthFilter = () => setLocation("/reports");
  const isLoading = isMembersLoading || isPaymentsLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-950 dark:text-emerald-100">Reports & Exports</h1>
          <p className="text-emerald-700/80 dark:text-slate-400">Generate reports and print receipts</p>
        </div>
      </div>

      {monthFilter && (
        <Card className="rounded-2xl border-emerald-200 dark:border-emerald-900/40 bg-gradient-to-r from-emerald-50 to-orange-50/50 dark:from-emerald-950/30 dark:to-orange-950/20 shadow-sm">
          <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white dark:bg-slate-800 border border-emerald-200 dark:border-slate-700 flex items-center justify-center shrink-0">
                <CalendarRange className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-200">
                  Showing report for {formatYearMonth(monthFilter)}
                </p>
                <p className="text-xs text-emerald-800/80 dark:text-slate-400">
                  {monthScopedPayments.length} payment{monthScopedPayments.length === 1 ? "" : "s"} · Total {formatSAR(monthTotal)}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={clearMonthFilter}
              className="border-emerald-200 dark:border-slate-700 text-emerald-800 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4 mr-1" /> Clear month filter
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Existing: members / payments exports ── */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
              <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Members Data
            </CardTitle>
            <CardDescription className="dark:text-slate-400">Export complete member directory</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-4">
            <Button onClick={exportMembersExcel} className="flex-1 bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white">
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
            </Button>
            <Button onClick={exportMembersPDF} variant="outline" className="flex-1 border-emerald-200 dark:border-slate-700 text-emerald-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-slate-800">
              <FileText className="mr-2 h-4 w-4" /> PDF
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
              <CreditCard className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Payments Data
            </CardTitle>
            <CardDescription className="dark:text-slate-400">Export all recorded payment history</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-4">
            <Button onClick={exportPaymentsExcel} className="flex-1 bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white">
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
            </Button>
            <Button onClick={exportPaymentsPDF} variant="outline" className="flex-1 border-emerald-200 dark:border-slate-700 text-emerald-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-slate-800">
              <FileText className="mr-2 h-4 w-4" /> PDF
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ── NEW: Monthly Collection Summary ── */}
      <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
                <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                Monthly Collection Summary
              </CardTitle>
              <CardDescription className="dark:text-slate-400">
                Full member-by-member breakdown for any month — paid, partial, and unpaid
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Month picker */}
              <div className="flex items-center gap-2 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-emerald-100 dark:border-slate-700 shadow-sm">
                <CalendarDays className="h-4 w-4 text-emerald-600 dark:text-slate-400 shrink-0" />
                <Input
                  type="month"
                  value={summaryMonth}
                  onChange={(e) => setSummaryMonth(e.target.value)}
                  className="border-0 focus-visible:ring-0 shadow-none h-8 w-36 px-1 text-sm dark:bg-transparent dark:text-slate-200"
                />
              </div>

              <Button
                onClick={exportMonthlySummaryExcel}
                disabled={isLoading || monthlySummaryRows.length === 0}
                className="bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white"
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
              </Button>
              <Button
                onClick={exportMonthlySummaryPDF}
                disabled={isLoading || monthlySummaryRows.length === 0}
                variant="outline"
                className="border-emerald-200 dark:border-slate-700 text-emerald-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-slate-800"
              >
                <FileText className="mr-2 h-4 w-4" /> PDF
              </Button>
            </div>
          </div>

          {/* Summary stat chips */}
          {!isLoading && monthlySummaryRows.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300">
                ✓ Paid: {summaryTotals.paidCount}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">
                ◑ Partial: {summaryTotals.partialCount}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300">
                ✗ Unpaid: {summaryTotals.unpaidCount}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-slate-300 border border-emerald-200 dark:border-slate-700">
                Collected: {formatSAR(summaryTotals.totalPaid)}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 dark:bg-slate-800 text-red-700 dark:text-red-400 border border-red-200 dark:border-slate-700">
                Outstanding: {formatSAR(summaryTotals.totalOwed)}
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
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Designation</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Monthly Due</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Paid</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Balance</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-center">Status</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Method</TableHead>
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
                      <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 mx-auto rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    </TableRow>
                  ))
                ) : (
                  <>
                    {monthlySummaryRows.map((row, i) => (
                      <TableRow
                        key={row.membershipId}
                        className={cn(
                          "dark:border-slate-800 transition-colors",
                          row.status === "paid"
                            ? "hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20"
                            : row.status === "partial"
                            ? "hover:bg-amber-50/40 dark:hover:bg-amber-950/10"
                            : "hover:bg-red-50/40 dark:hover:bg-red-950/10",
                        )}
                      >
                        <TableCell className="text-emerald-500 dark:text-slate-500 text-sm">{i + 1}</TableCell>
                        <TableCell>
                          <div className="font-medium text-emerald-950 dark:text-slate-200">{row.fullName}</div>
                          <div className="text-xs text-emerald-600 dark:text-slate-500">{row.membershipId} · {row.city}</div>
                        </TableCell>
                        <TableCell className="text-sm text-emerald-700 dark:text-slate-400">{row.designation || "—"}</TableCell>
                        <TableCell className="text-right text-emerald-900 dark:text-slate-300 font-medium">{formatSAR(row.monthlyDue)}</TableCell>
                        <TableCell className={cn("text-right font-medium", row.amountPaid > 0 ? "text-emerald-700 dark:text-green-400" : "text-slate-400 dark:text-slate-600")}>
                          {row.amountPaid > 0 ? formatSAR(row.amountPaid) : "—"}
                        </TableCell>
                        <TableCell className={cn("text-right font-bold", row.amountOwed > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
                          {row.amountOwed > 0 ? formatSAR(row.amountOwed) : "✓"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            className={cn(
                              "text-xs font-semibold uppercase",
                              row.status === "paid"
                                ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100"
                                : row.status === "partial"
                                ? "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100"
                                : "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300 hover:bg-red-100",
                            )}
                          >
                            {row.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-emerald-700 dark:text-slate-400 capitalize">
                          {row.paymentMethod === "—" ? "—" : row.paymentMethod.replace("_", " ")}
                        </TableCell>
                      </TableRow>
                    ))}

                    {/* Totals row */}
                    <TableRow className="bg-emerald-50/60 dark:bg-slate-800/40 border-t-2 border-emerald-200 dark:border-slate-600">
                      <TableCell />
                      <TableCell className="font-bold text-emerald-950 dark:text-slate-100" colSpan={2}>
                        Totals — {monthlySummaryRows.length} members
                      </TableCell>
                      <TableCell className="text-right font-bold text-emerald-900 dark:text-slate-200">{formatSAR(summaryTotals.totalDue)}</TableCell>
                      <TableCell className="text-right font-bold text-emerald-700 dark:text-green-400">{formatSAR(summaryTotals.totalPaid)}</TableCell>
                      <TableCell className="text-right font-bold text-red-600 dark:text-red-400">{formatSAR(summaryTotals.totalOwed)}</TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Existing: Print Receipts ── */}
      <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <CardTitle className="text-lg text-emerald-900 dark:text-emerald-200">Print Receipts</CardTitle>
            <CardDescription className="dark:text-slate-400">Search and print individual payment receipts</CardDescription>
          </div>
          <div className="flex items-center space-x-2 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-slate-700 shadow-sm w-full sm:w-72">
            <Search className="h-4 w-4 text-emerald-400 dark:text-slate-500 shrink-0" />
            <Input
              placeholder="Search receipt, name, ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-0 focus-visible:ring-0 shadow-none px-2 h-8 text-sm dark:bg-transparent dark:text-slate-200 dark:placeholder:text-slate-500"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-emerald-100 dark:border-slate-800 overflow-hidden">
            <Table>
              <TableHeader className="bg-emerald-50/50 dark:bg-slate-800/60">
                <TableRow className="dark:border-slate-700">
                  <TableHead className="font-medium text-emerald-900 dark:text-slate-300">Receipt</TableHead>
                  <TableHead className="font-medium text-emerald-900 dark:text-slate-300">Member</TableHead>
                  <TableHead className="font-medium text-emerald-900 dark:text-slate-300">Date</TableHead>
                  <TableHead className="font-medium text-emerald-900 dark:text-slate-300 text-right">Amount</TableHead>
                  <TableHead className="font-medium text-emerald-900 dark:text-slate-300 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPaymentsLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i} className="dark:border-slate-800">
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : (
                  filteredPayments?.slice(0, 10).map((payment) => (
                    <TableRow key={payment.id} className="hover:bg-emerald-50/30 dark:hover:bg-slate-800/50 dark:border-slate-800 transition-colors">
                      <TableCell className="font-medium text-emerald-800 dark:text-slate-300">{payment.receiptNumber}</TableCell>
                      <TableCell>
                        <div className="font-medium text-emerald-950 dark:text-slate-200">{payment.memberName}</div>
                        <div className="text-xs text-emerald-600 dark:text-slate-500">{payment.membershipId}</div>
                      </TableCell>
                      <TableCell className="text-emerald-700 dark:text-slate-400">{formatDate(payment.paidAt)}</TableCell>
                      <TableCell className="text-right font-bold text-emerald-900 dark:text-green-300">{formatSAR(payment.amountPaid)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-emerald-200 dark:border-slate-700 text-emerald-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-slate-800"
                          onClick={() => printReceipt(payment)}
                        >
                          <Printer className="mr-2 h-3 w-3" /> Print
                        </Button>
                        {/* Hidden receipt for printing */}
                        <div id={`receipt-${payment.id}`} className="hidden print:block p-8 bg-white text-black font-sans max-w-2xl mx-auto border-2 border-gray-800 h-full">
                          <div className="flex justify-between items-center border-b-2 border-gray-800 pb-6 mb-6">
                            <div className="flex items-center gap-4">
                              <img src={`${basePath}/logo.png`} alt="DKMO Logo" className="h-20 w-auto" />
                              <div>
                                <h1 className="text-2xl font-bold uppercase tracking-wide">Dakshina Karnataka Muslim Ookota</h1>
                                <p className="text-sm font-medium mt-1">ದಕ್ಷಿಣ ಕರ್ನಾಟಕ ಮುಸ್ಲಿಂ ಒಕ್ಕೂಟ</p>
                                <p className="text-xs mt-1 text-gray-600">Reg. No: DKMO/2023/1234 • Mangaluru</p>
                              </div>
                            </div>
                          </div>
                          <div className="text-center mb-8">
                            <h2 className="text-xl font-bold uppercase underline">Official Receipt</h2>
                          </div>
                          <div className="flex justify-between mb-8 text-sm">
                            <div>
                              <p><span className="font-semibold">Receipt No:</span> {payment.receiptNumber}</p>
                              <p className="mt-1"><span className="font-semibold">Date:</span> {formatDate(payment.paidAt)}</p>
                            </div>
                            <div className="text-right">
                              <p><span className="font-semibold">Membership ID:</span> {payment.membershipId}</p>
                            </div>
                          </div>
                          <div className="bg-gray-50 border border-gray-200 p-6 rounded-lg mb-8">
                            <p className="text-lg leading-relaxed">
                              Received with thanks from <span className="font-bold border-b border-gray-400 pb-1 px-2">{payment.memberName}</span>,
                              a sum of <span className="font-bold border-b border-gray-400 pb-1 px-2">{formatSAR(payment.amountPaid)}</span>
                              towards monthly contribution for the month of <span className="font-bold border-b border-gray-400 pb-1 px-2">{payment.month}</span>.
                            </p>
                            <p className="mt-4 text-sm">
                              <span className="font-semibold">Payment Mode:</span> <span className="capitalize">{payment.paymentMethod.replace("_", " ")}</span>
                            </p>
                            {payment.notes && (
                              <p className="mt-2 text-sm text-gray-600 italic">"{payment.notes}"</p>
                            )}
                          </div>
                          <div className="flex justify-between items-end mt-16 pt-8 border-t border-gray-200">
                            <div>
                              <p className="text-xs text-gray-500">This is a computer generated receipt.</p>
                            </div>
                            <div className="text-center">
                              <div className="w-40 border-b border-gray-800 mb-2"></div>
                              <p className="font-semibold text-sm">Authorized Signatory</p>
                              <p className="text-xs text-gray-500">DKMO Trust</p>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {filteredPayments?.length === 0 && (
              <div className="p-8 text-center text-emerald-600 dark:text-slate-500">No receipts found.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
