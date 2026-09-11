import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute, useSearch } from "wouter";
import { format } from "date-fns";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  Landmark,
  Trash2,
  User,
  Wallet,
  FileText,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import {
  useGetLoan,
  useListLoanPayments,
  useRecordLoanPayment,
  useDeleteLoanPayment,
  type LoanPaymentMethod,
} from "@workspace/api-client-react";
import { loanStatusBadge, purposeLabel, fmtSAR } from "./loans";
import { getReturnTarget, useReturnNavigation, withReturnTo } from "@/lib/navigation";

const METHODS: { value: LoanPaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "cheque", label: "Cheque" },
];

const methodLabel = (m: string) => METHODS.find((x) => x.value === m)?.label ?? m;
const today = () => new Date().toISOString().slice(0, 10);

export default function LoanDetail() {
  const [, params] = useRoute("/loans/:id");
  const loanId = params?.id ?? "";
  const searchStr = useSearch();
  const [, navigate] = useLocation();
  const goBack = useReturnNavigation("/loans");
  const { toast } = useToast();
  const { canEdit, hasRole } = useAuth();
  const isAdmin = hasRole("admin");

  const { data: loan, isLoading } = useGetLoan(loanId);
  const { data: payments, isLoading: paymentsLoading } = useListLoanPayments(loanId);
  const recordPayment = useRecordLoanPayment(loanId);
  const deletePayment = useDeleteLoanPayment(loanId);

  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [payDate, setPayDate] = useState(today());
  const [method, setMethod] = useState<LoanPaymentMethod>("cash");
  const [notes, setNotes] = useState("");
  const [deletePaymentId, setDeletePaymentId] = useState<string | null>(null);

  // Deep-link ?pay=1 opens the payment dialog directly.
  useEffect(() => {
    if (new URLSearchParams(searchStr).get("pay") === "1") setPayOpen(true);
  }, [searchStr]);

  const suggestedAmount = useMemo(() => {
    if (!loan) return 0;
    return Math.min(loan.emiAmount, loan.outstandingBalance);
  }, [loan]);

  const openPay = () => {
    setAmount(String(suggestedAmount || ""));
    setPayDate(today());
    setMethod("cash");
    setNotes("");
    setPayOpen(true);
  };

  const submitPayment = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast({ title: "Enter a valid payment amount", variant: "destructive" });
      return;
    }
    if (loan && amt > loan.outstandingBalance) {
      toast({ title: "Payment is more than the outstanding balance", description: `Outstanding: ${fmtSAR(loan.outstandingBalance)}`, variant: "destructive" });
      return;
    }
    try {
      const res = await recordPayment.mutateAsync({ amount: amt, paymentDate: payDate, paymentMethod: method, notes });
      setPayOpen(false);
      if (res.loanClosed) {
        toast({ title: "Loan Closed Successfully 🎉", description: "The final payment has been received." });
      } else {
        toast({ title: "Payment Recorded Successfully" });
      }
      goBack();
    } catch (err: any) {
      toast({ title: "Could not record payment", description: err?.message, variant: "destructive" });
    }
  };

  const onDeletePayment = async () => {
    if (!deletePaymentId) return;
    try {
      await deletePayment.mutateAsync(deletePaymentId);
      toast({ title: "Payment removed", description: "Balances have been recalculated." });
    } catch {
      toast({ title: "Could not remove payment", variant: "destructive" });
    } finally {
      setDeletePaymentId(null);
    }
  };

  const printSummary = () => {
    if (!loan) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("DKMO — Loan Summary", 14, 16);
    doc.setFontSize(10);
    autoTable(doc, {
      startY: 24,
      head: [["Field", "Value"]],
      body: [
        ["Member", loan.memberName ?? "—"],
        ["Purpose", purposeLabel(loan.loanType)],
        ["Loan Amount", fmtSAR(loan.principalAmount)],
        ["Monthly Payment", fmtSAR(loan.emiAmount)],
        ["Duration", `${loan.emiCount} months`],
        ["Progress", `${loan.paidEmis} / ${loan.emiCount} payments`],
        ["Paid", fmtSAR(loan.totalPaid)],
        ["Outstanding", fmtSAR(loan.outstandingBalance)],
        ["Status", loan.status],
        ["Start Date", loan.disbursedDate ? format(new Date(loan.disbursedDate), "dd MMM yyyy") : "—"],
        ["Convenor", loan.convenorName || "—"],
         ["Responsible Staff / Committee Member", loan.responsibleStaff ? `${loan.responsibleStaff.fullName} — ${loan.responsibleStaff.position}` : "—"],
        ["Notes", loan.notes || "—"],
      ],
    });
    if (payments?.length) {
      autoTable(doc, {
        head: [["Date", "Amount", "Method", "Recorded By", "Notes"]],
        body: payments.map((p) => [
          format(new Date(p.paymentDate), "dd MMM yyyy"),
          fmtSAR(p.amount),
          methodLabel(p.paymentMethod),
          p.recordedBy || "—",
          p.notes || "—",
        ]),
      });
    }
    doc.save("loan-summary.pdf");
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!loan) {
    return (
      <div className="p-6">
        <p className="text-slate-500">Loan not found.</p>
        <Button variant="outline" className="mt-3" onClick={goBack}><ArrowLeft className="h-4 w-4 mr-2" /> Back to Loans</Button>
      </div>
    );
  }

  const progressPct = loan.emiCount > 0 ? Math.min(100, Math.round((loan.paidEmis / loan.emiCount) * 100)) : 0;

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBack} data-testid="button-back-loans" aria-label="Back to previous context">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3">
              {loan.memberName ?? "Unknown member"}
              {loanStatusBadge(loan.status)}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 capitalize">
              {purposeLabel(loan.loanType)} loan{loan.membershipId ? ` · ${loan.membershipId}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={printSummary} data-testid="button-print-summary">
            <FileText className="h-4 w-4 mr-1" /> Print Summary
          </Button>
          {canEdit && loan.outstandingBalance > 0 && (
            <Button onClick={openPay} className="bg-green-700 hover:bg-green-800 text-white" data-testid="button-record-payment">
              <Banknote className="h-4 w-4 mr-2" /> Record Payment
            </Button>
          )}
        </div>
      </div>

      {/* Key figures */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <InfoCard icon={<Landmark className="h-4 w-4 text-slate-500" />} label="Loan Amount" value={fmtSAR(loan.principalAmount)} />
        <InfoCard icon={<Wallet className="h-4 w-4 text-orange-500" />} label="Outstanding" value={fmtSAR(loan.outstandingBalance)} valueClass={loan.outstandingBalance > 0 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"} />
        <InfoCard icon={<Banknote className="h-4 w-4 text-green-600" />} label="Monthly Payment" value={fmtSAR(loan.emiAmount)} />
        <InfoCard icon={<CalendarDays className="h-4 w-4 text-blue-500" />} label="Duration" value={`${loan.emiCount} months`} />
      </div>

      {/* Progress */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-700 dark:text-slate-300" data-testid="text-loan-progress">
            {loan.paidEmis} / {loan.emiCount} Payments Completed
          </span>
          <span className="text-slate-500">{progressPct}%</span>
        </div>
        <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div className="h-3 rounded-full bg-green-500 transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-sm">
          <div><span className="text-slate-500 block text-xs">Paid</span><span className="font-semibold text-green-700 dark:text-green-400">{fmtSAR(loan.totalPaid)}</span></div>
          <div><span className="text-slate-500 block text-xs">Remaining</span><span className="font-semibold text-slate-800 dark:text-slate-200">{fmtSAR(loan.outstandingBalance)}</span></div>
          <div><span className="text-slate-500 block text-xs">Start Date</span><span className="font-semibold text-slate-800 dark:text-slate-200">{loan.disbursedDate ? format(new Date(loan.disbursedDate), "dd MMM yyyy") : "—"}</span></div>
           <div><span className="text-slate-500 block text-xs">Convenor</span><span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1"><User className="h-3.5 w-3.5 text-slate-400" />{loan.convenorName || "—"}</span></div>
           <div><span className="text-slate-500 block text-xs">Responsible Staff / Committee Member</span><span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1"><User className="h-3.5 w-3.5 text-slate-400" />{loan.responsibleStaff ? `${loan.responsibleStaff.fullName} — ${loan.responsibleStaff.position}` : "—"}</span></div>
        </div>
        {loan.notes && <p className="text-sm text-slate-500 dark:text-slate-400 pt-1">Notes: {loan.notes}</p>}
      </div>

      {/* Payment history */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 dark:text-slate-200">Payment History</h2>
          <Badge variant="outline">{payments?.length ?? 0} payment{(payments?.length ?? 0) === 1 ? "" : "s"}</Badge>
        </div>
        {paymentsLoading ? (
          <div className="p-5"><Skeleton className="h-20 w-full" /></div>
        ) : !payments || payments.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            No payments recorded yet.
            {canEdit && loan.outstandingBalance > 0 && (
              <div className="mt-3">
                <Button onClick={openPay} variant="outline" size="sm"><Banknote className="h-4 w-4 mr-1" /> Record the first payment</Button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-2.5 text-left font-medium text-slate-500">Date</th>
                  <th className="px-4 py-2.5 text-right font-medium text-slate-500">Amount</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-500">Method</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-500">Recorded By</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-500">Notes</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-500">Status</th>
                  {isAdmin && <th className="px-4 py-2.5"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {payments.map((p) => (
                  <tr key={p.id} data-testid={`row-payment-${p.id}`}>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{format(new Date(p.paymentDate), "dd MMM yyyy")}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-green-700 dark:text-green-400">{fmtSAR(p.amount)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{methodLabel(p.paymentMethod)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{p.recordedBy || "—"}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate">{p.notes || "—"}</td>
                    <td className="px-4 py-3"><Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-900">Paid</Badge></td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => setDeletePaymentId(p.id)} data-testid={`button-delete-payment-${p.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canEdit && loan.outstandingBalance > 0 && payments && payments.length > 0 && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-800">
            <Button onClick={openPay} className="w-full bg-green-700 hover:bg-green-800 text-white h-11 text-base" data-testid="button-record-payment-bottom">
              <Banknote className="h-5 w-5 mr-2" /> Record Payment
            </Button>
          </div>
        )}
      </div>

      {/* Record Payment dialog */}
      <Dialog
        open={payOpen}
        onOpenChange={(o) => {
          setPayOpen(o);
          if (!o) navigate(withReturnTo(`/loans/${loanId}`, getReturnTarget("/loans")), { replace: true });
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
              Outstanding: <span className="font-semibold">{fmtSAR(loan.outstandingBalance)}</span> · Monthly: <span className="font-semibold">{fmtSAR(loan.emiAmount)}</span>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Payment Amount (SAR)</label>
              <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus data-testid="input-payment-amount" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Payment Date</label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} data-testid="input-payment-date" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Payment Method</label>
              <Select value={method} onValueChange={(v) => setMethod(v as LoanPaymentMethod)}>
                <SelectTrigger data-testid="select-payment-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Notes (optional)</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. paid at the meeting" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={submitPayment} disabled={recordPayment.isPending} className="bg-green-700 hover:bg-green-800 text-white" data-testid="button-save-payment">
              Save Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete payment confirm */}
      <AlertDialog open={!!deletePaymentId} onOpenChange={(o) => !o && setDeletePaymentId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this payment?</AlertDialogTitle>
            <AlertDialogDescription>
              The loan balance and status will be recalculated automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDeletePayment} className="bg-red-600 hover:bg-red-700 text-white">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InfoCard({ icon, label, value, valueClass }: { icon: React.ReactNode; label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      <div className={`text-xl font-bold ${valueClass ?? "text-slate-800 dark:text-slate-100"}`}>{value}</div>
    </div>
  );
}
