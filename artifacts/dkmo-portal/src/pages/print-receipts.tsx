import { useMemo, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { useListPayments } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Printer, Search, CalendarRange, X, FileText, Download } from "lucide-react";
import { formatSAR, formatDate, formatYearMonth } from "@/lib/utils";
import jsPDF from "jspdf";
import { Skeleton } from "@/components/ui/skeleton";

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

export default function PrintReceipts() {
  const [search, setSearch] = useState("");
  const searchString = useSearch();
  const [, setLocation] = useLocation();

  const monthFilter = useMemo(() => {
    const params = new URLSearchParams(searchString);
    const m = params.get("month");
    if (m && /^\d{4}-\d{2}$/.test(m)) return m;
    return null;
  }, [searchString]);

  const { data: payments, isLoading: isPaymentsLoading } = useListPayments();

  const monthScopedPayments = useMemo(() => {
    if (!payments) return [];
    if (!monthFilter) return payments;
    return payments.filter((p) => p.month === monthFilter);
  }, [payments, monthFilter]);

  const monthTotal = useMemo(
    () => monthScopedPayments.reduce((acc, p) => acc + Number(p.amountPaid), 0),
    [monthScopedPayments],
  );

  const filteredPayments = monthScopedPayments.filter(
    (p) =>
      p.memberName.toLowerCase().includes(search.toLowerCase()) ||
      p.receiptNumber.toLowerCase().includes(search.toLowerCase()) ||
      p.membershipId.toLowerCase().includes(search.toLowerCase()),
  );

  const clearMonthFilter = () => setLocation("/print-receipts");

  // ── PDF download: matches physical DKMO receipt card ─────────────────────
  const downloadReceiptPDF = async (payment: (typeof filteredPayments)[number]) => {
    const logoDataUrl = await loadImageAsBase64(`${basePath}/logo.png`);

    // A5 landscape: 210 × 148 mm
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a5" });
    const W = doc.internal.pageSize.getWidth();   // 210
    const H = doc.internal.pageSize.getHeight();  // 148

    const maroon: [number, number, number]    = [102, 0, 0];
    const darkGray: [number, number, number]  = [50, 50, 50];
    const lightGray: [number, number, number] = [235, 235, 235];

    // ── White background ──────────────────────────────────────────────────
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, W, H, "F");

    // ── Outer border ─────────────────────────────────────────────────────
    doc.setDrawColor(...maroon);
    doc.setLineWidth(1.2);
    doc.rect(3, 3, W - 6, H - 6, "D");

    // ── Logo ─────────────────────────────────────────────────────────────
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", 6, 6, 22, 22);
    } else {
      doc.setFillColor(...maroon);
      doc.circle(17, 17, 10, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.setTextColor(255, 255, 255);
      doc.text("DKMO", 17, 18, { align: "center" });
    }

    // ── Organisation name ─────────────────────────────────────────────────
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(...maroon);
    doc.text("Dakshina Karnataka Muslim Okkoota - DKMO RIYADH", 32, 14);

    // Reg line
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...darkGray);
    doc.text("Reg. No: DKMO/2023/1234  ·  Committed to the Community", 32, 22);

    // ── Header divider ────────────────────────────────────────────────────
    doc.setDrawColor(...maroon);
    doc.setLineWidth(0.6);
    doc.line(5, 30, W - 5, 30);

    // ── Helper: dotted underline field ────────────────────────────────────
    const dottedLine = (x1: number, y: number, x2: number) => {
      doc.setLineDashPattern([0.4, 0.7], 0);
      doc.setLineWidth(0.25);
      doc.setDrawColor(100, 100, 100);
      doc.line(x1, y, x2, y);
      doc.setLineDashPattern([], 0);
    };

    const label = (text: string, x: number, y: number) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(0, 0, 0);
      doc.text(text, x, y);
    };

    const value = (text: string, x: number, y: number) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...darkGray);
      doc.text(text, x, y);
    };

    // ── Row 1: Date | Receipt# | Jamath Name ─────────────────────────────
    let y = 40;
    label("Date:",          6,  y);
    value(formatDate(payment.paidAt), 19, y);
    dottedLine(19, y + 1, 62);

    label("Receipt # :",    68, y);
    value(payment.receiptNumber, 92, y);
    dottedLine(92, y + 1, 136);

    label("Jamath Name:",   142, y);
    dottedLine(168, y + 1, W - 6);

    // ── Row 2: Name | DKMO ID ─────────────────────────────────────────────
    y = 52;
    label("Name :",         6,  y);
    value(payment.memberName, 22, y);
    dottedLine(22, y + 1, 118);

    label("DKMO ID # :",    124, y);
    value(payment.membershipId, 150, y);
    dottedLine(150, y + 1, W - 6);

    // ── Row 3: Mobile | WhatsApp ──────────────────────────────────────────
    y = 64;
    label("Mobile #:",      6,  y);
    dottedLine(24, y + 1, 98);

    label("Whatsapp # :",   104, y);
    dottedLine(130, y + 1, W - 6);

    // ── Row 4: Received Towards ───────────────────────────────────────────
    y = 76;
    label("Received",  6, y - 1);
    label("Towards:",  6, y + 5);

    // Determine which oval to fill
    const pm = payment.paymentMethod ?? "";
    const isLoan = pm === "bank_transfer" && (payment.notes ?? "").toLowerCase().includes("loan");
    const towardsChecked = [
      false,                 // Life Membership
      false,                 // FRF Case#
      !isLoan,               // Voluntary Yearly Contribution (default)
      false,                 // Donation
      isLoan,                // Loan Recovery
      false,                 // Others
    ];
    const towardsLabels = [
      ["Life", "Membership"],
      ["FRF Case#", ""],
      ["Voluntary Yearly", "Contribution"],
      ["Donation", ""],
      ["Loan", "Recovery"],
      ["Others", ""],
    ];

    const ovalW = 14;
    const ovalH = 7;
    const ovalStartX = 26;
    const ovalSpacing = 24;

    for (let i = 0; i < 6; i++) {
      const ox = ovalStartX + i * ovalSpacing;
      const oy = y - 3;
      const cx = ox + ovalW / 2;
      doc.setFillColor(255, 255, 255);
      if (towardsChecked[i]) {
        // Green outline oval
        doc.setDrawColor(0, 120, 0);
        doc.setLineWidth(0.8);
        doc.ellipse(cx, oy, ovalW / 2, ovalH / 2, "FD");
        // Draw tick mark as two lines inside the oval
        doc.setDrawColor(0, 130, 0);
        doc.setLineWidth(0.9);
        doc.line(cx - 2.5, oy + 0.6, cx - 0.3, oy + 2.2);
        doc.line(cx - 0.3, oy + 2.2, cx + 3.2, oy - 1.6);
      } else {
        doc.setDrawColor(80, 80, 80);
        doc.setLineWidth(0.5);
        doc.ellipse(cx, oy, ovalW / 2, ovalH / 2, "D");
      }
      // Label below oval
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...darkGray);
      doc.setFontSize(6.5);
      towardsLabels[i].forEach((line, li) => {
        if (line) doc.text(line, cx, oy + 6 + li * 4.5, { align: "center" });
      });
    }

    // SR/= box (amount)
    const boxX = W - 44;
    const boxY = y - 9;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.6);
    doc.rect(boxX, boxY, 38, 18, "D");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text("SR/=", boxX + 3, boxY + 7);
    doc.setFontSize(11);
    doc.setTextColor(...maroon);
    const amtStr = Number(payment.amountPaid).toLocaleString("en-IN");
    doc.text(amtStr, boxX + 19, boxY + 14, { align: "center" });

    // ── Footer divider ────────────────────────────────────────────────────
    const footerTop = y + 22;
    doc.setDrawColor(...maroon);
    doc.setLineWidth(0.6);
    doc.line(5, footerTop, W - 5, footerTop);

    // ── Footer section background ─────────────────────────────────────────
    doc.setFillColor(...lightGray);
    doc.rect(5, footerTop + 0.3, W - 10, H - footerTop - 5.3, "F");

    // "COMMITTED TO THE COMMUNITY"
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...maroon);
    doc.text("COMMITTED TO THE COMMUNITY", W / 2, footerTop + 8, { align: "center" });

    // Two columns of community services
    const col1 = [
      "Frf Scheme (Family Relief Fund)",
      "Medical Aid",
      "Free Air Ticket To Stranded Nri's",
      "General Relief Fund",
    ];
    const col2 = [
      "Representative In India For Health & Govt Scheme Utilization",
      "Emergency Response Scheme.",
      "Dkmo Job Bureau",
      "Loan Scheme For Members",
    ];

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(30, 30, 30);

    const colStartY = footerTop + 14;
    col1.forEach((item, i) => {
      doc.text(`* ${item}`, 8, colStartY + i * 5.5);
    });
    const midX = W / 2 + 3;
    col2.forEach((item, i) => {
      const lines = doc.splitTextToSize(`* ${item}`, W / 2 - 14);
      doc.text(lines, midX, colStartY + i * 5.5);
    });

    // Signature line
    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.3);
    doc.line(W - 55, H - 9, W - 7, H - 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(30, 30, 30);
    doc.text("Treasurer/ Gen. Secretary", W - 31, H - 5, { align: "center" });

    doc.save(`DKMO_Receipt_${payment.receiptNumber}.pdf`);
  };

  // ── Print: opens jsPDF in new tab with autoPrint ──────────────────────────
  const printReceipt = async (payment: (typeof filteredPayments)[number]) => {
    const logoDataUrl = await loadImageAsBase64(`${basePath}/logo.png`);
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a5" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const maroon: [number, number, number]    = [102, 0, 0];
    const darkGray: [number, number, number]  = [50, 50, 50];
    const lightGray: [number, number, number] = [235, 235, 235];

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, W, H, "F");
    doc.setDrawColor(...maroon);
    doc.setLineWidth(1.2);
    doc.rect(3, 3, W - 6, H - 6, "D");

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", 6, 6, 22, 22);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(...maroon);
    doc.text("Dakshina Karnataka Muslim Okkoota - DKMO RIYADH", 32, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...darkGray);
    doc.text("Reg. No: DKMO/2023/1234  ·  Committed to the Community", 32, 22);

    doc.setDrawColor(...maroon);
    doc.setLineWidth(0.6);
    doc.line(5, 30, W - 5, 30);

    const dottedLine = (x1: number, y: number, x2: number) => {
      doc.setLineDashPattern([0.4, 0.7], 0);
      doc.setLineWidth(0.25);
      doc.setDrawColor(100, 100, 100);
      doc.line(x1, y, x2, y);
      doc.setLineDashPattern([], 0);
    };

    let y = 40;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0,0,0);
    doc.text("Date:", 6, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...darkGray);
    doc.text(formatDate(payment.paidAt), 19, y);
    dottedLine(19, y + 1, 62);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0,0,0);
    doc.text("Receipt # :", 68, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...darkGray);
    doc.text(payment.receiptNumber, 92, y);
    dottedLine(92, y + 1, 136);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0,0,0);
    doc.text("Jamath Name:", 142, y);
    dottedLine(168, y + 1, W - 6);

    y = 52;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0,0,0);
    doc.text("Name :", 6, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...darkGray);
    doc.text(payment.memberName, 22, y);
    dottedLine(22, y + 1, 118);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0,0,0);
    doc.text("DKMO ID # :", 124, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...darkGray);
    doc.text(payment.membershipId, 150, y);
    dottedLine(150, y + 1, W - 6);

    y = 64;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0,0,0);
    doc.text("Mobile #:", 6, y); dottedLine(24, y + 1, 98);
    doc.text("Whatsapp # :", 104, y); dottedLine(130, y + 1, W - 6);

    y = 76;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0,0,0);
    doc.text("Received", 6, y - 1);
    doc.text("Towards:", 6, y + 5);

    const towardsLabels = [["Life","Membership"],["FRF Case#",""],["Voluntary Yearly","Contribution"],["Donation",""],["Loan","Recovery"],["Others",""]];
    const isLoan = (payment.notes ?? "").toLowerCase().includes("loan");
    const towardsChecked = [false, false, !isLoan, false, isLoan, false];
    const ovalW = 14, ovalH = 7, ovalStartX = 26, ovalSpacing = 24;
    for (let i = 0; i < 6; i++) {
      const ox = ovalStartX + i * ovalSpacing;
      const oy = y - 3;
      const cx = ox + ovalW / 2;
      doc.setFillColor(255, 255, 255);
      if (towardsChecked[i]) {
        doc.setDrawColor(0, 120, 0);
        doc.setLineWidth(0.8);
        doc.ellipse(cx, oy, ovalW / 2, ovalH / 2, "FD");
        // Draw tick mark as two lines inside the oval
        doc.setDrawColor(0, 130, 0);
        doc.setLineWidth(0.9);
        doc.line(cx - 2.5, oy + 0.6, cx - 0.3, oy + 2.2);
        doc.line(cx - 0.3, oy + 2.2, cx + 3.2, oy - 1.6);
      } else {
        doc.setDrawColor(80, 80, 80);
        doc.setLineWidth(0.5);
        doc.ellipse(cx, oy, ovalW / 2, ovalH / 2, "D");
      }
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...darkGray);
      doc.setFontSize(6.5);
      towardsLabels[i].forEach((line, li) => {
        if (line) doc.text(line, cx, oy + 6 + li * 4.5, { align: "center" });
      });
    }
    const boxX = W - 44, boxY = y - 9;
    doc.setDrawColor(0,0,0); doc.setLineWidth(0.6); doc.rect(boxX, boxY, 38, 18, "D");
    doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(0,0,0);
    doc.text("SR/=", boxX + 3, boxY + 7);
    doc.setFontSize(11); doc.setTextColor(...maroon);
    doc.text(Number(payment.amountPaid).toLocaleString("en-IN"), boxX + 19, boxY + 14, { align: "center" });

    const footerTop = y + 22;
    doc.setDrawColor(...maroon); doc.setLineWidth(0.6); doc.line(5, footerTop, W - 5, footerTop);
    doc.setFillColor(...lightGray); doc.rect(5, footerTop + 0.3, W - 10, H - footerTop - 5.3, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(...maroon);
    doc.text("COMMITTED TO THE COMMUNITY", W / 2, footerTop + 8, { align: "center" });

    const col1 = ["Frf Scheme (Family Relief Fund)","Medical Aid","Free Air Ticket To Stranded Nri's","General Relief Fund"];
    const col2 = ["Representative In India For Health & Govt Scheme Utilization","Emergency Response Scheme.","Dkmo Job Bureau","Loan Scheme For Members"];
    doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(30,30,30);
    const colStartY = footerTop + 14;
    col1.forEach((item, i) => { doc.text(`* ${item}`, 8, colStartY + i * 5.5); });
    col2.forEach((item, i) => {
      const lines = doc.splitTextToSize(`* ${item}`, W / 2 - 14);
      doc.text(lines, W / 2 + 3, colStartY + i * 5.5);
    });
    doc.setDrawColor(80,80,80); doc.setLineWidth(0.3); doc.line(W - 55, H - 9, W - 7, H - 9);
    doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(30,30,30);
    doc.text("Treasurer/ Gen. Secretary", W - 31, H - 5, { align: "center" });

    doc.autoPrint();
    window.open(doc.output("bloburl"), "_blank");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-950 dark:text-emerald-100">Print Receipts</h1>
          <p className="text-emerald-700/80 dark:text-slate-400">Search, preview, print, and download individual payment receipts</p>
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
                  Showing receipts for {formatYearMonth(monthFilter)}
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

      <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
              <Printer className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Receipt History
            </CardTitle>
            <CardDescription className="dark:text-slate-400">
              Search and print or download individual payment receipts
            </CardDescription>
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
                  <TableHead className="font-medium text-emerald-900 dark:text-slate-300">Month</TableHead>
                  <TableHead className="font-medium text-emerald-900 dark:text-slate-300">Date</TableHead>
                  <TableHead className="font-medium text-emerald-900 dark:text-slate-300 text-right">Amount</TableHead>
                  <TableHead className="font-medium text-emerald-900 dark:text-slate-300 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPaymentsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="dark:border-slate-800">
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-36" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-40 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredPayments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-emerald-600 dark:text-slate-500">
                      No receipts found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPayments.map((payment) => (
                    <TableRow
                      key={payment.id}
                      className="hover:bg-emerald-50/30 dark:hover:bg-slate-800/50 dark:border-slate-800 transition-colors"
                    >
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="font-mono text-xs border-emerald-200 dark:border-slate-700 text-emerald-800 dark:text-slate-300"
                        >
                          {payment.receiptNumber}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-emerald-950 dark:text-slate-200">{payment.memberName}</div>
                        <div className="text-xs text-emerald-600 dark:text-slate-500">{payment.membershipId}</div>
                      </TableCell>
                      <TableCell className="text-sm text-emerald-700 dark:text-slate-400">
                        {formatYearMonth(payment.month)}
                      </TableCell>
                      <TableCell className="text-sm text-emerald-700 dark:text-slate-400">
                        {formatDate(payment.paidAt)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-emerald-900 dark:text-green-300">
                        {formatSAR(payment.amountPaid)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-emerald-200 dark:border-slate-700 text-emerald-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-slate-800"
                            onClick={() => printReceipt(payment)}
                          >
                            <Printer className="mr-1.5 h-3 w-3" /> Print
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-emerald-200 dark:border-slate-700 text-emerald-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-slate-800"
                            onClick={() => downloadReceiptPDF(payment)}
                          >
                            <Download className="mr-1.5 h-3 w-3" /> PDF
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {!isPaymentsLoading && filteredPayments.length > 0 && (
            <p className="mt-3 text-xs text-emerald-600/70 dark:text-slate-500 text-right">
              Showing {filteredPayments.length} receipt{filteredPayments.length !== 1 ? "s" : ""}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900/60 shadow-sm">
        <CardContent className="py-5">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/50 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200 mb-1">About Print Receipts</p>
              <p className="text-xs text-emerald-700/70 dark:text-slate-400 leading-relaxed">
                Use <strong>Print</strong> to open a print dialog with the DKMO receipt card format (A5 landscape).
                Use <strong>PDF</strong> to download a branded DKMO receipt card as a PDF file matching the official receipt design.
                To generate new receipts from scratch, use the <strong>Receipts</strong> page in the sidebar.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
