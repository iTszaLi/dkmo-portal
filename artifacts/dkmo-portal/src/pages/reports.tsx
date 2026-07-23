import { useMemo, useState } from "react";
import { useListMembers, useListPayments } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FileText, FileSpreadsheet, Users, CreditCard, BarChart3, Search } from "lucide-react";
import { formatSAR, formatDate, feeStatusLabel } from "@/lib/utils";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
type FeeStatus = "paid" | "partial" | "pending" | "unpaid" | "exempt";

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

export default function Reports() {
  const [reportSearch, setReportSearch] = useState("");

  const { data: members, isLoading: isMembersLoading } = useListMembers();
  const { data: payments } = useListPayments();

  // ── membership fee summary ────────────────────────────────────────────────
  const feeSummaryRows = useMemo((): FeeSummaryRow[] => {
    if (!members) return [];
    return members.map((m) => ({
      membershipId: m.membershipId,
      fullName: m.fullName,
      designation: m.designation ?? "",
      city: m.city,
      refMemberName: m.refMemberName ?? "",
      membershipFee: Number(m.membershipFee),
      feeStatus: m.feeStatus as FeeStatus,
      feePaidAt: m.feePaidAt ?? null,
    }));
  }, [members]);

  const filteredSummaryRows = useMemo(() => {
    if (!reportSearch.trim()) return feeSummaryRows;
    const q = reportSearch.toLowerCase();
    return feeSummaryRows.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        r.membershipId.toLowerCase().includes(q) ||
        r.designation.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q) ||
        r.refMemberName.toLowerCase().includes(q),
    );
  }, [feeSummaryRows, reportSearch]);

  const summaryTotals = useMemo(() => ({
    totalFee: feeSummaryRows.reduce((a, r) => a + r.membershipFee, 0),
    collected: feeSummaryRows.filter((r) => r.feeStatus === "paid").reduce((a, r) => a + r.membershipFee, 0),
    outstanding: feeSummaryRows.filter((r) => r.feeStatus !== "paid" && r.feeStatus !== "exempt").reduce((a, r) => a + r.membershipFee, 0),
    paidCount: feeSummaryRows.filter((r) => r.feeStatus === "paid").length,
    pendingCount: feeSummaryRows.filter((r) => r.feeStatus === "pending" || r.feeStatus === "partial").length,
    unpaidCount: feeSummaryRows.filter((r) => r.feeStatus === "unpaid").length,
  }), [feeSummaryRows]);

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
        { header: "Reference Member", key: "refMember", width: 22 },
        { header: "Membership Fee", key: "membershipFee", width: 16 },
        { header: "Fee Status", key: "feeStatus", width: 14 },
        { header: "Fee Paid On", key: "feePaidAt", width: 16 },
        { header: "Joined Date", key: "joinedDate", width: 16 },
      ],
      members.map((m) => ({
        memberId: m.membershipId,
        fullName: m.fullName,
        designation: m.designation ?? "",
        mobile: m.mobileNumber,
        city: m.city,
        country: m.country,
        refMember: m.refMemberName ?? "",
        membershipFee: Number(m.membershipFee),
        feeStatus: feeStatusLabel(m.feeStatus),
        feePaidAt: m.feePaidAt ? formatDate(m.feePaidAt) : "—",
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
        { header: "Type", key: "type", width: 16 },
        { header: "Method", key: "method", width: 14 },
        { header: "Amount", key: "amount", width: 12 },
        { header: "Notes", key: "notes", width: 24 },
      ],
      payments.map((p) => ({
        receiptNo: p.receiptNumber,
        date: formatDate(p.paidAt),
        memberId: p.membershipId,
        memberName: p.memberName,
        type: p.paymentType === "frf_contribution" ? "FRF Contribution" : "Membership Fee",
        method: p.paymentMethod,
        amount: p.amountPaid,
        notes: p.notes ?? "",
      })),
    );
  };

  const exportMembersPDF = async () => {
    if (!members) return;
    const doc = new jsPDF();
    const logoDataUrl = await loadImageAsBase64(`${basePath}/logo-circle.png`);
    const green: [number, number, number] = [5, 150, 105];

    // Header band
    doc.setFillColor(...green);
    doc.rect(0, 0, 210, 32, "F");

    // Logo
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", 5, 4, 22, 22);
    }

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text("DKMO Members Report", 32, 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Dakshina Karnataka Muslim Ookota — Committed to the Community", 32, 23);

    // Generated line below header
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(9);
    doc.text(`Generated on: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}`, 14, 39);

    autoTable(doc, {
      startY: 44,
      head: [["ID", "Name", "Designation", "City", "Reference", "Fee", "Status"]],
      body: members.map((m) => [
        m.membershipId,
        m.fullName,
        m.designation ?? "",
        m.city,
        m.refMemberName ?? "—",
        `SAR ${Number(m.membershipFee)}`,
        feeStatusLabel(m.feeStatus),
      ]),
      theme: "grid",
      headStyles: { fillColor: green },
    });
    doc.save(`DKMO_Members_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const exportPaymentsPDF = async () => {
    if (!payments) return;
    const doc = new jsPDF();
    const logoDataUrl = await loadImageAsBase64(`${basePath}/logo-circle.png`);
    const green: [number, number, number] = [5, 150, 105];

    // Header band
    doc.setFillColor(...green);
    doc.rect(0, 0, 210, 32, "F");

    // Logo
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", 5, 4, 22, 22);
    }

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text("DKMO Payments Report", 32, 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Dakshina Karnataka Muslim Ookota — Committed to the Community", 32, 23);

    // Generated line below header
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(9);
    doc.text(`Generated on: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}`, 14, 39);

    autoTable(doc, {
      startY: 44,
      head: [["Receipt", "Date", "Member", "Type", "Amount"]],
      body: payments.map((p) => [p.receiptNumber, formatDate(p.paidAt), p.memberName, p.paymentType === "frf_contribution" ? "FRF Contribution" : "Membership Fee", `SAR ${p.amountPaid}`]),
      theme: "grid",
      headStyles: { fillColor: green },
    });
    doc.save(`DKMO_Payments_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  // ── exports: membership fee summary ───────────────────────────────────────
  const exportFeeSummaryExcel = async () => {
    if (feeSummaryRows.length === 0) return;
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
    feeSummaryRows.forEach((r, i) => {
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
    if (feeSummaryRows.length === 0) return;
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
      `Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}   |   Total Members: ${feeSummaryRows.length}   |   Collected: SAR ${summaryTotals.collected.toLocaleString("en-IN", { minimumFractionDigits: 2 })}   |   Outstanding: SAR ${summaryTotals.outstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
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
        ...feeSummaryRows.map((r, i) => [
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
        const isLastRow = data.row.index === feeSummaryRows.length;
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

  const isLoading = isMembersLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-950 dark:text-emerald-100">Reports & Exports</h1>
          <p className="text-emerald-700/80 dark:text-slate-400">Generate reports and export data</p>
        </div>
      </div>

      {/* ── members / payments exports ── */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
              <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Members Data
            </CardTitle>
            <CardDescription className="dark:text-slate-400">Export complete member directory with fee status</CardDescription>
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

      {/* ── Membership Fee Summary ── */}
      <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
                <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                Membership Fee Summary
              </CardTitle>
              <CardDescription className="dark:text-slate-400">
                One-time registration fee status for every member — paid, pending, and unpaid
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Inline search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-400 dark:text-slate-500" />
                <Input
                  placeholder="Search member…"
                  value={reportSearch}
                  onChange={(e) => setReportSearch(e.target.value)}
                  className="pl-9 h-9 w-48 border-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500"
                />
              </div>

              <Button
                onClick={exportFeeSummaryExcel}
                disabled={isLoading || feeSummaryRows.length === 0}
                className="bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white"
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
              </Button>
              <Button
                onClick={exportFeeSummaryPDF}
                disabled={isLoading || feeSummaryRows.length === 0}
                variant="outline"
                className="border-emerald-200 dark:border-slate-700 text-emerald-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-slate-800"
              >
                <FileText className="mr-2 h-4 w-4" /> PDF
              </Button>
            </div>
          </div>

          {/* Summary stat chips */}
          {!isLoading && feeSummaryRows.length > 0 && (
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
                ) : feeSummaryRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-emerald-600 dark:text-slate-500">
                      No members yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {filteredSummaryRows.map((row, i) => (
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
                        Totals — {feeSummaryRows.length} members
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
