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

  const printReceipt = (payment: (typeof filteredPayments)[number]) => {
    const printContent = document.getElementById(`receipt-${payment.id}`);
    if (!printContent) return;
    const originalBody = document.body.innerHTML;
    document.body.innerHTML = printContent.innerHTML;
    window.print();
    document.body.innerHTML = originalBody;
    window.location.reload();
  };

  const downloadReceiptPDF = (payment: (typeof filteredPayments)[number]) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
    const pageW = doc.internal.pageSize.getWidth();
    const green: [number, number, number] = [5, 150, 105];

    // Header band
    doc.setFillColor(...green);
    doc.rect(0, 0, pageW, 30, "F");

    // Logo placeholder
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(5, 5, 20, 20, 2, 2, "F");
    doc.setFontSize(6);
    doc.setTextColor(5, 150, 105);
    doc.text("DKMO", 15, 16, { align: "center" });

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Dakshina Karnataka Muslim Ookota", pageW / 2, 12, { align: "center" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("ದಕ್ಷಿಣ ಕರ್ನಾಟಕ ಮುಸ್ಲಿಂ ಒಕ್ಕೂಟ", pageW / 2, 19, { align: "center" });
    doc.setFontSize(7);
    doc.text("Reg. No: DKMO/2023/1234 · Mangaluru", pageW / 2, 26, { align: "center" });

    // Receipt title
    doc.setTextColor(5, 150, 105);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("OFFICIAL RECEIPT", pageW / 2, 42, { align: "center" });
    doc.setDrawColor(5, 150, 105);
    doc.setLineWidth(0.5);
    doc.line(20, 44, pageW - 20, 44);

    // Receipt details
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Receipt No:`, 10, 54);
    doc.setFont("helvetica", "bold");
    doc.text(`${payment.receiptNumber}`, 40, 54);

    doc.setFont("helvetica", "normal");
    doc.text(`Date:`, 10, 62);
    doc.setFont("helvetica", "bold");
    doc.text(`${formatDate(payment.paidAt)}`, 40, 62);

    doc.setFont("helvetica", "normal");
    doc.text(`Membership ID:`, 10, 70);
    doc.setFont("helvetica", "bold");
    doc.text(`${payment.membershipId}`, 40, 70);

    // Body text box
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(8, 78, pageW - 16, 36, 2, 2, "F");
    doc.setDrawColor(167, 243, 208);
    doc.setLineWidth(0.3);
    doc.roundedRect(8, 78, pageW - 16, 36, 2, 2, "S");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(30, 30, 30);
    const bodyText = doc.splitTextToSize(
      `Received with thanks from ${payment.memberName}, a sum of ${formatSAR(Number(payment.amountPaid))} towards monthly contribution for the month of ${payment.month}.`,
      pageW - 26,
    );
    doc.text(bodyText, 13, 87);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Payment Mode:`, 13, 104);
    doc.setFont("helvetica", "bold");
    doc.text(payment.paymentMethod.replace("_", " ").toUpperCase(), 42, 104);

    if (payment.notes) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 100, 100);
      doc.text(`"${payment.notes}"`, 13, 110);
    }

    // Signature area
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.line(pageW - 60, 145, pageW - 10, 145);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(30, 30, 30);
    doc.text("Authorized Signatory", pageW - 35, 150, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.text("DKMO Trust", pageW - 35, 155, { align: "center" });

    // Footer
    doc.setFontSize(6.5);
    doc.setTextColor(160, 160, 160);
    doc.text("This is a computer generated receipt.", 10, 162);
    doc.text("Dakshina Karnataka Muslim Ookota — Committed to the Community", pageW / 2, 168, { align: "center" });

    doc.save(`Receipt_${payment.receiptNumber}.pdf`);
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
                        {/* Hidden receipt for browser print */}
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
                              <span className="font-semibold">Payment Mode:</span>{" "}
                              <span className="capitalize">{payment.paymentMethod.replace("_", " ")}</span>
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
          </div>
          {!isPaymentsLoading && filteredPayments.length > 0 && (
            <p className="mt-3 text-xs text-emerald-600/70 dark:text-slate-500 text-right">
              Showing {filteredPayments.length} receipt{filteredPayments.length !== 1 ? "s" : ""}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Receipt preview info card */}
      <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900/60 shadow-sm">
        <CardContent className="py-5">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/50 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200 mb-1">About Print Receipts</p>
              <p className="text-xs text-emerald-700/70 dark:text-slate-400 leading-relaxed">
                Use <strong>Print</strong> to open the browser print dialog with a formatted DKMO receipt.
                Use <strong>PDF</strong> to download a branded A5 receipt as a PDF file.
                To generate new receipts from scratch, use the <strong>Receipts</strong> page in the sidebar.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
