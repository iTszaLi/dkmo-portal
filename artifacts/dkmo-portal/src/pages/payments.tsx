import { useState, useEffect } from "react";
import { Link, useSearch } from "wouter";
import {
  useListPayments,
  useListMembers,
  useCreatePayment,
  useDeletePayment,
  getListPaymentsQueryKey
} from "@workspace/api-client-react";
import { PaymentInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PaymentForm } from "@/components/PaymentForm";
import { CreditCard, Plus, CalendarDays, UserCircle, MoreHorizontal, Trash, Wallet, Search } from "lucide-react";
import { PaymentMethodIcon } from "@/lib/payment-icons";
import { formatSAR, formatDate, getCurrentMonth } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "card", label: "Card" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

export default function Payments() {
  const search = useSearch();
  const params = new URLSearchParams(search);

  const initialFrom = params.get("fromMonth") || params.get("month") || getCurrentMonth();
  const initialTo = params.get("toMonth") || params.get("month") || getCurrentMonth();
  const initialMember = params.get("memberId") || "all";
  const initialMethod = params.get("method") || "all";

  const [fromMonth, setFromMonth] = useState(initialFrom);
  const [toMonth, setToMonth] = useState(initialTo);
  const [memberFilter, setMemberFilter] = useState<string>(initialMember);
  const [methodFilter, setMethodFilter] = useState<string>(initialMethod);
  const [textSearch, setTextSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [deletingPayment, setDeletingPayment] = useState<any>(null);

  useEffect(() => {
    const p = new URLSearchParams(search);
    if (p.get("fromMonth")) setFromMonth(p.get("fromMonth")!);
    if (p.get("toMonth")) setToMonth(p.get("toMonth")!);
    if (p.get("month")) {
      setFromMonth(p.get("month")!);
      setToMonth(p.get("month")!);
    }
    if (p.get("memberId")) setMemberFilter(p.get("memberId")!);
    if (p.get("method")) setMethodFilter(p.get("method")!);
  }, [search]);

  const { data: members, isLoading: isMembersLoading } = useListMembers();
  const { data: rawPayments, isLoading: isPaymentsLoading } = useListPayments({
    fromMonth: fromMonth || undefined,
    toMonth: toMonth || undefined,
    memberId: memberFilter === "all" ? undefined : memberFilter,
    paymentMethod: methodFilter === "all" ? undefined : methodFilter,
  });

  const payments = textSearch.trim()
    ? rawPayments?.filter((p) => {
        const q = textSearch.toLowerCase();
        return (
          p.memberName?.toLowerCase().includes(q) ||
          p.receiptNumber?.toLowerCase().includes(q) ||
          p.membershipId?.toLowerCase().includes(q)
        );
      })
    : rawPayments;

  const createPayment = useCreatePayment();
  const deletePayment = useDeletePayment();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleCreate = (data: PaymentInput) => {
    createPayment.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey() });
        setIsAddOpen(false);
        toast({ title: "Payment recorded successfully" });
      },
      onError: (err: any) => {
        toast({ title: "Failed to record payment", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleDelete = () => {
    if (!deletingPayment) return;
    deletePayment.mutate({ id: deletingPayment.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey() });
        setDeletingPayment(null);
        toast({ title: "Payment deleted successfully" });
      },
      onError: (err: any) => {
        toast({ title: "Failed to delete payment", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-950 dark:text-emerald-100">Payments</h1>
          <p className="text-emerald-700/80 dark:text-slate-400">Record and track member contributions</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white">
              <Plus className="mr-2 h-4 w-4" /> Record Payment
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] dark:bg-slate-900 dark:border-slate-800">
            <DialogHeader>
              <DialogTitle className="dark:text-slate-100">Record New Payment</DialogTitle>
            </DialogHeader>
            <PaymentForm onSubmit={handleCreate} isSubmitting={createPayment.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-emerald-100 dark:border-slate-800 shadow-sm">
        <div className="space-y-1">
          <label className="text-xs font-medium text-emerald-700 dark:text-slate-400">From Month</label>
          <div className="flex items-center space-x-2 border border-emerald-200 dark:border-slate-700 rounded-md px-3 h-10 bg-transparent">
            <CalendarDays className="h-4 w-4 text-emerald-500 dark:text-slate-500 shrink-0" />
            <Input
              type="month"
              value={fromMonth}
              onChange={(e) => setFromMonth(e.target.value)}
              className="border-0 focus-visible:ring-0 shadow-none px-0 h-8 bg-transparent dark:text-slate-200 dark:placeholder:text-slate-500"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-emerald-700 dark:text-slate-400">To Month</label>
          <div className="flex items-center space-x-2 border border-emerald-200 dark:border-slate-700 rounded-md px-3 h-10 bg-transparent">
            <CalendarDays className="h-4 w-4 text-emerald-500 dark:text-slate-500 shrink-0" />
            <Input
              type="month"
              value={toMonth}
              onChange={(e) => setToMonth(e.target.value)}
              className="border-0 focus-visible:ring-0 shadow-none px-0 h-8 bg-transparent dark:text-slate-200 dark:placeholder:text-slate-500"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-emerald-700 dark:text-slate-400">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-400 dark:text-slate-500" />
            <Input
              placeholder="Name, receipt, or member ID…"
              value={textSearch}
              onChange={(e) => setTextSearch(e.target.value)}
              className="pl-9 h-10 border-emerald-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-emerald-700 dark:text-slate-400">Filter by Member</label>
          <Select value={memberFilter} onValueChange={setMemberFilter} disabled={isMembersLoading}>
            <SelectTrigger className="border-emerald-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 h-10">
              <SelectValue placeholder="All Members" />
            </SelectTrigger>
            <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
              <SelectItem value="all" className="dark:text-slate-300 dark:focus:bg-slate-800">All Members</SelectItem>
              {members?.map(m => (
                <SelectItem key={m.id} value={m.id} className="dark:text-slate-300 dark:focus:bg-slate-800">{m.fullName} ({m.membershipId})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-emerald-700 dark:text-slate-400">Filter by Method</label>
          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="border-emerald-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 h-10">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-emerald-500 dark:text-slate-500" />
                <SelectValue placeholder="All Methods" />
              </div>
            </SelectTrigger>
            <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
              <SelectItem value="all" className="dark:text-slate-300 dark:focus:bg-slate-800">All Methods</SelectItem>
              {PAYMENT_METHODS.map(m => (
                <SelectItem key={m.value} value={m.value} className="dark:text-slate-300 dark:focus:bg-slate-800">{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-emerald-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-emerald-50/50 dark:bg-slate-800/60">
            <TableRow className="dark:border-slate-700">
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Member</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Month</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Receipt & Date</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Method</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Amount</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPaymentsLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="dark:border-slate-800">
                  <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : payments?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-emerald-600 dark:text-slate-500">
                  <div className="flex flex-col items-center justify-center">
                    <CreditCard className="h-8 w-8 text-emerald-200 dark:text-slate-700 mb-2" />
                    <p>No payments found for the selected filters.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              payments?.map((payment) => (
                <TableRow key={payment.id} className="hover:bg-emerald-50/30 dark:hover:bg-slate-800/50 dark:border-slate-800 transition-colors">
                  <TableCell>
                    <Link href={`/members/${payment.memberId}`} className="flex items-center gap-3 group">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-900/60 transition-colors shrink-0">
                        <UserCircle className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-medium text-emerald-950 dark:text-slate-200 group-hover:text-emerald-700 dark:group-hover:text-green-300 transition-colors">{payment.memberName}</div>
                        <div className="text-xs text-emerald-600 dark:text-slate-500">ID: {payment.membershipId}</div>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-emerald-800 dark:text-slate-300">{payment.month}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium text-emerald-900 dark:text-slate-200">{payment.receiptNumber}</div>
                    <div className="text-xs text-emerald-600 dark:text-slate-500">{formatDate(payment.paidAt)}</div>
                  </TableCell>
                  <TableCell>
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 text-xs font-medium capitalize border border-transparent dark:border-slate-700">
                      <PaymentMethodIcon method={payment.paymentMethod} className="h-3.5 w-3.5" />
                      {payment.paymentMethod.replace('_', ' ')}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-bold text-emerald-900 dark:text-green-300">
                    {formatSAR(payment.amountPaid)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="dark:bg-slate-900 dark:border-slate-800">
                        <DropdownMenuItem onClick={() => setDeletingPayment(payment)} className="text-red-600 dark:text-red-400 dark:focus:bg-slate-800">
                          <Trash className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deletingPayment} onOpenChange={(open) => !open && setDeletingPayment(null)}>
        <AlertDialogContent className="dark:bg-slate-900 dark:border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-slate-100">Delete Payment Record</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-slate-400">
              Are you sure you want to delete this payment of {formatSAR(deletingPayment?.amountPaid)} 
              from {deletingPayment?.memberName}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
