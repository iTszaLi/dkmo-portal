import { useState, useEffect, useMemo, useRef, useDeferredValue } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useListMembers, useCreateMember, useUpdateMember, useDeleteMember, useUpdateMemberFeeStatus, useUpdateMemberCommitteeStatus, useCreatePayment, getListMembersQueryKey } from "@workspace/api-client-react";
import { celebrate } from "@/lib/confetti";
import { MemberInput, type FeeStatusInputFeeStatus, type CommitteeStatusInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MemberForm } from "@/components/MemberForm";
import { RefMemberCell, useMemberIndex } from "@/components/RefMemberCell";
import { MemberBadges } from "@/components/MemberBadges";
import { Search, Plus, UserCircle, MapPin, Phone, MoreHorizontal, Edit, Trash, Users, CheckCircle2, Clock, XCircle, MinusCircle, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { feeStatusLabel, feeStatusBadgeClass } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { MemberAvatar } from "@/components/MemberAvatar";
import { ReferralAnalytics } from "@/components/ReferralAnalytics";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { replaceCurrentQuery, withReturnTo } from "@/lib/navigation";
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

export default function Members() {
  const memberIndex = useMemberIndex();
  const searchString = useSearch();
  const initialParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const [search, setSearch] = useState(() => initialParams.get("search") ?? "");
  const [statusFilter, setStatusFilter] = useState<string>(() => initialParams.get("status") ?? "all");
  const [legacyFilter, setLegacyFilter] = useState<string>(() => initialParams.get("legacy") ?? "all");
  const [feeFilter, setFeeFilter] = useState<string>(() => initialParams.get("fee") ?? "all");
  const [frfDueFilter, setFrfDueFilter] = useState<string>(() => initialParams.get("frfDue") ?? "all");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<any>(null);
  const [deletingMember, setDeletingMember] = useState<any>(null);

  const deferredSearch = useDeferredValue(search);
  const searchQuery = deferredSearch.trim();
  const { data: members, isLoading } = useListMembers({ search: searchQuery.length >= 2 ? searchQuery : undefined });
  const { data: allMembers, isLoading: isTotalLoading } = useListMembers();
  const createMember = useCreateMember();
  const updateMember = useUpdateMember();
  const deleteMember = useDeleteMember();
  const updateFeeStatus = useUpdateMemberFeeStatus();
  const createPayment = useCreatePayment();
  const updateCommitteeStatus = useUpdateMemberCommitteeStatus();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const lastNavigatedRef = useRef<string>("");

  useEffect(() => {
    replaceCurrentQuery({
      search: search || null,
      status: statusFilter === "all" ? null : statusFilter,
      legacy: legacyFilter === "all" ? null : legacyFilter,
      fee: feeFilter === "all" ? null : feeFilter,
      frfDue: frfDueFilter === "all" ? null : frfDueFilter,
    });
  }, [search, statusFilter, legacyFilter, feeFilter, frfDueFilter]);

  // Auto-load: when a valid Member ID or mobile number is entered, open the
  // member record immediately (mirrors the old MS Access lookup workflow).
  useEffect(() => {
    const q = search.trim();
    if (!q || !members || members.length === 0) return;
    const ql = q.toLowerCase();
    const qDigits = q.replace(/\D/g, "").replace(/^0+/, "");
    const exact = members.filter((m) => {
      if (m.membershipId.toLowerCase() === ql) return true;
      if (qDigits.length >= 7) {
        const md = m.mobileNumber.replace(/\D/g, "").replace(/^0+/, "");
        if (md === qDigits || md.endsWith(qDigits)) return true;
      }
      return false;
    });
    if (exact.length === 1 && lastNavigatedRef.current !== exact[0].id) {
      lastNavigatedRef.current = exact[0].id;
      navigate(withReturnTo(`/members/${exact[0].id}`));
    }
  }, [search, members, navigate]);

  // Soft duplicate check (admin exception): members can legitimately share a
  // mobile in rare cases, so this only warns + asks for confirmation — it never
  // hard-blocks like the public membership application does.
  const [dupConfirm, setDupConfirm] = useState<{ data: MemberInput; existing: any; mode: "create" | "update" } | null>(null);

  const findMobileDup = (mobile: string, excludeId?: string) => {
    const d = (mobile || "").replace(/\D/g, "").replace(/^0+/, "");
    if (d.length < 7 || !members) return null;
    return members.find((m: any) => {
      if (excludeId && m.id === excludeId) return false;
      const md = (m.mobileNumber || "").replace(/\D/g, "").replace(/^0+/, "");
      return md === d;
    }) ?? null;
  };

  const doCreate = (data: MemberInput) => {
    createMember.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
        setIsAddOpen(false);
        toast({ title: "Member created successfully", variant: "default" });
        celebrate();
      },
      onError: (err: any) => {
        toast({ title: "Failed to create member", description: err.message, variant: "destructive" });
      }
    });
  };

  const doUpdate = (data: MemberInput, id: string) => {
    updateMember.mutate({ id, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
        setEditingMember(null);
        toast({ title: "Member updated successfully", variant: "default" });
      },
      onError: (err: any) => {
        toast({ title: "Failed to update member", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleCreate = (data: MemberInput) => {
    const existing = findMobileDup(data.mobileNumber);
    if (existing) { setDupConfirm({ data, existing, mode: "create" }); return; }
    doCreate(data);
  };

  const handleUpdate = (data: MemberInput) => {
    if (!editingMember) return;
    const existing = findMobileDup(data.mobileNumber, editingMember.id);
    if (existing) { setDupConfirm({ data, existing, mode: "update" }); return; }
    doUpdate(data, editingMember.id);
  };

  const confirmDuplicateSave = () => {
    if (!dupConfirm) return;
    if (dupConfirm.mode === "create") doCreate(dupConfirm.data);
    else if (editingMember) doUpdate(dupConfirm.data, editingMember.id);
    setDupConfirm(null);
  };

  const handleDelete = () => {
    if (!deletingMember) return;
    deleteMember.mutate({ id: deletingMember.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
        setDeletingMember(null);
        toast({ title: "Member deleted successfully", variant: "default" });
      },
      onError: (err: any) => {
        toast({ title: "Failed to delete member", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleFeeStatus = (id: string, feeStatus: FeeStatusInputFeeStatus) => {
    if (feeStatus === "paid") {
      const member = members?.find((m) => m.id === id);
      if (!member) return;
      const membershipFeeAmount =
        Number(member.membershipFee) > 0 ? Number(member.membershipFee) : 100;
      createPayment.mutate({
        data: {
          memberId: member.id,
          paymentType: "membership_fee",
          amountDue: membershipFeeAmount,
          amountPaid: membershipFeeAmount,
          status: "paid",
          paymentMethod: "cash",
          receiptNumber: `DKMO-MEM-${Date.now().toString().slice(-8)}`,
          notes: "Membership fee recorded from the Members module",
        },
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
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
        toast({ title: "Fee status updated", variant: "default" });
      },
      onError: (err: any) => {
        toast({ title: "Failed to update fee status", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleCommitteeStatus = (
    id: string,
    data: CommitteeStatusInput,
    message: string,
  ) => {
    updateCommitteeStatus.mutate({ id, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
        toast({ title: message, variant: "default" });
      },
      onError: (err: any) => {
        toast({ title: "Failed to update committee status", description: err.message, variant: "destructive" });
      }
    });
  };

  const filteredMembers = members?.filter((m) => {
    const legacyStatus = (m as any).legacyRecordStatus ?? ((m as any).legacyMemberId ? "legacy_record" : "portal_member");
    if (legacyFilter !== "all" && legacyStatus !== legacyFilter) return false;
    const effectiveFrfStatus = m.feeStatus === "paid" ? "active" : "inactive";
    if (statusFilter !== "all" && effectiveFrfStatus !== statusFilter) return false;
    if (feeFilter !== "all" && m.feeStatus !== feeFilter) return false;
    if (frfDueFilter !== "all") {
      const outstanding = (m as any).frfOutstanding ?? 0;
      const overdueCount = (m as any).frfOverdueCount ?? 0;
      if (frfDueFilter === "none" && outstanding > 0) return false;
      if (frfDueFilter === "due" && outstanding <= 0) return false;
      if (frfDueFilter === "overdue" && overdueCount <= 0) return false;
    }
    return true;
  });
  const matchingMembers = filteredMembers ?? [];
  const referredMatchCount = matchingMembers.filter((member) => member.searchMatch === "referred").length;
  const hasMemberFilters =
    statusFilter !== "all" ||
    legacyFilter !== "all" ||
    feeFilter !== "all" ||
    frfDueFilter !== "all";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-950 dark:text-emerald-100">Members</h1>
          <p className="text-emerald-700/80 dark:text-slate-400">Manage trust members and their details</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white">
              <Plus className="mr-2 h-4 w-4" /> Add Member
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] dark:bg-slate-900 dark:border-slate-800">
            <DialogHeader>
              <DialogTitle className="dark:text-slate-100">Add New Member</DialogTitle>
            </DialogHeader>
            <MemberForm onSubmit={handleCreate} isSubmitting={createMember.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="w-full sm:max-w-xs rounded-2xl border border-emerald-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm" data-testid="card-total-members">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-slate-400">Total Members</p>
            {isTotalLoading ? (
              <Skeleton className="mt-1 h-8 w-20" />
            ) : (
              <p className="text-3xl font-bold tracking-tight text-emerald-950 dark:text-white" data-testid="text-total-members">
                {(allMembers?.length ?? 0).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>

      <ReferralAnalytics />

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex items-center space-x-2 bg-white dark:bg-slate-900 p-2 rounded-lg border border-emerald-100 dark:border-slate-800 shadow-sm w-full sm:max-w-md">
          <Search className="h-5 w-5 text-emerald-400 dark:text-slate-500 ml-2 shrink-0" />
          <Input
            placeholder="Search by Portal ID, Access ID, name, mobile, Iqama, Jamaath, or place..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-0 focus-visible:ring-0 shadow-none px-2 h-9 dark:bg-transparent dark:text-slate-200 dark:placeholder:text-slate-500"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[170px] bg-white dark:bg-slate-900 border-emerald-100 dark:border-slate-800" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={legacyFilter} onValueChange={setLegacyFilter}>
          <SelectTrigger className="w-full sm:w-[190px] bg-white dark:bg-slate-900 border-emerald-100 dark:border-slate-800" data-testid="select-legacy-filter">
            <SelectValue placeholder="Member source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All member sources</SelectItem>
            <SelectItem value="portal_member">Portal members</SelectItem>
            <SelectItem value="legacy_record">Legacy / Unmatched</SelectItem>
            <SelectItem value="confirmed_match">Confirmed matches</SelectItem>
            <SelectItem value="confirmed_different_person">Confirmed different people</SelectItem>
            <SelectItem value="needs_review">Needs review</SelectItem>
            <SelectItem value="possible_duplicate">Possible duplicates</SelectItem>
          </SelectContent>
        </Select>
        <Select value={feeFilter} onValueChange={setFeeFilter}>
          <SelectTrigger className="w-full sm:w-[170px] bg-white dark:bg-slate-900 border-emerald-100 dark:border-slate-800" data-testid="select-fee-filter">
            <SelectValue placeholder="Fee status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All fee statuses</SelectItem>
            <SelectItem value="paid">Fee paid</SelectItem>
            <SelectItem value="partial">Fee partial</SelectItem>
            <SelectItem value="pending">Fee pending</SelectItem>
            <SelectItem value="unpaid">Fee unpaid</SelectItem>
            <SelectItem value="exempt">Fee exempt</SelectItem>
            <SelectItem value="review">Legacy fee record needs review</SelectItem>
            <SelectItem value="not_applicable">No Access fee information</SelectItem>
          </SelectContent>
        </Select>
        <Select value={frfDueFilter} onValueChange={setFrfDueFilter}>
          <SelectTrigger className="w-full sm:w-[170px] bg-white dark:bg-slate-900 border-emerald-100 dark:border-slate-800" data-testid="select-frf-due-filter">
            <SelectValue placeholder="FRF dues" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All FRF dues</SelectItem>
            <SelectItem value="none">No FRF Due</SelectItem>
            <SelectItem value="due">FRF Due</SelectItem>
            <SelectItem value="overdue">Overdue FRF</SelectItem>
          </SelectContent>
        </Select>
        {(statusFilter !== "all" || legacyFilter !== "all" || feeFilter !== "all" || frfDueFilter !== "all") && (
          <button
            onClick={() => { setStatusFilter("all"); setLegacyFilter("all"); setFeeFilter("all"); setFrfDueFilter("all"); }}
            className="text-sm text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap"
            data-testid="button-clear-filters"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-emerald-700 dark:text-slate-400" aria-live="polite">
        <span data-testid="text-member-result-count">
          {isLoading
            ? "Searching members…"
            : `${matchingMembers.length.toLocaleString()} matching member${matchingMembers.length === 1 ? "" : "s"}${searchQuery ? ` for “${searchQuery}”` : ""}${hasMemberFilters ? " with current filters" : ""}`}
        </span>
        {referredMatchCount > 0 && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {referredMatchCount.toLocaleString()} referral-only result{referredMatchCount === 1 ? "" : "s"} shown after direct matches
          </span>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-emerald-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-emerald-50/50 dark:bg-slate-800/60">
            <TableRow className="dark:border-slate-700">
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Member</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Contact</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Location</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Reference Member</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Status</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Membership</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="dark:border-slate-800">
                  <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-11 w-32" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : filteredMembers?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-emerald-600 dark:text-slate-500">
                  No members found.
                </TableCell>
              </TableRow>
            ) : (
              matchingMembers.map((member) => (
                <TableRow key={member.id} className="hover:bg-emerald-50/30 dark:hover:bg-slate-800/50 cursor-pointer dark:border-slate-800 transition-colors">
                  <TableCell>
                    <Link href={withReturnTo(`/members/${member.id}`)} className="flex items-center gap-3 w-full">
                      <MemberAvatar photoUrl={member.photoUrl} name={member.fullName} size="md" />
                      <div>
                        <div className="font-medium text-emerald-950 dark:text-slate-200">{member.fullName}</div>
                        <div className="text-xs text-emerald-600 dark:text-slate-500">ID: {member.membershipId}</div>
                        {member.searchMatch === "referred" && (
                          <Badge
                            variant="outline"
                            className="mt-1 border-violet-300 text-[10px] text-violet-700 dark:border-violet-700 dark:text-violet-300"
                            data-testid={`badge-search-match-${member.id}`}
                          >
                            Referred by match
                          </Badge>
                        )}
                        {(member as any).legacyMemberId ? (
                          <div className="text-xs text-amber-700 dark:text-amber-300">
                            Access ID: {(member as any).legacyMemberId}
                          </div>
                        ) : null}
                        <MemberBadges
                          designation={(member as any).designation}
                          isExecutiveCommittee={(member as any).isExecutiveCommittee}
                          isCoreCommittee={(member as any).isCoreCommittee}
                          className="mt-1"
                        />
                        {(() => {
                          const source = (member as any).legacyRecordStatus ?? ((member as any).legacyMemberId ? "legacy_record" : "portal_member");
                          if (source === "portal_member") return null;
                          const confirmed = source === "confirmed_match";
                          const needsReview = source === "needs_review";
                          const possibleDuplicate = source === "possible_duplicate";
                          const confirmedDifferent = source === "confirmed_different_person";
                          const label = confirmed
                            ? "Confirmed Access match"
                            : needsReview
                              ? "Needs Review"
                              : possibleDuplicate
                                ? "Possible Duplicate"
                                : confirmedDifferent
                                  ? "Confirmed Different Person"
                                  : "Legacy / Unmatched";
                          return (
                            <Badge
                              variant="outline"
                              className={`mt-1 text-[10px] ${
                                confirmed
                                  ? "border-sky-300 text-sky-700 dark:border-sky-700 dark:text-sky-300"
                                  : needsReview || possibleDuplicate
                                    ? "border-rose-300 text-rose-700 dark:border-rose-700 dark:text-rose-300"
                                    : "border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-300"
                              }`}
                              data-testid={`badge-legacy-status-${member.id}`}
                            >
                              {label}
                            </Badge>
                          );
                        })()}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center text-sm text-emerald-800 dark:text-slate-300">
                      <Phone className="mr-2 h-3.5 w-3.5 text-emerald-500 dark:text-emerald-600 shrink-0" />
                      {member.mobileNumber}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center text-sm text-emerald-800 dark:text-slate-300">
                      <MapPin className="mr-2 h-3.5 w-3.5 text-emerald-500 dark:text-emerald-600 shrink-0" />
                      {member.city}, {member.country}
                    </div>
                  </TableCell>
                  <TableCell>
                    <RefMemberCell refId={member.refMemberId} refName={member.refMemberName} index={memberIndex} emptyLabel="No Referrer" />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 items-start">
                      {member.feeStatus !== "not_applicable" ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${feeStatusBadgeClass(member.feeStatus)}`} data-testid={`badge-fee-status-${member.id}`}>
                          {member.feeStatus === "paid" ? <CheckCircle2 className="h-3 w-3" /> : member.feeStatus === "exempt" ? <MinusCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                          Membership: {feeStatusLabel(member.feeStatus)}
                        </span>
                      ) : null}
                      {(() => {
                        const s = member.feeStatus === "paid" ? "active" : "inactive";
                        const cls =
                          s === "active"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                             : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400";
                        return (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${cls}`} data-testid={`badge-frf-status-${member.id}`}>
                            FRF: {s}
                          </span>
                        );
                      })()}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {(() => {
                       const active = member.feeStatus === "paid";
                      return (
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${active ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400"}`}
                          data-testid={`badge-frf-membership-${member.id}`}
                        >
                          {active ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          {active ? "Active" : "Inactive"}
                        </span>
                      );
                    })()}
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
                        <DropdownMenuItem asChild>
                          <Link href={withReturnTo(`/members/${member.id}`)} className="cursor-pointer flex w-full items-center dark:text-slate-300 dark:focus:bg-slate-800">
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditingMember(member)} className="dark:text-slate-300 dark:focus:bg-slate-800">
                          <Edit className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        {(() => {
                          const isExec = (member as any).isExecutiveCommittee === true;
                          const isCore = (member as any).isCoreCommittee === true;
                          return (
                            <>
                              {isExec ? (
                                <DropdownMenuItem onClick={() => handleCommitteeStatus(member.id, { isExecutiveCommittee: false }, `${member.fullName} removed from Executive Committee`)} className="text-amber-700 dark:text-amber-400 dark:focus:bg-slate-800">
                                  <ArrowDownCircle className="mr-2 h-4 w-4" /> Remove from Executive Committee
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => handleCommitteeStatus(member.id, { isExecutiveCommittee: true }, `${member.fullName} added to Executive Committee`)} className="text-yellow-700 dark:text-yellow-400 dark:focus:bg-slate-800">
                                  <ArrowUpCircle className="mr-2 h-4 w-4" /> Add to Executive Committee
                                </DropdownMenuItem>
                              )}
                              {isCore ? (
                                <DropdownMenuItem onClick={() => handleCommitteeStatus(member.id, { isCoreCommittee: false }, `${member.fullName} removed from Core Committee`)} className="dark:text-slate-300 dark:focus:bg-slate-800">
                                  <ArrowDownCircle className="mr-2 h-4 w-4" /> Remove from Core Committee
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => handleCommitteeStatus(member.id, { isCoreCommittee: true }, `${member.fullName} added to Core Committee`)} className="text-slate-700 dark:text-slate-300 dark:focus:bg-slate-800">
                                  <ArrowUpCircle className="mr-2 h-4 w-4" /> Add to Core Committee
                                </DropdownMenuItem>
                              )}
                            </>
                          );
                        })()}
                        {member.feeStatus !== "paid" && (
                          <DropdownMenuItem onClick={() => handleFeeStatus(member.id, "paid")} className="text-emerald-700 dark:text-emerald-400 dark:focus:bg-slate-800">
                            <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Fee Paid
                          </DropdownMenuItem>
                        )}
                        {member.feeStatus !== "partial" && (
                          <DropdownMenuItem onClick={() => handleFeeStatus(member.id, "partial")} className="text-yellow-700 dark:text-yellow-400 dark:focus:bg-slate-800">
                            <Clock className="mr-2 h-4 w-4" /> Mark Fee Partial
                          </DropdownMenuItem>
                        )}
                        {member.feeStatus !== "pending" && (
                          <DropdownMenuItem onClick={() => handleFeeStatus(member.id, "pending")} className="text-amber-700 dark:text-amber-400 dark:focus:bg-slate-800">
                            <Clock className="mr-2 h-4 w-4" /> Mark Fee Pending
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
                        <DropdownMenuItem onClick={() => setDeletingMember(member)} className="text-red-600 dark:text-red-400 dark:focus:bg-slate-800">
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

      <Dialog open={!!editingMember} onOpenChange={(open) => !open && setEditingMember(null)}>
        <DialogContent className="sm:max-w-[450px] dark:bg-slate-900 dark:border-slate-800 max-h-[88vh] p-5 flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">Edit Member</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mr-3 pr-3">
            {editingMember && (
              <MemberForm
                defaultValues={editingMember}
                onSubmit={handleUpdate}
                isSubmitting={updateMember.isPending}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingMember} onOpenChange={(open) => !open && setDeletingMember(null)}>
        <AlertDialogContent className="dark:bg-slate-900 dark:border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-slate-100">Are you sure?</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-slate-400">
              This will permanently delete the member "{deletingMember?.fullName}" and all associated records.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!dupConfirm} onOpenChange={(open) => !open && setDupConfirm(null)}>
        <AlertDialogContent className="dark:bg-slate-900 dark:border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-slate-100">Possible duplicate member</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-slate-400">
              A member with this mobile number already exists
              {dupConfirm?.existing ? `: ${dupConfirm.existing.fullName} (${dupConfirm.existing.membershipId})` : ""}.
              {" "}Do you still want to save this record?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDuplicateSave} className="bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600">Save anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
