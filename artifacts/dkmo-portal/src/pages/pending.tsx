import { useState, useMemo } from "react";
import {
  useGetPendingMembers,
  getGetPendingMembersQueryKey,
  useCreatePayment,
  getListPaymentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PaymentForm } from "@/components/PaymentForm";
import { formatSAR, getCurrentMonth, formatYearMonth } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, MessageSquareWarning, UserCircle, Phone, MapPin, Send, CircleDollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
type PendingMember = {
  memberId: string;
  fullName: string;
  mobileNumber: string;
  membershipId: string;
  city: string;
  country: string;
  monthlyAmount: number;
  amountPaid: number;
  amountDue: number;
  status: string;
};

function formatMobileForWa(mobileNumber: string): string {
  return mobileNumber.replace(/\D/g, "");
}

function buildReminderMessage(member: PendingMember, monthLabel: string): string {
  return `Assalamu Alaikum ${member.fullName},\n\nThis is a gentle reminder from DKMO (Dakshina Karnataka Muslim Ookota — Committed to the Community). Your monthly contribution of ${formatSAR(member.amountDue)} for ${monthLabel} is currently pending.\n\nPlease complete the payment at your earliest convenience.\n\nJazakallah Khair.`;
}

function sendRemindersToMembers(
  members: PendingMember[],
  monthLabel: string,
  onDone: (opened: number) => void,
  setBulkSending: (v: boolean) => void
) {
  const validMembers = members.filter((m) => formatMobileForWa(m.mobileNumber));
  if (validMembers.length === 0) { onDone(0); return; }
  setBulkSending(true);
  let opened = 0;
  validMembers.forEach((member, idx) => {
    setTimeout(() => {
      const message = encodeURIComponent(buildReminderMessage(member, monthLabel));
      window.open(`https://wa.me/${formatMobileForWa(member.mobileNumber)}?text=${message}`, "_blank");
      opened += 1;
      if (idx === validMembers.length - 1) {
        setBulkSending(false);
        onDone(opened);
      }
    }, idx * 350);
  });
}

export default function Pending() {
  const [monthFilter, setMonthFilter] = useState(getCurrentMonth());
  const [bulkSending, setBulkSending] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [payingMember, setPayingMember] = useState<PendingMember | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createPayment = useCreatePayment();

  const { data: pendingMembers, isLoading } = useGetPendingMembers({ month: monthFilter || undefined });
  const monthLabel = formatYearMonth(monthFilter);

  const allIds = useMemo(() => (pendingMembers ?? []).map((m) => m.memberId), [pendingMembers]);
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
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleWhatsAppReminder = (member: PendingMember) => {
    const formattedNum = formatMobileForWa(member.mobileNumber);
    if (!formattedNum) {
      toast({ title: "Cannot send reminder", description: "Member has no valid mobile number", variant: "destructive" });
      return;
    }
    const message = encodeURIComponent(buildReminderMessage(member, monthLabel));
    window.open(`https://wa.me/${formattedNum}?text=${message}`, "_blank");
  };

  const handleBulkReminder = () => {
    if (!pendingMembers || pendingMembers.length === 0) return;
    if (!window.confirm(`Send a WhatsApp reminder to all ${pendingMembers.length} pending members? Your browser may ask permission to open multiple tabs.`)) return;
    sendRemindersToMembers(pendingMembers, monthLabel, (opened) => {
      toast({ title: "Bulk reminder sent", description: `Opened ${opened} WhatsApp tab${opened === 1 ? "" : "s"}.` });
    }, setBulkSending);
  };

  const handleSelectedReminder = () => {
    if (!pendingMembers || selectedCount === 0) return;
    const selected = pendingMembers.filter((m) => selectedIds.has(m.memberId));
    if (!window.confirm(`Send a WhatsApp reminder to ${selected.length} selected member${selected.length === 1 ? "" : "s"}? Your browser may ask permission to open multiple tabs.`)) return;
    sendRemindersToMembers(selected, monthLabel, (opened) => {
      toast({ title: "Reminders sent", description: `Opened ${opened} WhatsApp tab${opened === 1 ? "" : "s"}.` });
      setSelectedIds(new Set());
    }, setBulkSending);
  };

  const handleRecordPayment = (data: Parameters<typeof createPayment.mutate>[0]["data"]) => {
    createPayment.mutate(
      { data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPendingMembersQueryKey({ month: monthFilter }) });
          queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey() });
          setPayingMember(null);
          toast({ title: "Payment recorded", description: `Payment saved for ${payingMember?.fullName}.` });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to record payment. Please try again.", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Record Payment Dialog */}
      <Dialog open={!!payingMember} onOpenChange={(open) => { if (!open) setPayingMember(null); }}>
        <DialogContent className="sm:max-w-[520px] dark:bg-slate-900 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-emerald-950 dark:text-emerald-100">
              Record Payment — {payingMember?.fullName}
            </DialogTitle>
            <p className="text-sm text-emerald-700 dark:text-slate-400">
              {payingMember?.membershipId} · Amount due: {payingMember ? formatSAR(payingMember.amountDue) : ""}
            </p>
          </DialogHeader>
          {payingMember && (
            <PaymentForm
              fixedMemberId={payingMember.memberId}
              defaultValues={{
                memberId: payingMember.memberId,
                month: monthFilter,
                amountPaid: payingMember.amountDue,
                paymentMethod: "cash",
                receiptNumber: `RCPT-${Date.now()}`,
                notes: "",
              }}
              onSubmit={handleRecordPayment}
              isSubmitting={createPayment.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-green-950 dark:text-green-100">Pending Contributions</h1>
          <p className="text-green-800/70 dark:text-slate-400">Track unpaid and partially paid members for {monthLabel}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-2 bg-white dark:bg-slate-900 p-2 rounded-lg border border-green-100 dark:border-slate-800 shadow-sm">
            <CalendarDays className="h-5 w-5 text-green-700 dark:text-slate-500 ml-2 shrink-0" />
            <Input
              type="month"
              value={monthFilter}
              onChange={(e) => { setMonthFilter(e.target.value); setSelectedIds(new Set()); }}
              className="border-0 focus-visible:ring-0 shadow-none px-2 h-9 dark:bg-transparent dark:text-slate-200"
            />
          </div>

          {selectedCount > 0 && (
            <Button
              onClick={handleSelectedReminder}
              disabled={bulkSending}
              variant="outline"
              className="border-[#25D366] text-[#25D366] hover:bg-[#25D366]/10"
            >
              <Send className="mr-2 h-4 w-4" />
              {bulkSending ? "Opening..." : `Remind Selected (${selectedCount})`}
            </Button>
          )}

          <Button
            onClick={handleBulkReminder}
            disabled={bulkSending || !pendingMembers || pendingMembers.length === 0}
            className="bg-[#25D366] hover:bg-[#128C7E] text-white"
          >
            <Send className="mr-2 h-4 w-4" />
            {bulkSending ? "Opening..." : `Remind All (${pendingMembers?.length || 0})`}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-emerald-800 dark:text-slate-300">Total Pending Members</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold text-emerald-950 dark:text-white">{pendingMembers?.length || 0}</div>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-red-100 dark:border-red-900/40 dark:bg-slate-900 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-emerald-800 dark:text-slate-300">Total Amount Due</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-32" /> : (
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {formatSAR(pendingMembers?.reduce((acc, curr) => acc + curr.amountDue, 0) || 0)}
              </div>
            )}
          </CardContent>
        </Card>
        {selectedCount > 0 && (
          <Card className="rounded-2xl border-[#25D366]/30 bg-[#25D366]/5 dark:border-[#25D366]/20 dark:bg-slate-900 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-emerald-800 dark:text-slate-300">Selected Members</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#128C7E] dark:text-[#25D366]">{selectedCount}</div>
              <p className="text-xs text-emerald-600 dark:text-slate-500 mt-1">
                Due: {formatSAR((pendingMembers ?? []).filter((m) => selectedIds.has(m.memberId)).reduce((acc, m) => acc + m.amountDue, 0))}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-emerald-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-emerald-50/50 dark:bg-slate-800/60">
            <TableRow className="dark:border-slate-700">
              <TableHead className="w-12">
                <Checkbox
                  checked={allSelected}
                  data-state={someSelected ? "indeterminate" : undefined}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                  className="border-emerald-300 dark:border-slate-600"
                  disabled={isLoading || !pendingMembers || pendingMembers.length === 0}
                />
              </TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Member</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Contact</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Total Dues</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Amount Paid</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Amount Due</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-center">Status</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="dark:border-slate-800">
                  <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                  <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20 mx-auto rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-40 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : pendingMembers?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-emerald-600 dark:text-slate-500">
                  <div className="flex flex-col items-center justify-center">
                    <div className="h-12 w-12 rounded-full bg-emerald-50 dark:bg-slate-800 flex items-center justify-center mb-3">
                      <CalendarDays className="h-6 w-6 text-emerald-300 dark:text-slate-600" />
                    </div>
                    <p className="font-medium text-emerald-900 dark:text-slate-300">All caught up!</p>
                    <p className="text-sm dark:text-slate-500">No pending contributions for this month.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              pendingMembers?.map((member) => {
                const isSelected = selectedIds.has(member.memberId);
                return (
                  <TableRow
                    key={member.memberId}
                    className={cn(
                      "hover:bg-emerald-50/30 dark:hover:bg-slate-800/50 dark:border-slate-800 transition-colors cursor-pointer",
                      isSelected && "bg-[#25D366]/5 dark:bg-[#25D366]/10 hover:bg-[#25D366]/10 dark:hover:bg-[#25D366]/15"
                    )}
                    onClick={() => toggleOne(member.memberId)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleOne(member.memberId)}
                        aria-label={`Select ${member.fullName}`}
                        className="border-emerald-300 dark:border-slate-600"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-full shrink-0",
                          isSelected
                            ? "bg-[#25D366]/20 text-[#128C7E] dark:bg-[#25D366]/20 dark:text-[#25D366]"
                            : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                        )}>
                          <UserCircle className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-medium text-emerald-950 dark:text-slate-200">{member.fullName}</div>
                          <div className="text-xs text-emerald-600 dark:text-slate-500">ID: {member.membershipId}</div>
                        </div>
                      </div>
                    </TableCell>
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
                    <TableCell className="text-right text-emerald-900 dark:text-slate-300 font-medium">
                      {formatSAR(member.monthlyAmount)}
                    </TableCell>
                    <TableCell className="text-right text-emerald-700 dark:text-green-400">
                      {formatSAR(member.amountPaid)}
                    </TableCell>
                    <TableCell className="text-right text-red-600 dark:text-red-400 font-bold">
                      {formatSAR(member.amountDue)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className={cn(
                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider",
                        member.status === 'unpaid'
                          ? "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-400"
                          : "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400"
                      )}>
                        {member.status}
                      </div>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-slate-600 dark:text-emerald-400 dark:hover:bg-slate-800"
                          onClick={() => setPayingMember(member)}
                        >
                          <CircleDollarSign className="mr-1.5 h-4 w-4" />
                          Pay
                        </Button>
                        <Button
                          size="sm"
                          className="bg-[#25D366] hover:bg-[#128C7E] text-white"
                          onClick={() => handleWhatsAppReminder(member)}
                        >
                          <MessageSquareWarning className="mr-1.5 h-4 w-4" />
                          Remind
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
