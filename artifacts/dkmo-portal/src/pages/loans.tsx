import { useState } from "react";
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
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import {
  useListLoans,
  useGetLoanStats,
  useCreateLoan,
  useUpdateLoan,
  useDeleteLoan,
  type Loan,
  type LoanInput,
  type LoanStatus,
  type LoanType,
} from "@workspace/api-client-react";
import { useListMembers } from "@workspace/api-client-react";

const LOAN_TYPES: { value: LoanType; label: string }[] = [
  { value: "personal", label: "Personal" },
  { value: "emergency", label: "Emergency" },
  { value: "education", label: "Education" },
  { value: "medical", label: "Medical" },
  { value: "business", label: "Business" },
];

const STATUSES: { value: LoanStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "overdue", label: "Overdue" },
  { value: "closed", label: "Closed" },
  { value: "defaulted", label: "Defaulted" },
];

const formSchema = z.object({
  memberId: z.string().optional().nullable(),
  loanType: z.enum(["personal", "emergency", "education", "medical", "business"]),
  principalAmount: z.coerce.number().nonnegative("Must be ≥ 0"),
  disbursedDate: z.string().optional().nullable(),
  emiAmount: z.coerce.number().nonnegative("Must be ≥ 0"),
  emiCount: z.coerce.number().int().nonnegative("Must be ≥ 0"),
  paidEmis: z.coerce.number().int().nonnegative("Must be ≥ 0"),
  status: z.enum(["active", "closed", "overdue", "defaulted"]),
  convenorName: z.string().default(""),
  description: z.string().default(""),
  notes: z.string().default(""),
});
type FormValues = z.infer<typeof formSchema>;

function statusBadge(status: LoanStatus) {
  switch (status) {
    case "active":
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Active</Badge>;
    case "overdue":
      return <Badge className="bg-red-100 text-red-700 border-red-200">Overdue</Badge>;
    case "closed":
      return <Badge className="bg-green-100 text-green-700 border-green-200">Closed</Badge>;
    case "defaulted":
      return <Badge className="bg-gray-100 text-gray-700 border-gray-200">Defaulted</Badge>;
  }
}

function loanTypeBadge(type: LoanType) {
  const colors: Record<LoanType, string> = {
    personal: "bg-violet-100 text-violet-700",
    emergency: "bg-orange-100 text-orange-700",
    education: "bg-sky-100 text-sky-700",
    medical: "bg-pink-100 text-pink-700",
    business: "bg-amber-100 text-amber-700",
  };
  return (
    <Badge className={`${colors[type]} border-0 capitalize`}>
      {type}
    </Badge>
  );
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const PAGE_SIZE = 20;

export default function Loans() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LoanStatus | "">("");
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

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      memberId: null,
      loanType: "personal",
      principalAmount: 0,
      disbursedDate: null,
      emiAmount: 0,
      emiCount: 0,
      paidEmis: 0,
      status: "active",
      convenorName: "",
      description: "",
      notes: "",
    },
  });

  const openAdd = () => {
    setEditingLoan(null);
    form.reset({
      memberId: null,
      loanType: "personal",
      principalAmount: 0,
      disbursedDate: null,
      emiAmount: 0,
      emiCount: 0,
      paidEmis: 0,
      status: "active",
      convenorName: "",
      description: "",
      notes: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (loan: Loan) => {
    setEditingLoan(loan);
    form.reset({
      memberId: loan.memberId ?? null,
      loanType: loan.loanType as LoanType,
      principalAmount: loan.principalAmount,
      disbursedDate: loan.disbursedDate ?? null,
      emiAmount: loan.emiAmount,
      emiCount: loan.emiCount,
      paidEmis: loan.paidEmis,
      status: loan.status as LoanStatus,
      convenorName: loan.convenorName,
      description: loan.description,
      notes: loan.notes,
    });
    setDialogOpen(true);
  };

  const onSubmit = async (values: FormValues) => {
    const payload: LoanInput = {
      ...values,
      memberId: values.memberId || null,
      disbursedDate: values.disbursedDate || null,
    };
    try {
      if (editingLoan) {
        await updateLoan.mutateAsync(payload);
        toast({ title: "Loan updated" });
      } else {
        await createLoan.mutateAsync(payload);
        toast({ title: "Loan created" });
      }
      setDialogOpen(false);
    } catch {
      toast({ title: "Error saving loan", variant: "destructive" });
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

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 dark:bg-green-900/40">
            <Landmark className="h-5 w-5 text-green-700 dark:text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Loans</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Member loan records managed by convenors
            </p>
          </div>
        </div>
        <Button onClick={openAdd} className="bg-green-700 hover:bg-green-800 text-white gap-2">
          <Plus className="h-4 w-4" />
          New Loan
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard icon={<Landmark className="h-4 w-4 text-slate-500" />} label="Total" value={stats.total} />
          <StatCard icon={<Clock className="h-4 w-4 text-blue-500" />} label="Active" value={stats.active} highlight="blue" />
          <StatCard icon={<AlertTriangle className="h-4 w-4 text-red-500" />} label="Overdue" value={stats.overdue} highlight="red" />
          <StatCard icon={<CheckCircle2 className="h-4 w-4 text-green-500" />} label="Closed" value={stats.closed} highlight="green" />
          <StatCard
            icon={<TrendingDown className="h-4 w-4 text-violet-500" />}
            label="Total Principal"
            value={fmt(stats.totalPrincipal)}
            wide
          />
          <StatCard
            icon={<TrendingDown className="h-4 w-4 text-orange-500" />}
            label="Outstanding"
            value={fmt(stats.totalOutstanding)}
            highlight="orange"
            wide
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Search member, description…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={statusFilter || "all"} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v as LoanStatus); setPage(1); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter || "all"} onValueChange={(v) => { setTypeFilter(v === "all" ? "" : v as LoanType); setPage(1); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {LOAN_TYPES.map((t) => (
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
                  <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Type</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Principal</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">EMI</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-500 dark:text-slate-400">Paid / Total</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Outstanding</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Convenor</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Disbursed</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loans.map((loan) => {
                  const progressPct = loan.emiCount > 0 ? Math.round((loan.paidEmis / loan.emiCount) * 100) : 0;
                  return (
                    <tr key={loan.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {loan.memberName ?? <span className="text-slate-400 italic">Unknown</span>}
                        </div>
                        {loan.membershipId && (
                          <div className="text-xs text-slate-400">{loan.membershipId}</div>
                        )}
                        {loan.description && (
                          <div className="text-xs text-slate-500 truncate max-w-[160px]">{loan.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">{loanTypeBadge(loan.loanType as LoanType)}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300">{fmt(loan.principalAmount)}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300">{fmt(loan.emiAmount)}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            {loan.paidEmis}/{loan.emiCount}
                          </span>
                          {loan.emiCount > 0 && (
                            <div className="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
                              <div
                                className="h-1.5 rounded-full bg-green-500"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-mono font-semibold ${loan.outstandingBalance > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                          {fmt(loan.outstandingBalance)}
                        </span>
                      </td>
                      <td className="px-4 py-3">{statusBadge(loan.status as LoanStatus)}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">{loan.convenorName || "—"}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {loan.disbursedDate ? format(new Date(loan.disbursedDate), "dd MMM yyyy") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(loan)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => setDeleteId(loan.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
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

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLoan ? "Edit Loan" : "New Loan"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Member */}
              <FormField
                control={form.control}
                name="memberId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Member</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value ?? "none"}
                        onValueChange={(v) => field.onChange(v === "none" ? null : v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select member…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— No member —</SelectItem>
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
                {/* Loan Type */}
                <FormField
                  control={form.control}
                  name="loanType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Loan Type</FormLabel>
                      <FormControl>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LOAN_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* Status */}
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <FormControl>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input placeholder="Brief description of loan purpose…" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                {/* Principal */}
                <FormField
                  control={form.control}
                  name="principalAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Principal (₹)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* Disbursed Date */}
                <FormField
                  control={form.control}
                  name="disbursedDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Disbursed Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value || null)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                {/* EMI Amount */}
                <FormField
                  control={form.control}
                  name="emiAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>EMI (₹)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* EMI Count */}
                <FormField
                  control={form.control}
                  name="emiCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total EMIs</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* Paid EMIs */}
                <FormField
                  control={form.control}
                  name="paidEmis"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Paid EMIs</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Convenor */}
              <FormField
                control={form.control}
                name="convenorName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Convenor Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Ghani Ahmed Mulki" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Input placeholder="Additional notes…" {...field} />
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
              This action cannot be undone.
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
  highlight,
  wide,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  highlight?: "blue" | "red" | "green" | "orange";
  wide?: boolean;
}) {
  const textColor = {
    blue: "text-blue-600 dark:text-blue-400",
    red: "text-red-600 dark:text-red-400",
    green: "text-green-600 dark:text-green-400",
    orange: "text-orange-600 dark:text-orange-400",
  }[highlight ?? ""] ?? "text-slate-800 dark:text-slate-100";

  return (
    <div className={`rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 ${wide ? "col-span-2 sm:col-span-1" : ""}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      <div className={`text-xl font-bold ${textColor}`}>{value}</div>
    </div>
  );
}
