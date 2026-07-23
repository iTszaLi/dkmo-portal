import { useState, useMemo } from "react";
import {
  useGetPendingMembers,
  getGetPendingMembersQueryKey,
  useUpdateMemberFeeStatus,
  getListMembersQueryKey,
  useListPendingFrfFees,
} from "@workspace/api-client-react";
import type { PendingMember, PendingFrfFee } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatSAR, feeStatusLabel, feeStatusBadgeClass } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquareWarning, UserCircle, Phone, MapPin, Send, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { RefMemberCell, useMemberIndex } from "@/components/RefMemberCell";
import { normalizeWhatsAppNumber, buildWhatsAppLink, type WhatsAppTarget } from "@/lib/whatsapp";
import { WhatsAppBulkDialog } from "@/components/WhatsAppBulkDialog";

function buildReminderMessage(member: PendingMember): string {
  return `Assalamu Alaikum ${member.fullName},\n\nThis is a gentle reminder from DKMO (Dakshina Karnataka Muslim Ookota — Committed to the Community). Your one-time membership registration fee of ${formatSAR(member.membershipFee)} is currently ${member.feeStatus}.\n\nPlease complete the payment at your earliest convenience to activate your membership.\n\nJazakallah Khair.`;
}

function toWhatsAppTargets(members: PendingMember[]): WhatsAppTarget[] {
  return members.flatMap((m) => {
    const number = normalizeWhatsAppNumber(m.mobileNumber);
    return number ? [{ id: m.memberId, name: m.fullName, number, message: buildReminderMessage(m) }] : [];
  });
}

function buildFrfReminderMessage(fee: PendingFrfFee): string {
  return `Assalamu Alaikum ${fee.fullName},\n\nThis is a gentle reminder from DKMO (Dakshina Karnataka Muslim Ookota — Committed to the Community). Your FRF fee of ${formatSAR(fee.balance)} for the case "${fee.caseTitle}" is currently ${fee.status}.\n\nPlease complete the payment at your earliest convenience.\n\nJazakallah Khair.`;
}

function toFrfWhatsAppTargets(fees: PendingFrfFee[]): WhatsAppTarget[] {
  return fees.flatMap((f) => {
    const number = normalizeWhatsAppNumber(f.mobileNumber);
    return number ? [{ id: f.contributionId, name: f.fullName, number, message: buildFrfReminderMessage(f) }] : [];
  });
}

type PendingTab = "membership" | "frf";

export default function Pending() {
  const [tab, setTab] = useState<PendingTab>("membership");
  const memberIndex = useMemberIndex();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTargets, setBulkTargets] = useState<WhatsAppTarget[]>([]);
  // Locked at open time so the dialog title always matches its targets,
  // even if the user switches tabs while the dialog is open.
  const [bulkTitle, setBulkTitle] = useState("Membership Fee Reminders");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateFeeStatus = useUpdateMemberFeeStatus();

  const { data: pendingMembers, isLoading: membersLoading } = useGetPendingMembers();
  const { data: pendingFrf, isLoading: frfLoading } = useListPendingFrfFees();
  const isLoading = tab === "membership" ? membersLoading : frfLoading;

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
    const number = normalizeWhatsAppNumber(member.mobileNumber);
    if (!number) {
      toast({ title: "Cannot send reminder", description: "Member has no valid mobile number", variant: "destructive" });
      return;
    }
    window.open(buildWhatsAppLink(number, buildReminderMessage(member)), "_blank", "noopener");
  };

  const startBulk = (members: PendingMember[]) => {
    const targets = toWhatsAppTargets(members);
    if (targets.length === 0) {
      toast({ title: "No valid mobile numbers", description: "None of these members have a WhatsApp-capable number.", variant: "destructive" });
      return;
    }
    setBulkTargets(targets);
    setBulkTitle("Membership Fee Reminders");
    setBulkOpen(true);
  };

  const handleBulkReminder = () => {
    if (tab === "frf") {
      if (!pendingFrf || pendingFrf.length === 0) return;
      const targets = toFrfWhatsAppTargets(pendingFrf);
      if (targets.length === 0) {
        toast({ title: "No valid mobile numbers", description: "None of these members have a WhatsApp-capable number.", variant: "destructive" });
        return;
      }
      setBulkTargets(targets);
      setBulkTitle("FRF Fee Reminders");
      setBulkOpen(true);
      return;
    }
    if (!pendingMembers || pendingMembers.length === 0) return;
    startBulk(pendingMembers);
  };

  const handleFrfReminder = (fee: PendingFrfFee) => {
    const number = normalizeWhatsAppNumber(fee.mobileNumber);
    if (!number) {
      toast({ title: "Cannot send reminder", description: "Member has no valid mobile number", variant: "destructive" });
      return;
    }
    window.open(buildWhatsAppLink(number, buildFrfReminderMessage(fee)), "_blank", "noopener");
  };

  const remindAllCount = tab === "membership" ? pendingMembers?.length || 0 : pendingFrf?.length || 0;

  const handleSelectedReminder = () => {
    if (!pendingMembers || selectedCount === 0) return;
    startBulk(pendingMembers.filter((m) => selectedIds.has(m.memberId)));
  };

  const handleMarkPaid = (member: PendingMember) => {
    updateFeeStatus.mutate({ id: member.memberId, data: { feeStatus: "paid" } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPendingMembersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
        toast({ title: "Fee marked paid", description: `${member.fullName}'s membership fee is now paid.` });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to update fee status. Please try again.", variant: "destructive" });
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-green-950 dark:text-green-100">
            {tab === "membership" ? "Pending Membership Fees" : "Pending FRF Fees"}
          </h1>
          <p className="text-green-800/70 dark:text-slate-400">
            {tab === "membership"
              ? "Members whose one-time registration fee is pending or unpaid"
              : "Members with an outstanding SAR 50 FRF fee for an FRF case"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Pending type switcher */}
          <div
            className="inline-flex rounded-xl border border-emerald-200 dark:border-slate-700 bg-emerald-50/60 dark:bg-slate-800/60 p-1"
            role="group"
            aria-label="Pending type"
          >
            {([["membership", "Membership Fees"], ["frf", "FRF Fees"]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={tab === value}
                onClick={() => { setTab(value); setSelectedIds(new Set()); }}
                data-testid={`tab-pending-${value}`}
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
          {tab === "membership" && selectedCount > 0 && (
            <Button
              onClick={handleSelectedReminder}
              disabled={bulkOpen}
              variant="outline"
              className="border-[#25D366] text-[#25D366] hover:bg-[#25D366]/10"
            >
              <Send className="mr-2 h-4 w-4" />
              {`Remind Selected (${selectedCount})`}
            </Button>
          )}

          <Button
            onClick={handleBulkReminder}
            disabled={bulkOpen || remindAllCount === 0}
            className="bg-[#25D366] hover:bg-[#128C7E] text-white"
          >
            <Send className="mr-2 h-4 w-4" />
            {`Remind All (${remindAllCount})`}
          </Button>
        </div>
      </div>

      <WhatsAppBulkDialog
        open={bulkOpen}
        onOpenChange={(o) => { setBulkOpen(o); if (!o) setSelectedIds(new Set()); }}
        targets={bulkTargets}
        title={bulkTitle}
      />

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-emerald-800 dark:text-slate-300">
              {tab === "membership" ? "Total Pending Members" : "Total Pending FRF Fees"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold text-emerald-950 dark:text-white" data-testid="text-pending-count">{remindAllCount}</div>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-red-100 dark:border-red-900/40 dark:bg-slate-900 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-emerald-800 dark:text-slate-300">Outstanding Fees</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-32" /> : (
              <div className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="text-pending-outstanding">
                {formatSAR(
                  tab === "membership"
                    ? pendingMembers?.reduce((acc, curr) => acc + curr.membershipFee, 0) || 0
                    : pendingFrf?.reduce((acc, curr) => acc + curr.balance, 0) || 0,
                )}
              </div>
            )}
          </CardContent>
        </Card>
        {tab === "membership" && selectedCount > 0 && (
          <Card className="rounded-2xl border-[#25D366]/30 bg-[#25D366]/5 dark:border-[#25D366]/20 dark:bg-slate-900 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-emerald-800 dark:text-slate-300">Selected Members</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#128C7E] dark:text-[#25D366]">{selectedCount}</div>
              <p className="text-xs text-emerald-600 dark:text-slate-500 mt-1">
                Fees: {formatSAR((pendingMembers ?? []).filter((m) => selectedIds.has(m.memberId)).reduce((acc, m) => acc + m.membershipFee, 0))}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* FRF pending table */}
      {tab === "frf" && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-emerald-100 dark:border-slate-800 shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-emerald-50/50 dark:bg-slate-800/60">
              <TableRow className="dark:border-slate-700">
                <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Member</TableHead>
                <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Contact</TableHead>
                <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">FRF Case</TableHead>
                <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">FRF Fee Due</TableHead>
                <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-center">Status</TableHead>
                <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {frfLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="dark:border-slate-800">
                    <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 mx-auto rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : (pendingFrf?.length ?? 0) === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-emerald-600 dark:text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <div className="h-12 w-12 rounded-full bg-emerald-50 dark:bg-slate-800 flex items-center justify-center mb-3">
                        <CheckCircle2 className="h-6 w-6 text-emerald-300 dark:text-slate-600" />
                      </div>
                      <p className="font-medium text-emerald-900 dark:text-slate-300">All caught up!</p>
                      <p className="text-sm dark:text-slate-500">Every FRF fee has been collected.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pendingFrf?.map((fee) => (
                  <TableRow key={fee.contributionId} className="hover:bg-emerald-50/30 dark:hover:bg-slate-800/50 dark:border-slate-800 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 shrink-0">
                          <UserCircle className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-medium text-emerald-950 dark:text-slate-200">{fee.fullName}</div>
                          <div className="text-xs text-emerald-600 dark:text-slate-500">ID: {fee.membershipId}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center text-xs text-emerald-800 dark:text-slate-300">
                          <Phone className="mr-1.5 h-3.5 w-3.5 text-emerald-500 dark:text-slate-500 shrink-0" />
                          {fee.mobileNumber}
                        </div>
                        <div className="flex items-center text-xs text-emerald-800 dark:text-slate-400">
                          <MapPin className="mr-1.5 h-3.5 w-3.5 text-emerald-500 dark:text-slate-500 shrink-0" />
                          {fee.city}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-emerald-800/90 dark:text-slate-300 max-w-[240px] truncate">{fee.caseTitle}</TableCell>
                    <TableCell className="text-right text-emerald-900 dark:text-slate-300 font-medium">{formatSAR(fee.balance)}</TableCell>
                    <TableCell className="text-center">
                      <span className={cn(
                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold",
                        fee.status === "overdue"
                          ? "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300"
                          : fee.status === "partial"
                            ? "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300"
                            : "bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300",
                      )}>
                        {fee.status.charAt(0).toUpperCase() + fee.status.slice(1)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        className="bg-[#25D366] hover:bg-[#128C7E] text-white"
                        onClick={() => handleFrfReminder(fee)}
                        data-testid={`button-frf-remind-${fee.membershipId}`}
                      >
                        <MessageSquareWarning className="mr-1.5 h-4 w-4" />
                        Remind
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Membership pending table */}
      {tab === "membership" && (
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
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Reference Member</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Membership Fee</TableHead>
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
                  <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20 mx-auto rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-40 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : pendingMembers?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-emerald-600 dark:text-slate-500">
                  <div className="flex flex-col items-center justify-center">
                    <div className="h-12 w-12 rounded-full bg-emerald-50 dark:bg-slate-800 flex items-center justify-center mb-3">
                      <CheckCircle2 className="h-6 w-6 text-emerald-300 dark:text-slate-600" />
                    </div>
                    <p className="font-medium text-emerald-900 dark:text-slate-300">All caught up!</p>
                    <p className="text-sm dark:text-slate-500">Every member's registration fee is paid.</p>
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
                    <TableCell>
                      <RefMemberCell refId={member.refMemberId} refName={member.refMemberName} index={memberIndex} />
                    </TableCell>
                    <TableCell className="text-right text-emerald-900 dark:text-slate-300 font-medium">
                      {formatSAR(member.membershipFee)}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={cn(
                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold",
                        feeStatusBadgeClass(member.feeStatus)
                      )}>
                        {feeStatusLabel(member.feeStatus)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={updateFeeStatus.isPending}
                          className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-slate-600 dark:text-emerald-400 dark:hover:bg-slate-800"
                          onClick={() => handleMarkPaid(member)}
                        >
                          <CheckCircle2 className="mr-1.5 h-4 w-4" />
                          Mark Paid
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
      )}
    </div>
  );
}
