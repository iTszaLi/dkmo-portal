import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useSearch, useLocation } from "wouter";
import { useListPayments, useListReceiptRecords, customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Printer, Search, CalendarRange, X, FileText, Download,
  QrCode, CheckCircle, AlertTriangle, ShieldCheck, ScanLine,
} from "lucide-react";
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
  } catch { return ""; }
}

async function buildReceiptPdf(
  doc: jsPDF,
  { receiptNumber, memberName, membershipId, paidAt, amountPaid, notes }: {
    receiptNumber: string; memberName: string; membershipId: string;
    paidAt: string; amountPaid: number | string; notes?: string | null;
  },
  logoDataUrl: string,
) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const maroon: [number, number, number] = [102, 0, 0];
  const darkGray: [number, number, number] = [50, 50, 50];
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
  doc.setTextColor(...maroon);
  // Auto-fit the title so it never runs into the reserved QR zone (top-right
  // 22mm square at x = W-28; see the QR block at the end of this function).
  const title = "Dakshina Karnataka Muslim Okkoota - DKMO RIYADH";
  const titleMaxW = W - 32 - 30;
  let titleSize = 17;
  doc.setFontSize(titleSize);
  while (titleSize > 10 && doc.getTextWidth(title) > titleMaxW) {
    titleSize -= 0.5;
    doc.setFontSize(titleSize);
  }
  doc.text(title, 32, 14);
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
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text("Date:", 6, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...darkGray);
  doc.text(formatDate(paidAt), 19, y);
  dottedLine(19, y + 1, 62);

  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text("Receipt # :", 68, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...darkGray);
  doc.text(receiptNumber, 92, y);
  dottedLine(92, y + 1, 136);

  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text("Jamath Name:", 142, y);
  dottedLine(168, y + 1, W - 6);

  y = 52;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text("Name :", 6, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...darkGray);
  doc.text(memberName, 22, y);
  dottedLine(22, y + 1, 118);

  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text("DKMO ID # :", 124, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...darkGray);
  doc.text(membershipId, 150, y);
  dottedLine(150, y + 1, W - 6);

  y = 64;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text("Mobile #:", 6, y); dottedLine(24, y + 1, 98);
  doc.text("Whatsapp # :", 104, y); dottedLine(130, y + 1, W - 6);

  y = 76;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text("Received", 6, y - 1);
  doc.text("Towards:", 6, y + 5);

  const towardsLabels = [["Life","Membership"],["FRF Case#",""],["Voluntary Yearly","Contribution"],["Donation",""],["Loan","Recovery"],["Others",""]];
  const isLoan = (notes ?? "").toLowerCase().includes("loan");
  const towardsChecked = [false, false, !isLoan, false, isLoan, false];
  const ovalW = 14, ovalH = 7, ovalStartX = 26, ovalSpacing = 24;
  for (let i = 0; i < 6; i++) {
    const ox = ovalStartX + i * ovalSpacing;
    const oy = y - 3;
    const cx = ox + ovalW / 2;
    doc.setFillColor(255, 255, 255);
    if (towardsChecked[i]) {
      doc.setDrawColor(0, 120, 0); doc.setLineWidth(0.8);
      doc.ellipse(cx, oy, ovalW / 2, ovalH / 2, "FD");
      doc.setDrawColor(0, 130, 0); doc.setLineWidth(0.9);
      doc.line(cx - 2.5, oy + 0.6, cx - 0.3, oy + 2.2);
      doc.line(cx - 0.3, oy + 2.2, cx + 3.2, oy - 1.6);
    } else {
      doc.setDrawColor(80, 80, 80); doc.setLineWidth(0.5);
      doc.ellipse(cx, oy, ovalW / 2, ovalH / 2, "D");
    }
    doc.setFont("helvetica", "normal"); doc.setTextColor(...darkGray); doc.setFontSize(6.5);
    towardsLabels[i].forEach((line, li) => {
      if (line) doc.text(line, cx, oy + 6 + li * 4.5, { align: "center" });
    });
  }

  const boxX = W - 44, boxY = y - 9;
  doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.6); doc.rect(boxX, boxY, 38, 18, "D");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(0, 0, 0);
  doc.text("SR/=", boxX + 3, boxY + 7);
  doc.setFontSize(11); doc.setTextColor(...maroon);
  doc.text(Number(amountPaid).toLocaleString("en-IN"), boxX + 19, boxY + 14, { align: "center" });

  const footerTop = y + 22;
  doc.setDrawColor(...maroon); doc.setLineWidth(0.6); doc.line(5, footerTop, W - 5, footerTop);
  doc.setFillColor(...lightGray); doc.rect(5, footerTop + 0.3, W - 10, H - footerTop - 5.3, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...maroon);
  doc.text("COMMITTED TO THE COMMUNITY", W / 2, footerTop + 8, { align: "center" });

  const col1 = ["Frf Scheme (Family Relief Fund)", "Medical Aid", "Free Air Ticket To Stranded Nri's", "General Relief Fund"];
  const col2 = ["Representative In India For Health & Govt Scheme Utilization", "Emergency Response Scheme.", "Dkmo Job Bureau", "Loan Scheme For Members"];
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(30, 30, 30);
  const colStartY = footerTop + 14;
  col1.forEach((item, i) => { doc.text(`* ${item}`, 8, colStartY + i * 5.5); });
  col2.forEach((item, i) => {
    const lines = doc.splitTextToSize(`* ${item}`, W / 2 - 14);
    doc.text(lines, W / 2 + 3, colStartY + i * 5.5);
  });

  doc.setDrawColor(80, 80, 80); doc.setLineWidth(0.3); doc.line(W - 55, H - 9, W - 7, H - 9);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(30, 30, 30);
  doc.text("Treasurer/ Gen. Secretary", W - 31, H - 5, { align: "center" });

  doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(120, 120, 120);
  doc.text(`Verify: ${receiptNumber}`, W / 2, H - 4, { align: "center" });

  // QR verification (opens the portal's receipt-verify page; requires login —
  // this is an internal portal, so verification is not publicly accessible).
  if (receiptNumber) {
    try {
      const verifyUrl = `${window.location.origin}${basePath}/print-receipts?verify=${encodeURIComponent(receiptNumber)}`;
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 80, margin: 1 });
      doc.setFillColor(255, 255, 255);
      doc.rect(W - 28, 5, 22, 22, "F");
      doc.addImage(qrDataUrl, "PNG", W - 27, 6, 20, 20);
      doc.setFont("helvetica", "normal"); doc.setFontSize(5); doc.setTextColor(90, 90, 90);
      doc.text("Scan to verify", W - 17, 28.5, { align: "center" });
    } catch { /* QR is optional; never block receipt generation */ }
  }
}

interface VerifyResult {
  verified: boolean;
  receiptNumber?: string;
  memberName?: string;
  dkmoId?: string;
  receiptDate?: string;
  amount?: number;
  issuedAt?: string;
  error?: string;
}

export default function PrintReceipts() {
  const [search, setSearch] = useState("");
  const [receiptSearch, setReceiptSearch] = useState("");
  const [dkmoSearch, setDkmoSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"payments" | "records" | "verify">("payments");
  const [verifyInput, setVerifyInput] = useState("");
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  const monthFilter = useMemo(() => {
    const params = new URLSearchParams(searchString);
    const m = params.get("month");
    if (m && /^\d{4}-\d{2}$/.test(m)) return m;
    return null;
  }, [searchString]);

  const { data: payments, isLoading: isPaymentsLoading } = useListPayments();
  const { data: recordsData, isLoading: isRecordsLoading } = useListReceiptRecords(
    { search: search || undefined, page: 1, pageSize: 50 } as any
  );

  const records = useMemo(() => (recordsData as any)?.items ?? recordsData ?? [], [recordsData]);

  const monthScopedPayments = useMemo(() => {
    if (!payments) return [];
    if (!monthFilter) return payments;
    return payments.filter((p) => p.paidAt.slice(0, 7) === monthFilter);
  }, [payments, monthFilter]);

  const monthTotal = useMemo(
    () => monthScopedPayments.reduce((acc, p) => acc + Number(p.amountPaid), 0),
    [monthScopedPayments],
  );

  const filteredPayments = useMemo(() => {
    let list = monthScopedPayments;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((p) =>
        p.memberName.toLowerCase().includes(s) ||
        p.receiptNumber.toLowerCase().includes(s) ||
        p.membershipId.toLowerCase().includes(s),
      );
    }
    if (receiptSearch) {
      list = list.filter((p) => p.receiptNumber.toLowerCase().includes(receiptSearch.toLowerCase()));
    }
    if (dkmoSearch) {
      list = list.filter((p) => p.membershipId.toLowerCase().includes(dkmoSearch.toLowerCase()));
    }
    if (dateFrom) {
      list = list.filter((p) => new Date(p.paidAt) >= new Date(dateFrom));
    }
    if (dateTo) {
      list = list.filter((p) => new Date(p.paidAt) <= new Date(dateTo + "T23:59:59"));
    }
    return list;
  }, [monthScopedPayments, search, receiptSearch, dkmoSearch, dateFrom, dateTo]);

  const clearMonthFilter = () => setLocation("/print-receipts");

  const hasAdvancedFilter = receiptSearch || dkmoSearch || dateFrom || dateTo;
  const clearAll = () => { setSearch(""); setReceiptSearch(""); setDkmoSearch(""); setDateFrom(""); setDateTo(""); };

  const downloadReceiptPDF = async (payment: (typeof filteredPayments)[number]) => {
    const logoDataUrl = await loadImageAsBase64(`${basePath}/logo-circle.png`);
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a5" });
    await buildReceiptPdf(doc, { receiptNumber: payment.receiptNumber, memberName: payment.memberName, membershipId: payment.membershipId, paidAt: payment.paidAt, amountPaid: payment.amountPaid, notes: payment.notes }, logoDataUrl);
    doc.save(`DKMO_Receipt_${payment.receiptNumber}.pdf`);
  };

  const printReceipt = async (payment: (typeof filteredPayments)[number]) => {
    const logoDataUrl = await loadImageAsBase64(`${basePath}/logo-circle.png`);
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a5" });
    await buildReceiptPdf(doc, { receiptNumber: payment.receiptNumber, memberName: payment.memberName, membershipId: payment.membershipId, paidAt: payment.paidAt, amountPaid: payment.amountPaid, notes: payment.notes }, logoDataUrl);
    doc.autoPrint();
    window.open(doc.output("bloburl"), "_blank");
  };

  const downloadRecordPDF = async (record: any) => {
    const logoDataUrl = await loadImageAsBase64(`${basePath}/logo-circle.png`);
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a5" });
    await buildReceiptPdf(doc, {
      receiptNumber: record.receiptNumber,
      memberName: record.memberName,
      membershipId: record.dkmoId || "",
      paidAt: record.createdAt,
      amountPaid: record.amount,
    }, logoDataUrl);
    doc.save(`DKMO_Receipt_${record.receiptNumber}.pdf`);
  };

  // Deep link from receipt QR codes: /print-receipts?verify=DKMO-RC-…
  // Opens the Verify tab and runs the check automatically (login required).
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const v = params.get("verify");
    if (!v) return;
    setActiveTab("verify");
    setVerifyInput(v);
    setVerifying(true);
    setVerifyResult(null);
    customFetch<VerifyResult>(`/api/receipts/verify/${encodeURIComponent(v)}`)
      .then(setVerifyResult)
      .catch(() => setVerifyResult({ verified: false, error: "Receipt not found or invalid number" }))
      .finally(() => setVerifying(false));
  }, [searchString]);

  const handleVerify = async () => {
    if (!verifyInput.trim()) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const data = await customFetch<VerifyResult>(`/api/receipts/verify/${encodeURIComponent(verifyInput.trim())}`);
      setVerifyResult(data);
    } catch {
      setVerifyResult({ verified: false, error: "Receipt not found or invalid number" });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-950 dark:text-emerald-100">Print Receipts</h1>
          <p className="text-emerald-700/80 dark:text-slate-400">Receipt Retrieval Center — search, print, download and verify</p>
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
            <Button variant="outline" size="sm" onClick={clearMonthFilter}
              className="border-emerald-200 dark:border-slate-700 text-emerald-800 dark:text-slate-300">
              <X className="h-4 w-4 mr-1" /> Clear month filter
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="border border-emerald-100 dark:border-slate-800 bg-emerald-50/50 dark:bg-slate-900">
          <TabsTrigger value="payments" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800">
            <Printer className="h-4 w-4 mr-2" />
            Payment Receipts
          </TabsTrigger>
          <TabsTrigger value="records" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800">
            <FileText className="h-4 w-4 mr-2" />
            Issued Records
          </TabsTrigger>
          <TabsTrigger value="verify" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800">
            <QrCode className="h-4 w-4 mr-2" />
            Verify Receipt
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: Payment Receipts ── */}
        <TabsContent value="payments">
          <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <CardHeader>
              <CardTitle className="text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                <Printer className="h-5 w-5 text-emerald-600" />
                Payment Receipts
              </CardTitle>
              <CardDescription className="dark:text-slate-400">Search by member name, receipt #, or DKMO ID. Filter by date range.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-400" />
                  <Input
                    placeholder="Name / any field…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 border-emerald-200 dark:border-slate-700 dark:bg-slate-800/60"
                  />
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Receipt # …"
                    value={receiptSearch}
                    onChange={(e) => setReceiptSearch(e.target.value)}
                    className="pl-9 border-emerald-200 dark:border-slate-700 dark:bg-slate-800/60"
                  />
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="DKMO ID…"
                    value={dkmoSearch}
                    onChange={(e) => setDkmoSearch(e.target.value)}
                    className="pl-9 border-emerald-200 dark:border-slate-700 dark:bg-slate-800/60"
                  />
                </div>
                {hasAdvancedFilter && (
                  <Button variant="ghost" size="sm" onClick={clearAll} className="text-slate-500 h-9">
                    <X className="h-4 w-4 mr-1" /> Clear filters
                  </Button>
                )}
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">From date</label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                    className="border-emerald-200 dark:border-slate-700 dark:bg-slate-800/60" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">To date</label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                    className="border-emerald-200 dark:border-slate-700 dark:bg-slate-800/60" />
                </div>
              </div>

              <div className="rounded-md border border-emerald-100 dark:border-slate-800 overflow-hidden">
                <Table>
                  <TableHeader className="bg-emerald-50/50 dark:bg-slate-800/60">
                    <TableRow className="dark:border-slate-700">
                      <TableHead className="font-medium text-emerald-900 dark:text-slate-300">Receipt #</TableHead>
                      <TableHead className="font-medium text-emerald-900 dark:text-slate-300">Member</TableHead>
                      <TableHead className="font-medium text-emerald-900 dark:text-slate-300 hidden sm:table-cell">Month</TableHead>
                      <TableHead className="font-medium text-emerald-900 dark:text-slate-300 hidden md:table-cell">Date</TableHead>
                      <TableHead className="font-medium text-emerald-900 dark:text-slate-300 text-right">Amount</TableHead>
                      <TableHead className="font-medium text-emerald-900 dark:text-slate-300 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isPaymentsLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i} className="dark:border-slate-800">
                          {[24, 36, 20, 24, 16, 40].map((w, j) => (
                            <TableCell key={j}><Skeleton className={`h-5 w-${w}`} /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : filteredPayments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-emerald-600 dark:text-slate-500">
                          No receipts found for the current filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPayments.map((payment) => (
                        <TableRow key={payment.id} className="hover:bg-emerald-50/30 dark:hover:bg-slate-800/50 dark:border-slate-800">
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-xs border-emerald-200 dark:border-slate-700 text-emerald-800 dark:text-slate-300">
                              {payment.receiptNumber}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-emerald-950 dark:text-slate-200">{payment.memberName}</div>
                            <div className="text-xs text-emerald-600 dark:text-slate-500">{payment.membershipId}</div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-sm text-emerald-700 dark:text-slate-400">
                            {formatYearMonth(payment.paidAt.slice(0, 7))}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-emerald-700 dark:text-slate-400">
                            {formatDate(payment.paidAt)}
                          </TableCell>
                          <TableCell className="text-right font-bold text-emerald-900 dark:text-green-300">
                            {formatSAR(payment.amountPaid)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="outline" size="sm"
                                className="border-emerald-200 dark:border-slate-700 text-emerald-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-slate-800"
                                onClick={() => printReceipt(payment)}>
                                <Printer className="mr-1 h-3 w-3" /> Print
                              </Button>
                              <Button variant="outline" size="sm"
                                className="border-emerald-200 dark:border-slate-700 text-emerald-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-slate-800"
                                onClick={() => downloadReceiptPDF(payment)}>
                                <Download className="mr-1 h-3 w-3" /> PDF
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
                <p className="text-xs text-emerald-600/70 dark:text-slate-500 text-right">
                  {filteredPayments.length} receipt{filteredPayments.length !== 1 ? "s" : ""} shown
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 2: Issued Records ── */}
        <TabsContent value="records">
          <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <CardHeader>
              <CardTitle className="text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                <FileText className="h-5 w-5 text-emerald-600" />
                Issued Receipt Records
              </CardTitle>
              <CardDescription className="dark:text-slate-400">
                Receipts generated via the Receipt Generator page. Search by receipt number, name, or DKMO ID.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-400" />
                <Input
                  placeholder="Search receipt number, name, DKMO ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 border-emerald-200 dark:border-slate-700 dark:bg-slate-800/60"
                />
              </div>
              <div className="rounded-md border border-emerald-100 dark:border-slate-800 overflow-hidden">
                <Table>
                  <TableHeader className="bg-emerald-50/50 dark:bg-slate-800/60">
                    <TableRow className="dark:border-slate-700">
                      <TableHead className="font-medium text-emerald-900 dark:text-slate-300">Receipt #</TableHead>
                      <TableHead className="font-medium text-emerald-900 dark:text-slate-300">Member</TableHead>
                      <TableHead className="font-medium text-emerald-900 dark:text-slate-300 hidden sm:table-cell">Date</TableHead>
                      <TableHead className="font-medium text-emerald-900 dark:text-slate-300 text-right">Amount</TableHead>
                      <TableHead className="font-medium text-emerald-900 dark:text-slate-300 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isRecordsLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i} className="dark:border-slate-800">
                          {[24, 36, 24, 16, 40].map((w, j) => (
                            <TableCell key={j}><Skeleton className={`h-5 w-${w}`} /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : !records.length ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-emerald-600 dark:text-slate-500">
                          No issued receipt records found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      records.map((r: any) => (
                        <TableRow key={r.id} className="hover:bg-emerald-50/30 dark:hover:bg-slate-800/50 dark:border-slate-800">
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-xs border-emerald-200 dark:border-slate-700 text-emerald-800 dark:text-slate-300">
                              {r.receiptNumber}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-emerald-950 dark:text-slate-200">{r.memberName}</div>
                            {r.dkmoId && <div className="text-xs text-emerald-600 dark:text-slate-500">{r.dkmoId}</div>}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-sm text-emerald-700 dark:text-slate-400">
                            {r.receiptDate}
                          </TableCell>
                          <TableCell className="text-right font-bold text-emerald-900 dark:text-green-300">
                            {formatSAR(r.amount)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm"
                              className="border-emerald-200 dark:border-slate-700 text-emerald-700 dark:text-slate-300"
                              onClick={() => downloadRecordPDF(r)}>
                              <Download className="mr-1 h-3 w-3" /> PDF
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 3: Verify Receipt ── */}
        <TabsContent value="verify">
          <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <CardHeader>
              <CardTitle className="text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                Receipt Verification
              </CardTitle>
              <CardDescription className="dark:text-slate-400">
                Enter a receipt number to verify its authenticity against DKMO records.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="max-w-md">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                  Receipt Number
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      value={verifyInput}
                      onChange={(e) => setVerifyInput(e.target.value)}
                      placeholder="e.g. DKMO-RC-202606-0001"
                      className="pl-9 border-emerald-200 dark:border-slate-700 dark:bg-slate-800/60 font-mono"
                      onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                    />
                  </div>
                  <Button
                    onClick={handleVerify}
                    disabled={!verifyInput.trim() || verifying}
                    className="bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-700 text-white"
                  >
                    {verifying ? "Checking…" : "Verify"}
                  </Button>
                </div>
              </div>

              {verifyResult && (
                <div className={`rounded-2xl border p-5 ${verifyResult.verified
                  ? "border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-950/20"
                  : "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20"}`}>
                  <div className="flex items-center gap-3 mb-4">
                    {verifyResult.verified
                      ? <CheckCircle className="h-7 w-7 text-green-600 dark:text-green-400 shrink-0" />
                      : <AlertTriangle className="h-7 w-7 text-red-600 dark:text-red-400 shrink-0" />}
                    <div>
                      <p className={`text-lg font-bold ${verifyResult.verified ? "text-green-800 dark:text-green-300" : "text-red-700 dark:text-red-400"}`}>
                        {verifyResult.verified ? "Receipt Verified" : "Receipt Not Found"}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {verifyResult.verified
                          ? "This receipt is authentic and exists in DKMO records."
                          : verifyResult.error ?? "No matching receipt found in the system."}
                      </p>
                    </div>
                  </div>
                  {verifyResult.verified && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[
                        { label: "Receipt #",    value: verifyResult.receiptNumber },
                        { label: "Member Name",  value: verifyResult.memberName },
                        { label: "DKMO ID",      value: verifyResult.dkmoId || "—" },
                        { label: "Receipt Date", value: verifyResult.receiptDate },
                        { label: "Amount",       value: verifyResult.amount ? formatSAR(verifyResult.amount) : "—" },
                        { label: "Issued At",    value: verifyResult.issuedAt ? formatDate(verifyResult.issuedAt) : "—" },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-green-100 dark:border-slate-800">
                          <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                          <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 text-sm">{value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <QrCode className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Each DKMO receipt contains a verification code. Enter the receipt number above to confirm authenticity.
                  Receipts generated via the <strong>Receipt Generator</strong> page are automatically logged here.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
