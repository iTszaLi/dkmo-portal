import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import {
  Landmark,
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  CalendarClock,
  Users,
  Wallet,
  TrendingDown,
  MoreHorizontal,
  Eye,
  Banknote,
  FileText,
  FileSpreadsheet,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  useListLoans,
  useGetLoanStats,
  useCreateLoan,
  useUpdateLoan,
  useDeleteLoan,
  useListMembers,
  type Loan,
  type LoanStatus,
  type LoanListStatusFilter,
  type LoanType,
} from "@workspace/api-client-react";

export const LOAN_PURPOSES: { value: LoanType; label: string }[] = [
  { value: "personal", label: "Personal" },
  { value: "medical", label: "Medical" },
  { value: "education", label: "Education" },
  { value: "business", label: "Business" },
  { value: "emergency", label: "Emergency" },
  { value: "marriage", label: "Marriage" },
  { value: "housing", label: "Housing" },
  { value: "other", label: "Other" },
];

export function loanStatusBadge(status: LoanStatus) {
  switch (status) {
    case "active":
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-900">Active</Badge>;
    case "overdue":
      return <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-900">Overdue</Badge>;
    case "closed":
      return <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-900">Closed</Badge>;
    case "defaulted":
      return <Badge className="bg-gray-100 text-gray-700 border-gray-200 dark:bg-slate-800 dark:text-slate-400">Defaulted</Badge>;
  }
}

export function purposeLabel(type: LoanType) {
  return LOAN_PURPOSES.find((p) => p.value === type)?.label ?? type;
}

export function fmtSAR(n: number) {
  return new Intl.NumberFormat("en-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 }).format(n);
}

const createSchema = z
  .object({
    memberId: z.string().min(1, "Please select a member"),
    loanType: z.enum(["personal", "medical", "education", "business", "emergency", "marriage", "housing", "other"]),
    principalAmount: z.coerce.number().positive("Enter the loan amount"),
    emiAmount: z.coerce.number().positive("Enter the monthly payment"),
    disbursedDate: z.string().min(1, "Choose the disbursement date"),
    convenorName: z.string().default(""),
    notes: z.string().default(""),
  })
  .refine((d) => d.emiAmount <= d.principalAmount, {
    message: "Monthly payment cannot be more than the loan amount",
    path: ["emiAmount"],
  });
type CreateValues = z.infer<typeof createSchema>;

const PAGE_SIZE = 20;
const today = () => new Date().toISOString().slice(0, 10);

export default function Loans() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { user, canEdit, hasRole } = useAuth();
  const isAdmin = hasRole("admin");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LoanListStatusFilter | "">("");
  const [typeFilter, setTypeFilter] = useState<LoanType | "">("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: statsData } = useGetLoanStats();
  const { data: membersData } = useListMembers();
  const { data, isLoading } = useListLoans({
    search: search || undefined,
    status: statusFilter || undefined,
    loanType: typeFilter || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const createLoan = useCreateLoan();
  const updateLoan = useUpdateLoan(editingLoan?.id ?? "");
  const deleteLoan = useDeleteLoan();

  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      memberId: "",
      loanType: "personal",
      principalAmount: 0,
      emiAmount: 0,
      disbursedDate: today(),
      convenorName: user?.displayName ?? "",
      notes: "",
    },
  });

  const watchedPrincipal = form.watch("principalAmount");
  const watchedEmi = form.watch("emiAmount");
  const autoDuration =
    Number(watchedPrincipal) > 0 && Number(watchedEmi) > 0 && Number(watchedEmi) <= Number(watchedPrincipal)
      ? Math.ceil(Number(watchedPrincipal) / Number(watchedEmi))
      : 0;

  const openAdd = () => {
    setEditingLoan(null);
    form.reset({
      memberId: "",
      loanType: "personal",
      principalAmount: 0,
      emiAmount: 0,
      disbursedDate: today(),
      convenorName: user?.displayName ?? "",
      notes: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (loan: Loan) => {
    setEditingLoan(loan);
    form.reset({
      memberId: loan.memberId ?? "",
      loanType: loan.loanType,
      principalAmount: loan.principalAmount,
      emiAmount: loan.emiAmount,
      disbursedDate: loan.disbursedDate ?? today(),
      convenorName: loan.convenorName,
      notes: loan.notes,
    });
    setDialogOpen(true);
  };

  const onSubmit = async (values: CreateValues) => {
    try {
      if (editingLoan) {
        await updateLoan.mutateAsync({
          memberId: values.memberId,
          loanType: values.loanType,
          principalAmount: values.principalAmount,
          emiAmount: values.emiAmount,
          disbursedDate: values.disbursedDate,
          convenorName: values.convenorName,
          notes: values.notes,
        });
        toast({ title: "Loan updated" });
      } else {
        await createLoan.mutateAsync(values);
        toast({ title: "Loan Created Successfully", description: `${autoDuration} monthly payments of ${fmtSAR(values.emiAmount)}` });
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Could not save loan", description: err?.message, variant: "destructive" });
    }
  };

  const onDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteLoan.mutateAsync(deleteId);
      toast({ title: "Loan deleted" });
    } catch {
      toast({ title: "Error deleting loan", variant: "destructive" });
    } finally {
      setDeleteId(null);
    }
  };

  const stats = statsData;
  const loans = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const members = membersData ?? [];

  const exportRows = useMemo(
    () =>
      loans.map((l) => [
        l.memberName ?? "—",
        purposeLabel(l.loanType),
        l.principalAmount,
        `${l.paidEmis}/${l.emiCount}`,
        l.outstandingBalance,
        l.status,
        l.convenorName || "—",
        l.disbursedDate ? format(new Date(l.disbursedDate), "dd MMM yyyy") : "—",
      ]),
    [loans],
  );
  const EXPORT_HEAD = ["Member", "Purpose", "Amount (SAR)", "Progress", "Outstanding (SAR)", "Status", "Convenor", "Disbursed"];

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text("DKMO — Loans", 14, 14);
    autoTable(doc, { head: [EXPORT_HEAD], body: exportRows, startY: 20, styles: { fontSize: 8 } });
    doc.save("dkmo-loans.pdf");
  };
  const exportExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Loans");
    ws.addRow(EXPORT_HEAD);
    ws.getRow(1).font = { bold: true };
    exportRows.forEach((r) => ws.addRow(r));
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dkmo-loans.xlsx";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const exportCsv = () => {
    const csv = [EXPORT_HEAD, ...exportRows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dkmo-loans.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const switchStatus = (s: LoanListStatusFilter | "") => {
    setStatusFilter((cur) => (cur === s ? "" : s));
    setPage(1);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 dark:bg-green-900/40">
            <Landmark className="h-5 w-5 text-green-700 dark:text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Loans</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Simple loan tracking — balances and status update automatically
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportPdf} data-testid="button-loans-pdf">
            <FileText className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} data-testid="button-loans-excel">
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-loans-csv">
            <FileSpreadsheet className="h-4 w-4 mr-1" /> CSV
          </Button>
          {canEdit && (
            <Button onClick={openAdd} className="bg-green-700 hover:bg-green-800 text-white gap-2" data-testid="button-new-loan">
              <Plus className="h-4 w-4" />
              New Loan
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total Loans" value={stats.total} icon={<Landmark className="h-4 w-4 text-slate-500" />} onClick={() => switchStatus("")} active={statusFilter === ""} />
          <StatCard label="Active" value={stats.active} icon={<Clock className="h-4 w-4 text-blue-500" />} highlight="blue" onClick={() => switchStatus("active")} active={statusFilter === "active"} />
          <StatCard label="Overdue" value={stats.overdue} icon={<AlertTriangle className="h-4 w-4 text-red-500" />} highlight="red" onClick={() => switchStatus("overdue")} active={statusFilter === "overdue"} />
          <StatCard label="Closed" value={stats.closed} icon={<CheckCircle2 className="h-4 w-4 text-green-500" />} highlight="green" onClick={() => switchStatus("closed")} active={statusFilter === "closed"} />
          <StatCard label="Total Loaned" value={fmtSAR(stats.totalPrincipal)} sub="all loans" icon={<Wallet className="h-4 w-4 text-violet-500" />} onClick={() => switchStatus("")} active={statusFilter === ""} />
          <StatCard label="Outstanding" value={fmtSAR(stats.totalOutstanding)} sub="loans with a balance" icon={<TrendingDown className="h-4 w-4 text-orange-500" />} highlight="orange" onClick={() => switchStatus("open")} active={statusFilter === "open"} />
          <StatCard label="Due This Month" value={fmtSAR(stats.dueThisMonthAmount)} sub={`${stats.dueThisMonthCount} payment${stats.dueThisMonthCount === 1 ? "" : "s"} expected`} icon={<CalendarClock className="h-4 w-4 text-amber-500" />} highlight="amber" onClick={() => switchStatus("due_this_month")} active={statusFilter === "due_this_month"} />
          <StatCard label="Missed Payments" value={stats.membersWithMissedPayments} sub="members behind schedule" icon={<Users className="h-4 w-4 text-red-500" />} highlight="red" onClick={() => switchStatus("overdue")} active={statusFilter === "overdue"} />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Search member, ID, phone, purpose, convenor…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            data-testid="input-loans-search"
          />
        </div>
        <Select value={statusFilter || "all"} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : (v as LoanListStatusFilter)); setPage(1); }}>
          <SelectTrigger className="w-36" data-testid="select-loans-status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="open">With balance</SelectItem>
            <SelectItem value="due_this_month">Due this month</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter || "all"} onValueChange={(v) => { setTypeFilter(v === "all" ? "" : (v as LoanType)); setPage(1); }}>
          <SelectTrigger className="w-36" data-testid="select-loans-purpose">
            <SelectValue placeholder="All purposes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All purposes</SelectItem>
            {LOAN_PURPOSES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(search || statusFilter || typeFilter) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter(""); setTypeFilter(""); setPage(1); }}>
            <X className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Loading…</div>
        ) : loans.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
            <Landmark className="h-8 w-8 opacity-30" />
            <span className="text-sm">No loans found</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Member</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Purpose</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Amount</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-500 dark:text-slate-400">Progress</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Outstanding</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loans.map((loan) => {
                  const progressPct = loan.emiCount > 0 ? Math.round((loan.paidEmis / loan.emiCount) * 100) : 0;
                  return (
                    <tr
                      key={loan.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/loans/${loan.id}`)}
                      data-testid={`row-loan-${loan.id}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {loan.memberName ?? <span className="text-slate-400 italic">Unknown</span>}
                        </div>
                        {loan.membershipId && <div className="text-xs text-slate-400">{loan.membershipId}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="capitalize">{purposeLabel(loan.loanType)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300">{fmtSAR(loan.principalAmount)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            {loan.paidEmis} / {loan.emiCount}
                          </span>
                          <div className="w-24 h-2 rounded-full bg-slate-200 dark:bg-slate-700">
                            <div className="h-2 rounded-full bg-green-500 transition-all" style={{ width: `${progressPct}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-mono font-semibold ${loan.outstandingBalance > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                          {fmtSAR(loan.outstandingBalance)}
                        </span>
                      </td>
                      <td className="px-4 py-3">{loanStatusBadge(loan.status)}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-loan-actions-${loan.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/loans/${loan.id}`)}>
                              <Eye className="mr-2 h-4 w-4" /> View Details
                            </DropdownMenuItem>
                            {canEdit && loan.outstandingBalance > 0 && (
                              <DropdownMenuItem onClick={() => navigate(`/loans/${loan.id}?pay=1`)}>
                                <Banknote className="mr-2 h-4 w-4" /> Record Payment
                              </DropdownMenuItem>
                            )}
                            {isAdmin && (
                              <>
                                <DropdownMenuItem onClick={() => openEdit(loan)}>
                                  <Pencil className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-red-600" onClick={() => setDeleteId(loan.id)}>
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{total} loans</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* New / Edit Loan Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLoan ? "Edit Loan" : "New Loan"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="memberId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Member</FormLabel>
                    <FormControl>
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
                        <SelectTrigger data-testid="select-loan-member">
                          <SelectValue placeholder="Select member…" />
                        </SelectTrigger>
                        <SelectContent>
                          {members.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.fullName} ({m.membershipId})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="principalAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Loan Amount (SAR)</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} data-testid="input-loan-amount" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="emiAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monthly Payment (SAR)</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} data-testid="input-loan-emi" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {autoDuration > 0 && (
                <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900 px-3 py-2 text-sm text-green-800 dark:text-green-300" data-testid="text-auto-duration">
                  ≈ {autoDuration} monthly payment{autoDuration === 1 ? "" : "s"} — calculated automatically
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="loanType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Purpose</FormLabel>
                      <FormControl>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger data-testid="select-loan-purpose">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LOAN_PURPOSES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="disbursedDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Disbursement Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-loan-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="convenorName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Convenor</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={!isAdmin} data-testid="input-loan-convenor" />
                    </FormControl>
                    {!isAdmin && (
                      <p className="text-xs text-slate-400">Set automatically to you — only admins can change it.</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Anything worth remembering…" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="pt-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  type="submit"
                  className="bg-green-700 hover:bg-green-800 text-white"
                  disabled={createLoan.isPending || updateLoan.isPending}
                  data-testid="button-save-loan"
                >
                  {editingLoan ? "Save Changes" : "Create Loan"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this loan?</AlertDialogTitle>
            <AlertDialogDescription>
              This also deletes its payment history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-red-600 hover:bg-red-700 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  highlight,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  highlight?: "blue" | "red" | "green" | "orange" | "amber";
  onClick?: () => void;
  active?: boolean;
}) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-600 dark:text-blue-400",
    red: "text-red-600 dark:text-red-400",
    green: "text-green-600 dark:text-green-400",
    orange: "text-orange-600 dark:text-orange-400",
    amber: "text-amber-600 dark:text-amber-400",
  };
  const textColor = (highlight && colorMap[highlight]) || "text-slate-800 dark:text-slate-100";
  const Comp: any = onClick ? "button" : "div";

  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      className={cn(
        "rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-left",
        onClick && "transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
        onClick && active && "ring-2 ring-emerald-500 dark:ring-emerald-400",
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      <div className={`text-xl font-bold ${textColor}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{sub}</div>}
    </Comp>
  );
}
