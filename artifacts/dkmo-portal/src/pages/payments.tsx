import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import {
  useListMembers,
  useUpdateMemberFeeStatus,
  getListMembersQueryKey,
  getGetPendingMembersQueryKey,
} from "@workspace/api-client-react";
import type { FeeStatusInputFeeStatus, Member } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, UserCircle, MoreHorizontal, Search, Wallet, CheckCircle2, XCircle, MinusCircle, HeartHandshake, Send, MessageSquareWarning, Phone, MapPin } from "lucide-react";
import { formatSAR, formatDate, feeStatusLabel, feeStatusBadgeClass } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RefMemberCell, useMemberIndex } from "@/components/RefMemberCell";
import FrfFeesPanel from "@/components/payments/FrfFeesPanel";
import { cn } from "@/lib/utils";
import { normalizeWhatsAppNumber, buildWhatsAppLink, type WhatsAppTarget } from "@/lib/whatsapp";
import { WhatsAppBulkDialog } from "@/components/WhatsAppBulkDialog";

type PaymentTab = "membership" | "frf";
type StatusView = "all" | "paid" | "unpaid";

const STATUS_VIEWS: { value: StatusView; label: string }[] = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "unpaid", label: "Unpaid" },
];

function isDue(m: Member): boolean {
  return m.feeStatus !== "paid" && m.feeStatus !== "exempt";
}

function buildReminderMessage(m: Member): string {
  return `Assalamu Alaikum ${m.fullName},\n\nThis is a gentle reminder from DKMO (Dakshina Karnataka Muslim Ookota — Committed to the Community). Your one-time membership registration fee of ${formatSAR(m.membershipFee)} is currently ${feeStatusLabel(m.feeStatus).toLowerCase()}.\n\nPlease complete the payment at your earliest convenience to activate your membership.\n\nJazakallah Khair.`;
}

function toWhatsAppTargets(members: Member[]): WhatsAppTarget[] {
  return members.flatMap((m) => {
    const number = normalizeWhatsAppNumber(m.mobileNumber);
    return number ? [{ id: m.id, name: m.fullName, number, message: buildReminderMessage(m) }] : [];
  });
}

export default function Payments() {
  // Deep-link support: /payments?tab=frf&frfStatus=pending — stays in sync if the query string changes.
  const searchString = useSearch();
  const params = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const urlTab: PaymentTab = params.get("tab") === "frf" ? "frf" : "membership";
  const initialFrfStatus = params.get("frfStatus");
  const [tab, setTab] = useState<PaymentTab>(urlTab);
  useEffect(() => setTab(urlTab), [urlTab]);
  const [view, setView] = useState<StatusView>("all");
  const memberIndex = useMemberIndex();
  const [textSearch, setTextSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTargets, setBulkTargets] = useState<WhatsAppTarget[]>([]);

  const { data: members, isLoading } = useListMembers({ search: textSearch.length > 2 ? textSearch : undefined });
  const updateFeeStatus = useUpdateMemberFeeStatus();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const all = members ?? [];
  const filtered = useMemo(() => {
    switch (view) {
      case "paid":
        return all.filter((m) => m.feeStatus === "paid");
      case "unpaid":
        // Everything still due — includes pending, partial and unpaid statuses.
        return all.filter(isDue);
      default:
        return all;
    }
  }, [all, view]);

  const reminderView = view === "unpaid";

  // KPI figures
  const totalCollected = all.filter((m) => m.feeStatus === "paid").reduce((acc, m) => acc + m.membershipFee, 0);
  const totalOutstanding = all.filter(isDue).reduce((acc, m) => acc + m.membershipFee, 0);
  const viewAmount = filtered.reduce((acc, m) => acc + m.membershipFee, 0);

  const kpis: { label: string; value: string; tone?: "green" | "red" }[] = useMemo(() => {
    switch (view) {
      case "paid":
        return [
          { label: "Paid Members", value: String(filtered.length) },
          { label: "Total Collected", value: formatSAR(viewAmount), tone: "green" },
        ];
      case "unpaid":
        return [
          { label: "Unpaid Members", value: String(filtered.length) },
          { label: "Outstanding Amount", value: formatSAR(viewAmount), tone: "red" },
        ];
      default:
        return [
          { label: "Total Members", value: String(all.length) },
          { label: "Fees Collected", value: formatSAR(totalCollected), tone: "green" },
          { label: "Outstanding Fees", value: formatSAR(totalOutstanding), tone: "red" },
        ];
    }
  }, [view, filtered.length, viewAmount, all.length, totalCollected, totalOutstanding]);

  // Selection (reminder views only)
  const allIds = useMemo(() => filtered.map((m) => m.id), [filtered]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someSelected = !allSelected && allIds.some((id) => selectedIds.has(id));
  const selectedCount = allIds.filter((id) => selectedIds.has(id)).length;

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allIds));
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const switchView = (v: StatusView) => {
    setView(v);
    setSelectedIds(new Set());
  };

  const startBulk = (list: Member[]) => {
    const targets = toWhatsAppTargets(list);
    if (targets.length === 0) {
      toast({ title: "No valid mobile numbers", description: "None of these members have a WhatsApp-capable number.", variant: "destructive" });
      return;
    }
    setBulkTargets(targets);
    setBulkOpen(true);
  };

  const handleWhatsAppReminder = (m: Member) => {
    const number = normalizeWhatsAppNumber(m.mobileNumber);
    if (!number) {
      toast({ title: "Cannot send reminder", description: "Member has no valid mobile number", variant: "destructive" });
      return;
    }
    window.open(buildWhatsAppLink(number, buildReminderMessage(m)), "_blank", "noopener");
  };

  const handleFeeStatus = (id: string, feeStatus: FeeStatusInputFeeStatus) => {
    updateFeeStatus.mutate({ id, data: { feeStatus } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPendingMembersQueryKey() });
        toast({ title: "Fee status updated" });
      },
      onError: (err: any) => {
        toast({ title: "Failed to update fee status", description: err.message, variant: "destructive" });
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-950 dark:text-emerald-100">
            {tab === "membership" ? "Membership Fees" : "FRF Fees"}
          </h1>
          <p className="text-emerald-700/80 dark:text-slate-400">
            {tab === "membership"
              ? "Track the one-time SAR 100 registration fee for each member"
              : "Track SAR 50 FRF fees per member for each FRF case"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Payment type switcher */}
          <div
            className="inline-flex rounded-xl border border-emerald-200 dark:border-slate-700 bg-emerald-50/60 dark:bg-slate-800/60 p-1"
            role="group"
            aria-label="Payment type"
          >
            {([["membership", "Membership Fees"], ["frf", "FRF Fees"]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={tab === value}
                onClick={() => { setTab(value); setSelectedIds(new Set()); }}
                data-testid={`tab-payments-${value}`}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors",
                  tab === value
                    ? "bg-emerald-700 text-white shadow-sm dark:bg-emerald-600"
                    : "text-emerald-800 dark:text-slate-300 hover:bg-emerald-100/70 dark:hover:bg-slate-700/60",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "membership" && reminderView && selectedCount > 0 && (
            <Button
              onClick={() => startBulk(filtered.filter((m) => selectedIds.has(m.id)))}
              disabled={bulkOpen}
              variant="outline"
              className="border-[#25D366] text-[#25D366] hover:bg-[#25D366]/10"
              data-testid="button-remind-selected"
            >
              <Send className="mr-2 h-4 w-4" />
              {`Remind Selected (${selectedCount})`}
            </Button>
          )}
          {tab === "membership" && reminderView && (
            <Button
              onClick={() => startBulk(filtered)}
              disabled={bulkOpen || filtered.length === 0}
              className="bg-[#25D366] hover:bg-[#128C7E] text-white"
              data-testid="button-remind-all"
            >
              <Send className="mr-2 h-4 w-4" />
              {`Remind All (${filtered.length})`}
            </Button>
          )}
          <Link href="/members">
            <Button className="bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white">
              <Plus className="mr-2 h-4 w-4" /> Add Member
            </Button>
          </Link>
        </div>
      </div>

      <WhatsAppBulkDialog
        open={bulkOpen}
        onOpenChange={(o) => { setBulkOpen(o); if (!o) setSelectedIds(new Set()); }}
        targets={bulkTargets}
        title="Membership Fee Reminders"
      />

      {tab === "frf" ? (
        <FrfFeesPanel key={initialFrfStatus ?? "default"} initialFeeFilter={initialFrfStatus === "pending" ? "pending" : undefined} />
      ) : (
      <>
      {/* Membership fee banner */}
      <div className="flex items-start gap-3 rounded-xl border border-emerald-100 dark:border-slate-800 bg-emerald-50/50 dark:bg-slate-900 p-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 shrink-0">
          <HeartHandshake className="h-5 w-5" />
        </div>
        <div className="text-sm">
          <p className="font-semibold text-emerald-900 dark:text-slate-200">One-time membership fee — SAR 100 per member</p>
          <p className="text-emerald-700/80 dark:text-slate-400">
            Family Relief Fund (FRF) fees are tracked separately — switch to the FRF Fees tab above.
          </p>
        </div>
      </div>

      {/* Status view switcher */}
      <div
        className="inline-flex flex-wrap rounded-xl border border-emerald-200 dark:border-slate-700 bg-emerald-50/60 dark:bg-slate-800/60 p-1"
        role="group"
        aria-label="Fee status view"
      >
        {STATUS_VIEWS.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={view === s.value}
            onClick={() => switchView(s.value)}
            data-testid={`tab-payments-status-${s.value}`}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors",
              view === s.value
                ? "bg-emerald-700 text-white shadow-sm dark:bg-emerald-600"
                : "text-emerald-800 dark:text-slate-300 hover:bg-emerald-100/70 dark:hover:bg-slate-700/60",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Summary cards — change with the selected status view */}
      <div className={cn("grid gap-4", kpis.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {kpis.map((k) => (
          <div
            key={k.label}
            className={cn(
              "rounded-2xl border p-4 shadow-sm bg-white dark:bg-slate-900",
              k.tone === "red"
                ? "border-red-100 dark:border-red-900/40"
                : "border-emerald-100 dark:border-slate-800",
            )}
          >
            <p className="text-sm font-medium text-emerald-700 dark:text-slate-400">{k.label}</p>
            {isLoading ? <Skeleton className="h-8 w-24 mt-1" /> : (
              <p className={cn(
                "text-2xl font-bold mt-1",
                k.tone === "red"
                  ? "text-red-600 dark:text-red-400"
                  : k.tone === "green"
                    ? "text-emerald-700 dark:text-green-400"
                    : "text-emerald-950 dark:text-white",
              )}>
                {k.value}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-emerald-100 dark:border-slate-800 shadow-sm">
        <div className="space-y-1 sm:max-w-sm">
          <label className="text-xs font-medium text-emerald-700 dark:text-slate-400">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-400 dark:text-slate-500" />
            <Input
              placeholder="Name, member ID, city…"
              value={textSearch}
              onChange={(e) => setTextSearch(e.target.value)}
              className="pl-9 h-10 border-emerald-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-emerald-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-emerald-50/50 dark:bg-slate-800/60">
            <TableRow className="dark:border-slate-700">
              {reminderView && (
                <TableHead className="w-12">
                  <Checkbox
                    checked={allSelected}
                    data-state={someSelected ? "indeterminate" : undefined}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                    className="border-emerald-300 dark:border-slate-600"
                    disabled={isLoading || filtered.length === 0}
                  />
                </TableHead>
              )}
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Member</TableHead>
              {reminderView && <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Contact</TableHead>}
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Reference Member</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Fee</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Status</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Paid On</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="dark:border-slate-800">
                  {reminderView && <TableCell><Skeleton className="h-4 w-4" /></TableCell>}
                  <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                  {reminderView && <TableCell><Skeleton className="h-5 w-32" /></TableCell>}
                  <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={reminderView ? 8 : 6} className="h-32 text-center text-emerald-600 dark:text-slate-500">
                  <div className="flex flex-col items-center justify-center">
                    {reminderView ? (
                      <>
                        <div className="h-12 w-12 rounded-full bg-emerald-50 dark:bg-slate-800 flex items-center justify-center mb-3">
                          <CheckCircle2 className="h-6 w-6 text-emerald-300 dark:text-slate-600" />
                        </div>
                        <p className="font-medium text-emerald-900 dark:text-slate-300">All caught up!</p>
                        <p className="text-sm dark:text-slate-500">No members in this view.</p>
                      </>
                    ) : (
                      <>
                        <Wallet className="h-8 w-8 text-emerald-200 dark:text-slate-700 mb-2" />
                        <p>No members found for the selected filters.</p>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((member) => {
                const isSelected = reminderView && selectedIds.has(member.id);
                return (
                <TableRow
                  key={member.id}
                  className={cn(
                    "hover:bg-emerald-50/30 dark:hover:bg-slate-800/50 dark:border-slate-800 transition-colors",
                    reminderView && "cursor-pointer",
                    isSelected && "bg-[#25D366]/5 dark:bg-[#25D366]/10 hover:bg-[#25D366]/10 dark:hover:bg-[#25D366]/15",
                  )}
                  onClick={reminderView ? () => toggleOne(member.id) : undefined}
                >
                  {reminderView && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleOne(member.id)}
                        aria-label={`Select ${member.fullName}`}
                        className="border-emerald-300 dark:border-slate-600"
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <Link href={`/members/${member.id}`} className="flex items-center gap-3 group" onClick={(e) => e.stopPropagation()}>
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-900/60 transition-colors shrink-0">
                        <UserCircle className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-medium text-emerald-950 dark:text-slate-200 group-hover:text-emerald-700 dark:group-hover:text-green-300 transition-colors">{member.fullName}</div>
                        <div className="text-xs text-emerald-600 dark:text-slate-500">ID: {member.membershipId}</div>
                      </div>
                    </Link>
                  </TableCell>
                  {reminderView && (
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center text-xs text-emerald-800 dark:text-slate-300">
                          <Phone className="mr-1.5 h-3.5 w-3.5 text-emerald-500 dark:text-slate-500 shrink-0" />
                          {member.mobileNumber}
                        </div>
                        <div className="flex items-center text-xs text-emerald-800 dark:text-slate-400">
                          <MapPin className="mr-1.5 h-3.5 w-3.5 text-emerald-500 dark:text-slate-500 shrink-0" />
                          {member.city}
                        </div>
                      </div>
                    </TableCell>
                  )}
                  <TableCell>
                    <RefMemberCell refId={member.refMemberId} refName={member.refMemberName} index={memberIndex} />
                  </TableCell>
                  <TableCell className="text-right font-bold text-emerald-900 dark:text-green-300">
                    {formatSAR(member.membershipFee)}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${feeStatusBadgeClass(member.feeStatus === "paid" || member.feeStatus === "exempt" ? member.feeStatus : "unpaid")}`}>
                      {member.feeStatus === "paid" ? <CheckCircle2 className="h-3 w-3" /> : member.feeStatus === "exempt" ? <MinusCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {member.feeStatus === "paid" || member.feeStatus === "exempt" ? feeStatusLabel(member.feeStatus) : "Unpaid"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-emerald-700 dark:text-slate-400">
                    {member.feePaidAt ? formatDate(member.feePaidAt) : "—"}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      {reminderView && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updateFeeStatus.isPending}
                            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-slate-600 dark:text-emerald-400 dark:hover:bg-slate-800"
                            onClick={() => handleFeeStatus(member.id, "paid")}
                            data-testid={`button-mark-paid-${member.membershipId}`}
                          >
                            <CheckCircle2 className="mr-1.5 h-4 w-4" />
                            Mark Paid
                          </Button>
                          <Button
                            size="sm"
                            className="bg-[#25D366] hover:bg-[#128C7E] text-white"
                            onClick={() => handleWhatsAppReminder(member)}
                            data-testid={`button-remind-${member.membershipId}`}
                          >
                            <MessageSquareWarning className="mr-1.5 h-4 w-4" />
                            Remind
                          </Button>
                        </>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="dark:bg-slate-900 dark:border-slate-800">
                          {member.feeStatus !== "paid" && (
                            <DropdownMenuItem onClick={() => handleFeeStatus(member.id, "paid")} className="text-emerald-700 dark:text-emerald-400 dark:focus:bg-slate-800">
                              <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Fee Paid
                            </DropdownMenuItem>
                          )}
                          {member.feeStatus !== "exempt" && (
                            <DropdownMenuItem onClick={() => handleFeeStatus(member.id, "exempt")} className="text-slate-600 dark:text-slate-400 dark:focus:bg-slate-800">
                              <MinusCircle className="mr-2 h-4 w-4" /> Mark Fee Exempt
                            </DropdownMenuItem>
                          )}
                          {member.feeStatus !== "unpaid" && (
                            <DropdownMenuItem onClick={() => handleFeeStatus(member.id, "unpaid")} className="dark:text-slate-300 dark:focus:bg-slate-800">
                              <XCircle className="mr-2 h-4 w-4" /> Mark Fee Unpaid
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      </>
      )}
    </div>
  );
}
