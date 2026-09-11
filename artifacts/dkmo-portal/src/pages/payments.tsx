import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import {
  useListMembers,
  useListPayments,
  useUpdateMember,
  useUpdateMemberFeeStatus,
  useCreatePayment,
  customFetch,
  getListMembersQueryKey,
  getListPaymentsQueryKey,
  getGetPendingMembersQueryKey,
} from "@workspace/api-client-react";
import type { FeeStatusInputFeeStatus, Member } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, UserCircle, MoreHorizontal, Search, Wallet, CheckCircle2, XCircle, MinusCircle, HeartHandshake, Send, MessageSquareWarning, Phone, MapPin, Clock, Pencil } from "lucide-react";
import { formatSAR, formatDate, feeStatusLabel, feeStatusBadgeClass } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RefMemberCell, useMemberIndex } from "@/components/RefMemberCell";
import FrfFeesPanel from "@/components/payments/FrfFeesPanel";
import { cn } from "@/lib/utils";
import { withReturnTo } from "@/lib/navigation";
import { normalizeWhatsAppNumber, type WhatsAppTarget } from "@/lib/whatsapp";
import { WhatsAppBulkDialog } from "@/components/WhatsAppBulkDialog";
import { WhatsAppReminderDialog, type WhatsAppReminderLanguage } from "@/components/WhatsAppReminderDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { getMembershipFeeAmount } from "@/lib/membership-fee";

type PaymentTab = "membership" | "frf";
type StatusView = "all" | "paid" | "unpaid" | "overdue";

const STATUS_VIEWS: { value: StatusView; label: string }[] = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "unpaid", label: "Unpaid" },
  { value: "overdue", label: "Overdue" },
];

const EDITABLE_FEE_STATUSES: FeeStatusInputFeeStatus[] = [
  "paid",
  "partial",
  "pending",
  "unpaid",
  "exempt",
  "review",
  "not_applicable",
];

function dateInputValue(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function isDue(m: Member): boolean {
  return !["paid", "exempt", "not_applicable", "review"].includes(m.feeStatus);
}

/** A fee is overdue when it is still due 30+ days after the member was registered. */
const OVERDUE_AFTER_DAYS = 30;

function isOverdue(m: Member): boolean {
  if (!isDue(m)) return false;
  const created = new Date(m.createdAt).getTime();
  return Date.now() - created > OVERDUE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

function hasWhatsAppNumber(m: Member): boolean {
  return Boolean(normalizeWhatsAppNumber(m.mobileNumber));
}

function buildReminderMessage(m: Member, language: WhatsAppReminderLanguage = "en"): string {
  const fee = formatSAR(getMembershipFeeAmount(m.membershipFee));
  if (language === "kn") {
    return `ಅಸ್ಸಲಾಮು ಅಲೈಕುಮ್ ${m.fullName},

DKMO (ದಕ್ಷಿಣ ಕರ್ನಾಟಕ ಮುಸ್ಲಿಂ ಒಕ್ಕೂಟ — ಸಮುದಾಯದ ಬದ್ಧತೆ) ವತಿಯಿಂದ ಒಂದು ಸೌಮ್ಯ ನೆನಪಿನ ಸಂದೇಶ.

ನಿಮ್ಮ ಒಂದು ಬಾರಿ ಪಾವತಿಸಬೇಕಾದ ಸದಸ್ಯತ್ವ ನೋಂದಣಿ ಶುಲ್ಕ ${fee} ಆಗಿದೆ. ಪ್ರಸ್ತುತ ಸ್ಥಿತಿ: ${feeStatusLabel(m.feeStatus).toLowerCase()}.
DKMO ID: ${m.membershipId}

ನಿಮ್ಮ ಸದಸ್ಯತ್ವವನ್ನು ಸಕ್ರಿಯಗೊಳಿಸಲು ಸಾಧ್ಯವಾದಷ್ಟು ಬೇಗ ಪಾವತಿಸಲು ವಿನಂತಿ.

ಜಝಾಕಲ್ಲಾಹು ಖೈರ್.`;
  }

  return `Assalamu Alaikum ${m.fullName},

This is a gentle reminder from DKMO (Dakshina Karnataka Muslim Ookota — Committed to the Community). Your one-time membership registration fee of ${fee} is currently ${feeStatusLabel(m.feeStatus).toLowerCase()}.
DKMO ID: ${m.membershipId}

Please complete the payment at your earliest convenience to activate your membership.

Jazakallah Khair.`;
}

function toWhatsAppTargets(members: Member[]): WhatsAppTarget[] {
  return members.flatMap((m) => {
    const number = normalizeWhatsAppNumber(m.mobileNumber);
    return number ? [{ id: m.id, name: m.fullName, number, message: buildReminderMessage(m, "en") }] : [];
  });
}

export default function Payments() {
  // Deep-link support: /payments?tab=frf&frfStatus=pending — stays in sync if the query string changes.
  const searchString = useSearch();
  const params = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const urlTab: PaymentTab = params.get("tab") === "frf" ? "frf" : "membership";
  const initialFrfStatus = params.get("frfStatus");
  const initialFrfCaseId = params.get("frfCaseId") ?? undefined;
  const [tab, setTab] = useState<PaymentTab>(urlTab);
  useEffect(() => setTab(urlTab), [urlTab]);
  // Deep-link: /payments?view=unpaid (membership tab status view)
  const rawView = params.get("view");
  const urlView: StatusView = rawView === "paid" || rawView === "unpaid" || rawView === "overdue" ? rawView : "all";
  const [view, setView] = useState<StatusView>(urlView);
  useEffect(() => setView(urlView), [urlView]);
  const memberIndex = useMemberIndex();
  const [textSearch, setTextSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTargets, setBulkTargets] = useState<WhatsAppTarget[]>([]);
  const [reminderMember, setReminderMember] = useState<Member | null>(null);

  const { data: members, isLoading } = useListMembers({ search: textSearch.length > 2 ? textSearch : undefined });
  const { data: membershipPayments } = useListPayments({ paymentType: "membership_fee" });
  const updateFeeStatus = useUpdateMemberFeeStatus();
  const updateMember = useUpdateMember();
  const createPayment = useCreatePayment();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const all = members ?? [];
  const referenceMemberOptions = useMemo(() => {
    const options = new Map<string, { id: string; fullName: string; membershipId: string }>();
    for (const reference of memberIndex.values()) options.set(reference.id, reference);
    for (const member of all) {
      options.set(member.id, { id: member.id, fullName: member.fullName, membershipId: member.membershipId });
    }
    return [...options.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [memberIndex, all]);
  const latestMembershipPaymentByMember = useMemo(() => {
    const map = new Map<string, any>();
    for (const payment of membershipPayments ?? []) {
      if (payment.status === "cancelled" || payment.status === "refunded") continue;
      const current = map.get(payment.memberId);
      if (!current || new Date(payment.paidAt ?? 0).getTime() > new Date(current.paidAt ?? 0).getTime()) {
        map.set(payment.memberId, payment);
      }
    }
    return map;
  }, [membershipPayments]);

  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editReferenceMemberId, setEditReferenceMemberId] = useState("");
  const [editFeeStatus, setEditFeeStatus] = useState<FeeStatusInputFeeStatus>("unpaid");
  const [editPaidOn, setEditPaidOn] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const openPaymentEdit = (member: Member) => {
    const latestPayment = latestMembershipPaymentByMember.get(member.id);
    setEditingMember(member);
    setEditReferenceMemberId(member.refMemberId || "");
    setEditFeeStatus(member.feeStatus);
    setEditPaidOn(dateInputValue(latestPayment?.paidAt ?? member.feePaidAt));
  };

  const savePaymentEdit = async () => {
    if (!editingMember) return;
    const member = editingMember;
    const latestPayment = latestMembershipPaymentByMember.get(member.id);
    const selectedReference = referenceMemberOptions.find((candidate) => candidate.id === editReferenceMemberId);
    const financialEditAllowed = !member.legacyMemberId;
    const nextFeeStatus =
      editFeeStatus === "paid"
        ? "paid"
        : financialEditAllowed
          ? editFeeStatus
          : member.feeStatus;
    const paidAt = editPaidOn ? new Date(`${editPaidOn}T12:00:00Z`).toISOString() : undefined;

    setIsSavingEdit(true);
    try {
      if (nextFeeStatus === "paid") {
        const membershipFeeAmount = getMembershipFeeAmount(member.membershipFee);
        if (latestPayment) {
          await customFetch(`/api/payments/${latestPayment.id}`, {
            method: "PUT",
            body: JSON.stringify({
              amountDue: membershipFeeAmount,
              amountPaid: membershipFeeAmount,
              status: "paid",
              paidAt: paidAt ?? latestPayment.paidAt,
            }),
          });
        } else {
          await createPayment.mutateAsync({
            data: {
              memberId: member.id,
              paymentType: "membership_fee",
              amountDue: membershipFeeAmount,
              amountPaid: membershipFeeAmount,
              status: "paid",
              paymentMethod: "cash",
              receiptNumber: `DKMO-MEM-${Date.now().toString().slice(-8)}`,
              paidAt,
              notes: "Membership fee recorded from the Payments editor",
            },
          });
        }
      } else if (latestPayment && paidAt && paidAt !== latestPayment.paidAt) {
        await customFetch(`/api/payments/${latestPayment.id}`, {
          method: "PUT",
          body: JSON.stringify({ paidAt }),
        });
      }

      await updateMember.mutateAsync({
        id: member.id,
        data: {
          fullName: member.fullName,
          mobileNumber: member.mobileNumber,
          membershipId: member.membershipId,
          iqamaNumber: member.iqamaNumber ?? "",
          jamaath: member.jamaath ?? "",
          city: member.city ?? "",
          country: member.country ?? "",
          dateOfBirth: member.dateOfBirth ?? "",
          designation: member.designation ?? "",
          isExecutiveCommittee: member.isExecutiveCommittee,
          isCoreCommittee: member.isCoreCommittee,
          membershipFee: member.membershipFee,
          feeStatus: nextFeeStatus,
          responsibility: member.responsibility,
          notes: member.notes ?? "",
          refMemberId: editReferenceMemberId,
          refMemberName: selectedReference?.fullName ?? "",
        },
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetPendingMembersQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey({ paymentType: "membership_fee" }) }),
      ]);
      setEditingMember(null);
      toast({ title: "Membership payment record updated" });
    } catch (err: any) {
      toast({
        title: "Could not update membership payment",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    } finally {
      setIsSavingEdit(false);
    }
  };
  const filtered = useMemo(() => {
    switch (view) {
      case "paid":
        return all.filter((m) => m.feeStatus === "paid");
      case "unpaid":
        // Everything still due — includes pending, partial and unpaid statuses.
        return all.filter(isDue);
      case "overdue":
        return all.filter(isOverdue);
      default:
        return all;
    }
  }, [all, view]);

  const reminderView = view === "unpaid";

  // KPI figures — four fixed cards: Paid, Unpaid (before due), Overdue, Amount Due.
  const kpis = useMemo(() => {
    const paidCount = all.filter((m) => m.feeStatus === "paid").length;
    const overdueMembers = all.filter(isOverdue);
    const unpaidCount = all.filter((m) => isDue(m) && !isOverdue(m)).length;
    const amountDue = all.filter(isDue).reduce((acc, m) => acc + getMembershipFeeAmount(m.membershipFee), 0);
    return [
      { label: "Paid", value: String(paidCount), sub: "Members who have paid", tone: "green" as const, target: "paid" as StatusView },
      { label: "Unpaid", value: String(unpaidCount), sub: `Not yet paid (within ${OVERDUE_AFTER_DAYS} days of joining)`, tone: "neutral" as const, target: "unpaid" as StatusView },
      { label: "Overdue", value: String(overdueMembers.length), sub: `Still unpaid ${OVERDUE_AFTER_DAYS}+ days after joining`, tone: "red" as const, target: "overdue" as StatusView },
      { label: "Amount Due", value: formatSAR(amountDue), sub: "Total yet to be collected", tone: "amber" as const, target: "unpaid" as StatusView },
    ];
  }, [all]);

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
      toast({ title: "Cannot send reminder", description: "No WhatsApp/mobile number is available for this member.", variant: "destructive" });
      return;
    }
    setReminderMember(m);
  };

  const handleFeeStatus = (id: string, feeStatus: FeeStatusInputFeeStatus) => {
    if (feeStatus === "paid") {
      const member = all.find((candidate) => candidate.id === id);
      if (!member) return;
      const membershipFeeAmount = getMembershipFeeAmount(member.membershipFee);
      createPayment.mutate({
        data: {
          memberId: member.id,
          paymentType: "membership_fee",
          amountDue: membershipFeeAmount,
          amountPaid: membershipFeeAmount,
          status: "paid",
          paymentMethod: "cash",
          receiptNumber: `DKMO-MEM-${Date.now().toString().slice(-8)}`,
          notes: "Membership fee recorded from the Payments module",
        },
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPendingMembersQueryKey() });
          toast({ title: "Membership fee payment recorded" });
        },
        onError: (err: any) => {
          toast({ title: "Failed to record membership payment", description: err.message, variant: "destructive" });
        },
      });
      return;
    }
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
              ? "Membership-fee information from recorded payments and preserved Access evidence"
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
          {tab === "membership" && (
            <Button
              onClick={() => startBulk(reminderView ? filtered : all.filter(isDue))}
              disabled={bulkOpen || (reminderView ? filtered.length === 0 : all.filter(isDue).length === 0)}
              className="bg-[#25D366] hover:bg-[#128C7E] text-white"
              data-testid="button-remind-all"
            >
              <Send className="mr-2 h-4 w-4" />
              {`Remind All Unpaid (${reminderView ? filtered.length : all.filter(isDue).length})`}
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

      <WhatsAppReminderDialog
        open={!!reminderMember}
        onOpenChange={(open) => { if (!open) setReminderMember(null); }}
        recipientName={reminderMember?.fullName ?? ""}
        mobileNumber={reminderMember?.mobileNumber}
        messageForLanguage={(language) => reminderMember ? buildReminderMessage(reminderMember, language) : ""}
        title="Send Membership WhatsApp Reminder"
        testIdPrefix="membership-whatsapp-reminder"
      />

      <Dialog open={!!editingMember} onOpenChange={(open) => { if (!open && !isSavingEdit) setEditingMember(null); }}>
        <DialogContent className="sm:max-w-[500px] dark:bg-slate-900 dark:border-slate-800">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">
              Edit Membership Payment — {editingMember?.fullName}
            </DialogTitle>
          </DialogHeader>
          {editingMember ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-emerald-50/60 dark:bg-slate-800/70 p-3 text-sm">
                <p className="font-medium text-emerald-900 dark:text-slate-200">{editingMember.membershipId}</p>
                <p className="text-emerald-700/80 dark:text-slate-400">
                  Membership fee: {formatSAR(getMembershipFeeAmount(editingMember.membershipFee))}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-reference-member">Reference Member</Label>
                <select
                  id="payment-reference-member"
                  value={editReferenceMemberId}
                  onChange={(e) => setEditReferenceMemberId(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                >
                  <option value="">No reference member</option>
                  {referenceMemberOptions
                    .filter((candidate) => candidate.id !== editingMember.id)
                    .map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.fullName} ({candidate.membershipId})
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="payment-fee-status">Fee Status</Label>
                  <select
                    id="payment-fee-status"
                    value={editFeeStatus}
                    disabled={Boolean(editingMember.legacyMemberId)}
                    onChange={(e) => setEditFeeStatus(e.target.value as FeeStatusInputFeeStatus)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                  >
                    {EDITABLE_FEE_STATUSES.map((status) => (
                      <option key={status} value={status}>{feeStatusLabel(status)}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment-paid-on">Paid On</Label>
                  <Input
                    id="payment-paid-on"
                    type="date"
                    value={editPaidOn}
                    disabled={Boolean(editingMember.legacyMemberId)}
                    onChange={(e) => setEditPaidOn(e.target.value)}
                    className="dark:bg-slate-800 dark:border-slate-700"
                  />
                </div>
              </div>

              {editingMember.legacyMemberId ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Access fee status and payment dates are preserved as historical evidence and cannot be edited here. Reference links remain editable.
                </p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Marking a member paid records or updates the real membership-fee payment. FRF eligibility remains tied to that payment.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditingMember(null)} disabled={isSavingEdit}>
                  Cancel
                </Button>
                <Button onClick={() => void savePaymentEdit()} disabled={isSavingEdit || updateMember.isPending || createPayment.isPending}>
                  {isSavingEdit ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {tab === "frf" ? (
        <FrfFeesPanel
          key={`${initialFrfStatus ?? "default"}:${initialFrfCaseId ?? "default"}`}
          initialFeeFilter={initialFrfStatus === "pending" ? "pending" : undefined}
          initialCaseId={initialFrfCaseId}
        />
      ) : (
      <>
      {/* Membership fee banner */}
      <div className="flex items-start gap-3 rounded-xl border border-emerald-100 dark:border-slate-800 bg-emerald-50/50 dark:bg-slate-900 p-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 shrink-0">
          <HeartHandshake className="h-5 w-5" />
        </div>
        <div className="text-sm">
          <p className="font-semibold text-emerald-900 dark:text-slate-200">Membership fees — evidence-based records</p>
          <p className="text-emerald-700/80 dark:text-slate-400">
            Access-imported members show only values found in the legacy ledger. Missing information is not treated as unpaid. FRF fees are tracked separately.
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

      {/* Summary cards — Paid / Unpaid / Overdue / Amount Due */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <button
            key={k.label}
            type="button"
            onClick={() => switchView(k.target)}
            aria-pressed={view === k.target}
            data-testid={`card-fee-${k.label.toLowerCase().replace(/\s/g, "-")}`}
            className={cn(
              "rounded-2xl border p-4 shadow-sm bg-white dark:bg-slate-900 text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
              k.tone === "red"
                ? "border-red-200 dark:border-red-900/40"
                : k.tone === "amber"
                  ? "border-amber-200 dark:border-amber-900/40"
                  : "border-emerald-100 dark:border-slate-800",
              view === k.target && "ring-2 ring-emerald-500 dark:ring-emerald-400",
            )}
          >
            <p className={cn(
              "text-sm font-medium",
              k.tone === "red"
                ? "text-red-700 dark:text-red-400"
                : k.tone === "amber"
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-emerald-700 dark:text-slate-400",
            )}>{k.label}</p>
            {isLoading ? <Skeleton className="h-8 w-24 mt-1" /> : (
              <p className={cn(
                "text-2xl font-bold mt-1",
                k.tone === "red"
                  ? "text-red-600 dark:text-red-400"
                  : k.tone === "green"
                    ? "text-emerald-700 dark:text-green-400"
                    : k.tone === "amber"
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-emerald-950 dark:text-white",
              )}>
                {k.value}
              </p>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">{k.sub}</p>
          </button>
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
                     <Link href={withReturnTo(`/members/${member.id}`)} className="flex items-center gap-3 group" onClick={(e) => e.stopPropagation()}>
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
                    {member.feeStatus === "not_applicable" || member.feeStatus === "review" ? "—" : formatSAR(getMembershipFeeAmount(member.membershipFee))}
                  </TableCell>
                  <TableCell>
                    {member.feeStatus === "not_applicable" ? (
                      <span className="text-sm text-slate-500">—</span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${feeStatusBadgeClass(member.feeStatus)}`}>
                        {member.feeStatus === "paid" ? <CheckCircle2 className="h-3 w-3" /> : member.feeStatus === "exempt" ? <MinusCircle className="h-3 w-3" /> : member.feeStatus === "review" ? <Clock className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {feeStatusLabel(member.feeStatus)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-emerald-700 dark:text-slate-400">
                    {member.feeStatus === "not_applicable" ? "—" : member.feePaidAt ? formatDate(member.feePaidAt) : "—"}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      {reminderView && (
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
                      )}
                      {isDue(member) && (
                        <Button
                          size="sm"
                          className="bg-[#25D366] hover:bg-[#128C7E] text-white"
                          onClick={() => handleWhatsAppReminder(member)}
                          disabled={!hasWhatsAppNumber(member)}
                          title={!hasWhatsAppNumber(member) ? "No WhatsApp/mobile number available" : "Send WhatsApp reminder"}
                          data-testid={`button-remind-${member.membershipId}`}
                        >
                          <MessageSquareWarning className="mr-1.5 h-4 w-4" />
                          {hasWhatsAppNumber(member) ? "Remind" : "No WhatsApp/mobile number"}
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="dark:bg-slate-900 dark:border-slate-800">
                          {isDue(member) && (
                            <DropdownMenuItem
                              onClick={() => handleWhatsAppReminder(member)}
                              disabled={!hasWhatsAppNumber(member)}
                              className="text-[#128C7E] dark:text-[#25D366] dark:focus:bg-slate-800"
                              data-testid={`menu-remind-${member.membershipId}`}
                            >
                              <Send className="mr-2 h-4 w-4" /> {hasWhatsAppNumber(member) ? "Send WhatsApp Reminder" : "No WhatsApp/mobile number"}
                            </DropdownMenuItem>
                          )}
                          {member.feeStatus !== "paid" && (
                            <DropdownMenuItem onClick={() => handleFeeStatus(member.id, "paid")} className="text-emerald-700 dark:text-emerald-400 dark:focus:bg-slate-800">
                              <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Fee Paid
                            </DropdownMenuItem>
                          )}
                          {!member.legacyMemberId && member.feeStatus !== "exempt" && (
                            <DropdownMenuItem onClick={() => handleFeeStatus(member.id, "exempt")} className="text-slate-600 dark:text-slate-400 dark:focus:bg-slate-800">
                              <MinusCircle className="mr-2 h-4 w-4" /> Mark Fee Exempt
                            </DropdownMenuItem>
                          )}
                          {!member.legacyMemberId && member.feeStatus !== "unpaid" && (
                            <DropdownMenuItem onClick={() => handleFeeStatus(member.id, "unpaid")} className="dark:text-slate-300 dark:focus:bg-slate-800">
                              <XCircle className="mr-2 h-4 w-4" /> Mark Fee Unpaid
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => openPaymentEdit(member)}
                            className="dark:text-slate-300 dark:focus:bg-slate-800"
                            data-testid={`menu-edit-membership-payment-${member.membershipId}`}
                          >
                            <Pencil className="mr-2 h-4 w-4" /> Edit Payment Record
                          </DropdownMenuItem>
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
