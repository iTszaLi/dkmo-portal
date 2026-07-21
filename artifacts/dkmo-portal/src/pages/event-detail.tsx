import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  useGetEvent,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
  getGetEventQueryKey,
  useListTasks,
  getListTasksQueryKey,
  useListEventSponsors,
  useCreateEventSponsor,
  useDeleteEventSponsor,
  useListEventExpenses,
  useCreateEventExpense,
  useDeleteEventExpense,
  useListEventBooklets,
  useCreateEventBooklet,
  useUpdateEventBooklet,
  useDeleteEventBooklet,
  useListBookletTickets,
  useUpdateEventTicket,
  useGetEventFinancialSummary,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Save, Trash2, ListChecks, Plus, Users, DollarSign,
  Ticket, BarChart3, X, ChevronDown, ChevronUp, Printer,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { generateEventReportPdf } from "@/lib/event-report-pdf";

// ── Constants ─────────────────────────────────────────────────────
const EVENT_STATUSES = ["upcoming", "ongoing", "completed", "cancelled"] as const;
type EventStatus = (typeof EVENT_STATUSES)[number];

const STATUS_STYLE: Record<EventStatus, string> = {
  upcoming:  "bg-blue-100 text-blue-800 ring-1 ring-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:ring-blue-700",
  ongoing:   "bg-green-100 text-green-800 ring-1 ring-green-300 dark:bg-green-900/40 dark:text-green-300 dark:ring-green-700",
  completed: "bg-slate-100 text-slate-700 ring-1 ring-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-500",
  cancelled: "bg-red-100 text-red-800 ring-1 ring-red-300 dark:bg-red-900/40 dark:text-red-300 dark:ring-red-700",
};

const PRIORITY_STYLE = {
  urgent: "bg-red-100 text-red-800 ring-1 ring-red-300 dark:bg-red-900/40 dark:text-red-300 dark:ring-red-700",
  high:   "bg-orange-100 text-orange-800 ring-1 ring-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:ring-orange-700",
  medium: "bg-blue-100 text-blue-800 ring-1 ring-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:ring-blue-700",
  low:    "bg-slate-100 text-slate-700 ring-1 ring-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-500",
};
const TASK_STATUS_STYLE = {
  pending:     "bg-orange-100 text-orange-800 ring-1 ring-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:ring-orange-700",
  in_progress: "bg-blue-100 text-blue-800 ring-1 ring-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:ring-blue-700",
  completed:   "bg-green-100 text-green-800 ring-1 ring-green-300 dark:bg-green-900/40 dark:text-green-300 dark:ring-green-700",
  cancelled:   "bg-slate-100 text-slate-600 ring-1 ring-slate-300 dark:bg-slate-700 dark:text-slate-400 dark:ring-slate-500",
};

const EXPENSE_CATEGORIES = [
  "Hall Rent", "Venue Charges", "Labour", "Catering / Food", "Gifts",
  "Microphones", "LED Screen", "Stage Setup", "Chairs & Tables", "Decorations",
  "Printing", "Transportation", "Marketing", "Security", "Miscellaneous",
];

const BOOKLET_STATUSES = ["available", "assigned", "sold", "completed"] as const;

function formatSAR(n: number) {
  return new Intl.NumberFormat("en-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 }).format(n);
}
function formatDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── Shared helpers ─────────────────────────────────────────────────
interface FormState {
  name: string; eventDate: string; location: string;
  budget: string; description: string; status: EventStatus;
}
const EMPTY: FormState = { name: "", eventDate: "", location: "", budget: "0", description: "", status: "upcoming" };

// ═══════════════════════════════════════════════════════════════════
// SPONSORS TAB
// ═══════════════════════════════════════════════════════════════════
function SponsorsTab({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const { data: sponsors = [], refetch, isLoading } = useListEventSponsors(eventId);
  const createMut = useCreateEventSponsor({ mutation: { onSuccess: () => { toast({ title: "Sponsor added" }); refetch(); }, onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }) } });
  const deleteMut = useDeleteEventSponsor({ mutation: { onSuccess: () => { toast({ title: "Sponsor removed" }); refetch(); }, onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }) } });

  const [form, setForm] = useState({ sponsorName: "", contactPerson: "", phone: "", email: "", amount: "", sponsorshipType: "cash" as "cash" | "in-kind", sponsorshipDate: "", notes: "" });
  const [open, setOpen] = useState(false);

  const totalAmount = sponsors.reduce((s, r) => s + r.amount, 0);

  const onAdd = () => {
    if (!form.sponsorName.trim()) return;
    createMut.mutate({ eventId, data: { ...form, amount: Number(form.amount) || 0 } });
    setForm({ sponsorName: "", contactPerson: "", phone: "", email: "", amount: "", sponsorshipType: "cash", sponsorshipDate: "", notes: "" });
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="rounded-xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-green-700/70 dark:text-slate-400">Total Sponsors</p>
            <p className="text-2xl font-bold text-green-950 dark:text-green-100">{sponsors.length}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-green-700/70 dark:text-slate-400">Total Contributions</p>
            <p className="text-2xl font-bold text-green-950 dark:text-green-100">{formatSAR(totalAmount)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
            <Users className="h-4 w-4" /> Sponsors ({sponsors.length})
          </CardTitle>
          {canEdit && (
            <Button size="sm" onClick={() => setOpen(true)} className="bg-green-700 hover:bg-green-800 text-white">
              <Plus className="h-4 w-4 mr-1" /> Add Sponsor
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-20 w-full" /> : sponsors.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No sponsors added yet.</p>
          ) : (
            <div className="divide-y divide-green-50 dark:divide-slate-800">
              {sponsors.map((s) => (
                <div key={s.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-green-950 dark:text-slate-100">{s.sponsorName}</p>
                      <Badge variant="outline" className={cn("text-xs capitalize", s.sponsorshipType === "cash" ? "border-green-300 text-green-700 dark:border-green-700 dark:text-green-300" : "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300")}>
                        {s.sponsorshipType}
                      </Badge>
                    </div>
                    {s.contactPerson && <p className="text-xs text-slate-500 mt-0.5">{s.contactPerson}{s.phone ? ` · ${s.phone}` : ""}</p>}
                    {s.notes && <p className="text-xs text-slate-400 mt-0.5 italic">{s.notes}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <p className="text-sm font-bold text-green-800 dark:text-green-300">{formatSAR(s.amount)}</p>
                    {canEdit && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                        onClick={() => deleteMut.mutate({ eventId, id: s.id })}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg dark:bg-slate-900 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-green-900 dark:text-green-100">Add Sponsor</DialogTitle>
            <DialogDescription>Link a sponsor to this event.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <Label>Sponsor Name *</Label>
              <Input value={form.sponsorName} onChange={(e) => setForm((f) => ({ ...f, sponsorName: e.target.value }))} placeholder="Company or individual name" />
            </div>
            <div>
              <Label>Contact Person</Label>
              <Input value={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))} placeholder="Name" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+966..." />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
            </div>
            <div>
              <Label>Amount (SAR)</Label>
              <Input type="number" min={0} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <Label>Sponsorship Type</Label>
              <Select value={form.sponsorshipType} onValueChange={(v) => setForm((f) => ({ ...f, sponsorshipType: v as "cash" | "in-kind" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="in-kind">In-Kind</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sponsorship Date</Label>
              <Input type="date" value={form.sponsorshipDate} onChange={(e) => setForm((f) => ({ ...f, sponsorshipDate: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Optional notes…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={onAdd} disabled={!form.sponsorName.trim() || createMut.isPending} className="bg-green-700 hover:bg-green-800 text-white">
              {createMut.isPending ? "Adding…" : "Add Sponsor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EXPENSES TAB
// ═══════════════════════════════════════════════════════════════════
function ExpensesTab({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const { data: expenses = [], refetch, isLoading } = useListEventExpenses(eventId);
  const createMut = useCreateEventExpense({ mutation: { onSuccess: () => { toast({ title: "Expense added" }); refetch(); }, onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }) } });
  const deleteMut = useDeleteEventExpense({ mutation: { onSuccess: () => { toast({ title: "Expense removed" }); refetch(); }, onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }) } });

  const [form, setForm] = useState({ category: "", description: "", vendor: "", amount: "", expenseDate: "", notes: "" });
  const [open, setOpen] = useState(false);

  const totalExpenses = expenses.reduce((s, r) => s + r.amount, 0);

  // Group by category
  const byCategory: Record<string, typeof expenses> = {};
  for (const e of expenses) {
    if (!byCategory[e.category]) byCategory[e.category] = [];
    byCategory[e.category].push(e);
  }
  const categoryTotals = Object.entries(byCategory).map(([cat, rows]) => ({
    cat,
    total: rows.reduce((s, r) => s + r.amount, 0),
    rows,
  })).sort((a, b) => b.total - a.total);

  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const toggleCat = (cat: string) => setExpandedCats((s) => { const n = new Set(s); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });

  const onAdd = () => {
    if (!form.category.trim()) return;
    createMut.mutate({ eventId, data: { ...form, amount: Number(form.amount) || 0 } });
    setForm({ category: "", description: "", vendor: "", amount: "", expenseDate: "", notes: "" });
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="rounded-xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-green-700/70 dark:text-slate-400">Total Expenses</p>
            <p className="text-2xl font-bold text-red-700 dark:text-red-400">{formatSAR(totalExpenses)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-green-700/70 dark:text-slate-400">Categories Used</p>
            <p className="text-2xl font-bold text-green-950 dark:text-green-100">{categoryTotals.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Expenses ({expenses.length})
          </CardTitle>
          {canEdit && (
            <Button size="sm" onClick={() => setOpen(true)} className="bg-green-700 hover:bg-green-800 text-white">
              <Plus className="h-4 w-4 mr-1" /> Add Expense
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-20 w-full" /> : categoryTotals.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No expenses recorded yet.</p>
          ) : (
            <div className="space-y-1">
              {categoryTotals.map(({ cat, total, rows }) => (
                <div key={cat} className="rounded-lg border border-green-50 dark:border-slate-800 overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-green-50/40 dark:hover:bg-slate-800/40 transition-colors"
                    onClick={() => toggleCat(cat)}
                  >
                    <div className="flex items-center gap-2">
                      {expandedCats.has(cat) ? <ChevronUp className="h-4 w-4 text-green-700 dark:text-green-400" /> : <ChevronDown className="h-4 w-4 text-green-700 dark:text-green-400" />}
                      <span className="text-sm font-semibold text-green-950 dark:text-slate-100">{cat}</span>
                      <Badge variant="outline" className="text-xs border-slate-200 text-slate-500">{rows.length}</Badge>
                    </div>
                    <span className="text-sm font-bold text-red-700 dark:text-red-400">{formatSAR(total)}</span>
                  </button>
                  {expandedCats.has(cat) && (
                    <div className="border-t border-green-50 dark:border-slate-800 divide-y divide-green-50 dark:divide-slate-800">
                      {rows.map((x) => (
                        <div key={x.id} className="flex items-start justify-between gap-3 px-4 py-2 bg-green-50/20 dark:bg-slate-800/20">
                          <div className="min-w-0">
                            {x.description && <p className="text-sm text-green-950 dark:text-slate-200">{x.description}</p>}
                            <p className="text-xs text-slate-500">{x.vendor ? `${x.vendor}` : ""}
                              {x.expenseDate ? ` · ${x.expenseDate}` : ""}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{formatSAR(x.amount)}</p>
                            {canEdit && (
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-600"
                                onClick={() => deleteMut.mutate({ eventId, id: x.id })}>
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg dark:bg-slate-900 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-green-900 dark:text-green-100">Add Expense</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <Label>Category *</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Brief description" />
            </div>
            <div>
              <Label>Vendor / Supplier</Label>
              <Input value={form.vendor} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))} placeholder="Vendor name" />
            </div>
            <div>
              <Label>Amount (SAR) *</Label>
              <Input type="number" min={0} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.expenseDate} onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))} />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={onAdd} disabled={!form.category || createMut.isPending} className="bg-green-700 hover:bg-green-800 text-white">
              {createMut.isPending ? "Adding…" : "Add Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TICKETS TAB
// ═══════════════════════════════════════════════════════════════════
function TicketGrid({ bookletId, eventId, canEdit }: { bookletId: string; eventId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const { data: tickets = [], refetch } = useListBookletTickets(eventId, bookletId);
  const updateMut = useUpdateEventTicket({ mutation: { onSuccess: () => refetch(), onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }) } });
  const [editTicket, setEditTicket] = useState<typeof tickets[number] | null>(null);
  const [buyerForm, setBuyerForm] = useState({ soldBy: "", buyerName: "", buyerPhone: "", saleDate: "" });

  const markSold = (t: typeof tickets[number]) => {
    if (t.isSold) {
      updateMut.mutate({ eventId, bookletId, ticketId: t.id, data: { isSold: false, soldBy: "", buyerName: "", buyerPhone: "", saleDate: "" } });
    } else {
      setEditTicket(t);
      setBuyerForm({ soldBy: "", buyerName: "", buyerPhone: "", saleDate: new Date().toISOString().slice(0, 10) });
    }
  };

  const confirmSold = () => {
    if (!editTicket) return;
    updateMut.mutate({ eventId, bookletId, ticketId: editTicket.id, data: { isSold: true, ...buyerForm } });
    setEditTicket(null);
  };

  const sold = tickets.filter((t) => t.isSold).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" /> Sold ({sold})</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-slate-200 dark:bg-slate-700 inline-block" /> Unsold ({tickets.length - sold})</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tickets.map((t) => (
          <button
            key={t.id}
            title={t.isSold ? `Sold${t.buyerName ? ` to ${t.buyerName}` : ""}` : `Ticket #${t.ticketNumber}`}
            disabled={!canEdit || updateMut.isPending}
            onClick={() => markSold(t)}
            className={cn(
              "w-10 h-10 rounded-md text-xs font-bold border transition-colors",
              t.isSold
                ? "bg-green-500 text-white border-green-600 hover:bg-green-600"
                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
            )}
          >
            {t.ticketNumber}
          </button>
        ))}
      </div>

      <Dialog open={!!editTicket} onOpenChange={() => setEditTicket(null)}>
        <DialogContent className="sm:max-w-sm dark:bg-slate-900 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle>Mark Ticket #{editTicket?.ticketNumber} as Sold</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Sold By</Label>
              <Input value={buyerForm.soldBy} onChange={(e) => setBuyerForm((f) => ({ ...f, soldBy: e.target.value }))} placeholder="Staff name" />
            </div>
            <div>
              <Label>Buyer Name (Optional)</Label>
              <Input value={buyerForm.buyerName} onChange={(e) => setBuyerForm((f) => ({ ...f, buyerName: e.target.value }))} placeholder="Buyer name" />
            </div>
            <div>
              <Label>Buyer Phone (Optional)</Label>
              <Input value={buyerForm.buyerPhone} onChange={(e) => setBuyerForm((f) => ({ ...f, buyerPhone: e.target.value }))} placeholder="+966..." />
            </div>
            <div>
              <Label>Sale Date</Label>
              <Input type="date" value={buyerForm.saleDate} onChange={(e) => setBuyerForm((f) => ({ ...f, saleDate: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTicket(null)}>Cancel</Button>
            <Button onClick={confirmSold} className="bg-green-700 hover:bg-green-800 text-white">Confirm Sale</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TicketsTab({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const { data: booklets = [], refetch, isLoading } = useListEventBooklets(eventId);
  const createMut = useCreateEventBooklet({ mutation: { onSuccess: () => { toast({ title: "Booklet created" }); refetch(); }, onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }) } });
  const updateMut = useUpdateEventBooklet({ mutation: { onSuccess: () => { toast({ title: "Booklet updated" }); refetch(); }, onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }) } });
  const deleteMut = useDeleteEventBooklet({ mutation: { onSuccess: () => { toast({ title: "Booklet deleted" }); refetch(); }, onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }) } });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ bookletNumber: "", ticketRangeStart: "1", ticketRangeEnd: "10", assignedTo: "", assignedDate: "", status: "available" as typeof BOOKLET_STATUSES[number], ticketAmount: "" });
  const [expandedBooklets, setExpandedBooklets] = useState<Set<string>>(new Set());
  const toggleBooklet = (id: string) => setExpandedBooklets((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const totalTickets = booklets.reduce((s, b) => s + (b.ticketRangeEnd - b.ticketRangeStart + 1), 0);

  const onAdd = () => {
    if (!form.bookletNumber.trim()) return;
    createMut.mutate({ eventId, data: { ...form, ticketRangeStart: Number(form.ticketRangeStart), ticketRangeEnd: Number(form.ticketRangeEnd), ticketAmount: Number(form.ticketAmount) || 0 } });
    setForm({ bookletNumber: "", ticketRangeStart: "1", ticketRangeEnd: "10", assignedTo: "", assignedDate: "", status: "available", ticketAmount: "" });
    setOpen(false);
  };

  const statusColor: Record<string, string> = {
    available: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
    assigned:  "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    sold:      "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    completed: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="rounded-xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-green-700/70 dark:text-slate-400">Total Booklets</p>
            <p className="text-2xl font-bold text-green-950 dark:text-green-100">{booklets.length}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-green-700/70 dark:text-slate-400">Total Tickets</p>
            <p className="text-2xl font-bold text-green-950 dark:text-green-100">{totalTickets}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
            <Ticket className="h-4 w-4" /> Ticket Booklets ({booklets.length})
          </CardTitle>
          {canEdit && (
            <Button size="sm" onClick={() => setOpen(true)} className="bg-green-700 hover:bg-green-800 text-white">
              <Plus className="h-4 w-4 mr-1" /> Add Booklet
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-20 w-full" /> : booklets.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No booklets created yet.</p>
          ) : (
            <div className="space-y-2">
              {booklets.map((b) => (
                <div key={b.id} className="rounded-xl border border-green-100 dark:border-slate-800 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-4 py-3">
                    <button className="flex items-center gap-2 flex-1 text-left" onClick={() => toggleBooklet(b.id)}>
                      {expandedBooklets.has(b.id) ? <ChevronUp className="h-4 w-4 text-green-600" /> : <ChevronDown className="h-4 w-4 text-green-600" />}
                      <div>
                        <p className="text-sm font-semibold text-green-950 dark:text-slate-100">Booklet #{b.bookletNumber}</p>
                        <p className="text-xs text-slate-500">Tickets {b.ticketRangeStart}–{b.ticketRangeEnd} · {b.ticketRangeEnd - b.ticketRangeStart + 1} tickets{b.assignedTo ? ` · ${b.assignedTo}` : ""}</p>
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      {canEdit && (
                        <Select value={b.status} onValueChange={(v) => updateMut.mutate({ eventId, id: b.id, data: { bookletNumber: b.bookletNumber, ticketRangeStart: b.ticketRangeStart, ticketRangeEnd: b.ticketRangeEnd, status: v as typeof BOOKLET_STATUSES[number] } })}>
                          <SelectTrigger className={cn("h-7 text-xs border-0 font-medium px-2", statusColor[b.status] ?? "")}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {BOOKLET_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      {!canEdit && <Badge className={cn("capitalize text-xs", statusColor[b.status] ?? "")}>{b.status}</Badge>}
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                          onClick={() => { if (confirm(`Delete booklet #${b.bookletNumber}?`)) deleteMut.mutate({ eventId, id: b.id }); }}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {expandedBooklets.has(b.id) && (
                    <div className="border-t border-green-50 dark:border-slate-800 px-4 py-3 bg-green-50/20 dark:bg-slate-800/20">
                      <TicketGrid bookletId={b.id} eventId={eventId} canEdit={canEdit} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md dark:bg-slate-900 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle>Create Ticket Booklet</DialogTitle>
            <DialogDescription>Each booklet typically contains 10 tickets.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <Label>Booklet Number *</Label>
              <Input value={form.bookletNumber} onChange={(e) => setForm((f) => ({ ...f, bookletNumber: e.target.value }))} placeholder="e.g. B001" />
            </div>
            <div>
              <Label>Ticket Range Start *</Label>
              <Input type="number" min={1} value={form.ticketRangeStart} onChange={(e) => setForm((f) => ({ ...f, ticketRangeStart: e.target.value }))} />
            </div>
            <div>
              <Label>Ticket Range End *</Label>
              <Input type="number" min={1} value={form.ticketRangeEnd} onChange={(e) => setForm((f) => ({ ...f, ticketRangeEnd: e.target.value }))} />
            </div>
            <div>
              <Label>Assigned To</Label>
              <Input value={form.assignedTo} onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))} placeholder="Staff name" />
            </div>
            <div>
              <Label>Assigned Date</Label>
              <Input type="date" value={form.assignedDate} onChange={(e) => setForm((f) => ({ ...f, assignedDate: e.target.value }))} />
            </div>
            <div>
              <Label>Ticket Amount (SAR)</Label>
              <Input type="number" min={0} value={form.ticketAmount} onChange={(e) => setForm((f) => ({ ...f, ticketAmount: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof BOOKLET_STATUSES[number] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BOOKLET_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={onAdd} disabled={!form.bookletNumber.trim() || createMut.isPending} className="bg-green-700 hover:bg-green-800 text-white">
              {createMut.isPending ? "Creating…" : "Create Booklet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FINANCIAL SUMMARY TAB
// ═══════════════════════════════════════════════════════════════════
function FinancialTab({ eventId, budget }: { eventId: string; budget: number }) {
  const { data: summary, isLoading } = useGetEventFinancialSummary(eventId);

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  if (!summary) return <p className="text-sm text-slate-500 text-center py-8">Could not load summary.</p>;

  const { sponsors, expenses, tickets, summary: s } = summary;
  const budgetUsed = budget > 0 ? Math.min((expenses.total / budget) * 100, 100) : 0;
  const netPositive = s.netBalance >= 0;

  const rows = [
    { label: "Sponsor Contributions", value: sponsors.total, color: "text-green-700 dark:text-green-400" },
    { label: "Ticket Revenue", value: tickets.revenue, color: "text-green-700 dark:text-green-400" },
    { label: "Total Income", value: s.totalIncome, color: "text-green-800 dark:text-green-300", bold: true },
    { label: "Total Expenses", value: s.totalExpenses, color: "text-red-700 dark:text-red-400", bold: true },
    { label: "Net Balance", value: s.netBalance, color: netPositive ? "text-green-800 dark:text-green-300 font-bold" : "text-red-700 dark:text-red-400 font-bold", bold: true, divider: true },
  ];

  return (
    <div className="space-y-4">
      {/* P&L Table */}
      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Financial Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-0.5">
            {rows.map((row, i) => (
              <div key={i}>
                {row.divider && <div className="border-t border-green-100 dark:border-slate-700 my-2" />}
                <div className="flex items-center justify-between py-1.5">
                  <span className={cn("text-sm", row.bold ? "font-semibold text-slate-700 dark:text-slate-200" : "text-slate-600 dark:text-slate-400")}>{row.label}</span>
                  <span className={cn("text-sm", row.color, row.bold ? "font-bold" : "")}>{formatSAR(row.value)}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Sponsors", value: String(sponsors.count), sub: formatSAR(sponsors.total) },
          { label: "Expenses", value: String(expenses.count), sub: formatSAR(expenses.total) },
          { label: "Tickets Sold", value: `${tickets.sold} / ${tickets.total}`, sub: `${tickets.unsold} unsold` },
          { label: "Ticket Revenue", value: formatSAR(tickets.revenue), sub: tickets.total > 0 ? `${Math.round((tickets.sold / tickets.total) * 100)}% sold` : "—" },
        ].map((card) => (
          <Card key={card.label} className="rounded-xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-green-700/70 dark:text-slate-400">{card.label}</p>
              <p className="text-xl font-bold text-green-950 dark:text-green-100">{card.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Budget progress */}
      {budget > 0 && (
        <Card className="rounded-xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-green-950 dark:text-slate-200">Budget Utilisation</p>
              <p className="text-sm text-slate-500">{formatSAR(expenses.total)} / {formatSAR(budget)}</p>
            </div>
            <div className="h-2.5 bg-green-50 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className={cn("h-full rounded-full transition-all", budgetUsed >= 100 ? "bg-red-500" : budgetUsed >= 80 ? "bg-amber-500" : "bg-green-500")}
                style={{ width: `${budgetUsed}%` }} />
            </div>
            <p className="text-xs text-slate-500 mt-1">{budgetUsed.toFixed(1)}% of budget used</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════
export default function EventDetail() {
  const [, params] = useRoute("/events/:id");
  const [, setLocation] = useLocation();
  const { canEdit, canDelete } = useAuth();
  const { toast } = useToast();

  const id = params?.id;
  const isNew = id === "new";

  const { data: event, isLoading, refetch } = useGetEvent(id ?? "", {
    query: { enabled: !!id && !isNew, queryKey: getGetEventQueryKey(id ?? "") },
  });

  const { data: tasksData } = useListTasks(
    { eventId: id ?? "", pageSize: 50 },
    { query: { enabled: !!id && !isNew, queryKey: getListTasksQueryKey({ eventId: id ?? "", pageSize: 50 }) } },
  );

  const { data: reportSponsors = [] } = useListEventSponsors(id ?? "");
  const { data: reportExpenses = [] } = useListEventExpenses(id ?? "");
  const { data: financialSummary } = useGetEventFinancialSummary(id ?? "");

  const [printing, setPrinting] = useState(false);

  const handlePrintReport = async () => {
    if (!event) return;
    setPrinting(true);
    try {
      await generateEventReportPdf({
        eventName: event.name,
        eventDate: event.eventDate,
        location: event.location,
        status: event.status,
        budget: event.budget,
        sponsors: reportSponsors.map((s) => ({
          sponsorName: s.sponsorName,
          contactPerson: s.contactPerson || undefined,
          amount: s.amount,
          sponsorshipType: s.sponsorshipType,
          notes: s.notes || undefined,
        })),
        expenses: reportExpenses.map((e) => ({
          category: e.category,
          description: e.description || undefined,
          vendor: e.vendor || undefined,
          amount: e.amount,
          expenseDate: e.expenseDate || undefined,
        })),
        ticketsSold: financialSummary?.tickets.sold ?? 0,
        ticketsTotal: financialSummary?.tickets.total ?? 0,
        ticketRevenue: financialSummary?.tickets.revenue ?? 0,
        totalIncome: financialSummary?.summary.totalIncome ?? 0,
        totalExpenses: financialSummary?.summary.totalExpenses ?? 0,
        netBalance: financialSummary?.summary.netBalance ?? 0,
      });
    } catch (err) {
      toast({ title: "Could not generate report", description: String(err), variant: "destructive" });
    } finally {
      setPrinting(false);
    }
  };

  const [form, setForm] = useState<FormState>(EMPTY);
  const [editing, setEditing] = useState(isNew);

  useEffect(() => {
    if (!isNew && event) {
      setForm({
        name: event.name,
        eventDate: event.eventDate ? event.eventDate.slice(0, 10) : "",
        location: event.location,
        budget: String(event.budget ?? 0),
        description: event.description,
        status: event.status as EventStatus,
      });
    }
  }, [event, isNew]);

  const createMutation = useCreateEvent({
    mutation: {
      onSuccess: (created) => { toast({ title: "Event created" }); setLocation(`/events/${created.id}`); },
      onError: (err) => toast({ title: "Could not create", description: String(err), variant: "destructive" }),
    },
  });
  const updateMutation = useUpdateEvent({
    mutation: {
      onSuccess: () => { toast({ title: "Saved" }); setEditing(false); refetch(); },
      onError: (err) => toast({ title: "Could not save", description: String(err), variant: "destructive" }),
    },
  });
  const deleteMutation = useDeleteEvent({
    mutation: {
      onSuccess: () => { toast({ title: "Event deleted" }); setLocation("/events"); },
      onError: (err) => toast({ title: "Could not delete", description: String(err), variant: "destructive" }),
    },
  });

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast({ title: "Event name is required", variant: "destructive" }); return; }
    const payload = {
      name: form.name.trim(),
      eventDate: form.eventDate ? new Date(form.eventDate + "T00:00:00.000Z").toISOString() : null,
      location: form.location.trim(),
      budget: Number(form.budget) || 0,
      description: form.description,
      status: form.status,
    };
    if (isNew) createMutation.mutate({ data: payload });
    else if (id) updateMutation.mutate({ id, data: payload });
  };

  const onDelete = () => {
    if (!event || !id) return;
    if (!confirm(`Delete event "${event.name}"?`)) return;
    deleteMutation.mutate({ id });
  };

  if (!isNew && isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isNew && !event && !isLoading) {
    return (
      <div className="text-center py-12 text-green-700/70 dark:text-slate-500">
        Event not found.{" "}
        <Link href="/events" className="text-green-800 dark:text-green-400 underline">Back</Link>
      </div>
    );
  }

  const tasks = tasksData?.items ?? [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/events">
            <Button variant="ghost" size="sm" className="text-green-800 dark:text-green-400 hover:bg-green-50 dark:hover:bg-slate-800">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-green-950 dark:text-green-100">
              {isNew ? "New Event" : event!.name}
            </h1>
            {!isNew && event && (
              <Badge className={cn("mt-1 capitalize", STATUS_STYLE[event.status as EventStatus])}>
                {event.status}
              </Badge>
            )}
          </div>
        </div>
        {!isNew && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrintReport}
              disabled={printing}
              className="border-green-300 dark:border-green-800 text-green-800 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-950/30"
            >
              <Printer className="h-4 w-4 mr-1.5" />
              {printing ? "Generating…" : "Print Report"}
            </Button>
            {canEdit && !editing && (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}
                  className="border-green-300 dark:border-green-800 text-green-800 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-950/30">
                  Edit
                </Button>
                {canDelete && (
                  <Button variant="outline" size="sm" onClick={onDelete}
                    className="border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                    disabled={deleteMutation.isPending}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* New event — just the form */}
      {isNew ? (
        <form onSubmit={onSubmit} className="space-y-6">
          <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <CardHeader><CardTitle className="text-base text-green-950 dark:text-green-100">Event Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>Event Name *</Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Annual Fundraising Gala" />
              </div>
              <div>
                <Label>Event Date</Label>
                <Input type="date" value={form.eventDate} onChange={(e) => set("eventDate", e.target.value)} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EVENT_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Location</Label>
                <Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Community Hall, Riyadh" />
              </div>
              <div>
                <Label>Budget (SAR)</Label>
                <Input type="number" min={0} value={form.budget} onChange={(e) => set("budget", e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="Event notes or agenda…" />
              </div>
            </CardContent>
          </Card>
          <div className="flex gap-3">
            <Button type="submit" className="bg-green-700 hover:bg-green-800 text-white" disabled={createMutation.isPending}>
              <Save className="h-4 w-4 mr-1" /> Create Event
            </Button>
          </div>
        </form>
      ) : (
        // Existing event — full tabbed layout
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="bg-green-50 dark:bg-slate-800 border border-green-100 dark:border-slate-700 p-1 rounded-xl flex-wrap h-auto gap-1">
            <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-green-900 dark:data-[state=active]:text-green-100 data-[state=active]:shadow-sm text-green-700 dark:text-slate-400">
              Overview
            </TabsTrigger>
            <TabsTrigger value="sponsors" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-green-900 dark:data-[state=active]:text-green-100 data-[state=active]:shadow-sm text-green-700 dark:text-slate-400">
              <Users className="h-3.5 w-3.5 mr-1" /> Sponsors
            </TabsTrigger>
            <TabsTrigger value="expenses" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-green-900 dark:data-[state=active]:text-green-100 data-[state=active]:shadow-sm text-green-700 dark:text-slate-400">
              <DollarSign className="h-3.5 w-3.5 mr-1" /> Expenses
            </TabsTrigger>
            <TabsTrigger value="tickets" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-green-900 dark:data-[state=active]:text-green-100 data-[state=active]:shadow-sm text-green-700 dark:text-slate-400">
              <Ticket className="h-3.5 w-3.5 mr-1" /> Tickets
            </TabsTrigger>
            <TabsTrigger value="financial" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-green-900 dark:data-[state=active]:text-green-100 data-[state=active]:shadow-sm text-green-700 dark:text-slate-400">
              <BarChart3 className="h-3.5 w-3.5 mr-1" /> Summary
            </TabsTrigger>
          </TabsList>

          {/* ── OVERVIEW TAB ─────────────────────────────── */}
          <TabsContent value="overview" className="space-y-5 mt-0">
            <form onSubmit={onSubmit}>
              <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                <CardHeader><CardTitle className="text-base text-green-950 dark:text-green-100">Event Details</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label>Event Name *</Label>
                    <Input value={form.name} onChange={(e) => set("name", e.target.value)} disabled={!editing} />
                  </div>
                  <div>
                    <Label>Event Date</Label>
                    <Input type="date" value={form.eventDate} onChange={(e) => set("eventDate", e.target.value)} disabled={!editing} />
                  </div>
                  <div>
                    <Label>Status</Label>
                    {editing ? (
                      <Select value={form.status} onValueChange={(v) => set("status", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{EVENT_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <div className="mt-1"><Badge className={cn("capitalize", STATUS_STYLE[form.status])}>{form.status}</Badge></div>
                    )}
                  </div>
                  <div>
                    <Label>Location</Label>
                    <Input value={form.location} onChange={(e) => set("location", e.target.value)} disabled={!editing} placeholder="Community Hall, Riyadh" />
                  </div>
                  <div>
                    <Label>Budget (SAR)</Label>
                    <Input type="number" min={0} value={form.budget} onChange={(e) => set("budget", e.target.value)} disabled={!editing} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Description / Notes</Label>
                    <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} disabled={!editing} rows={3} />
                  </div>
                </CardContent>
              </Card>
              {editing && (
                <div className="flex gap-3 mt-4">
                  <Button type="submit" className="bg-green-700 hover:bg-green-800 text-white" disabled={updateMutation.isPending}>
                    <Save className="h-4 w-4 mr-1" /> Save Changes
                  </Button>
                  <Button type="button" variant="outline" className="dark:border-slate-700" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              )}
            </form>

            {/* Tasks */}
            <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
                  <ListChecks className="h-4 w-4" /> Tasks ({tasks.length})
                </CardTitle>
                {canEdit && (
                  <Link href={`/tasks/new?eventId=${id}`}>
                    <Button size="sm" variant="outline" className="border-green-300 dark:border-green-800 text-green-800 dark:text-green-300">
                      <Plus className="h-4 w-4 mr-1" /> Add Task
                    </Button>
                  </Link>
                )}
              </CardHeader>
              <CardContent>
                {tasks.length === 0 ? (
                  <p className="text-sm text-green-700/70 dark:text-slate-500 text-center py-4">No tasks linked yet.</p>
                ) : (
                  <div className="divide-y divide-green-50 dark:divide-slate-800">
                    {tasks.map((t) => (
                      <Link key={t.id} href={`/tasks/${t.id}`} className="block py-3 hover:bg-green-50/40 dark:hover:bg-slate-800/40 -mx-2 px-2 rounded-lg transition-colors">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-green-950 dark:text-slate-100">{t.title}</p>
                          <div className="flex gap-2 shrink-0">
                            <Badge className={cn("capitalize", PRIORITY_STYLE[t.priority as keyof typeof PRIORITY_STYLE] ?? "")}>{t.priority}</Badge>
                            <Badge className={cn("capitalize", TASK_STATUS_STYLE[t.status as keyof typeof TASK_STATUS_STYLE] ?? "")}>{t.status.replace("_", " ")}</Badge>
                          </div>
                        </div>
                        {t.assignedTo && <p className="text-xs text-green-700/70 dark:text-slate-400 mt-0.5">Assigned to {t.assignedTo}</p>}
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── SPONSORS TAB ─────────────────────────────── */}
          <TabsContent value="sponsors" className="mt-0">
            <SponsorsTab eventId={id!} canEdit={canEdit} />
          </TabsContent>

          {/* ── EXPENSES TAB ─────────────────────────────── */}
          <TabsContent value="expenses" className="mt-0">
            <ExpensesTab eventId={id!} canEdit={canEdit} />
          </TabsContent>

          {/* ── TICKETS TAB ──────────────────────────────── */}
          <TabsContent value="tickets" className="mt-0">
            <TicketsTab eventId={id!} canEdit={canEdit} />
          </TabsContent>

          {/* ── FINANCIAL SUMMARY TAB ────────────────────── */}
          <TabsContent value="financial" className="mt-0">
            <FinancialTab eventId={id!} budget={Number(form.budget) || 0} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
