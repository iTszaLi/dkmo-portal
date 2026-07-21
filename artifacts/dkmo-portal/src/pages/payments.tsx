import { useState } from "react";
import { Link } from "wouter";
import {
  useListMembers,
  useUpdateMemberFeeStatus,
  getListMembersQueryKey,
} from "@workspace/api-client-react";
import type { FeeStatusInputFeeStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, UserCircle, MoreHorizontal, Search, Wallet, CheckCircle2, Clock, XCircle, HeartHandshake } from "lucide-react";
import { formatSAR, formatDate, feeStatusLabel, feeStatusBadgeClass } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const FEE_STATUSES = [
  { value: "all", label: "All Statuses" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "unpaid", label: "Unpaid" },
];

export default function Payments() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [textSearch, setTextSearch] = useState("");

  const { data: members, isLoading } = useListMembers({ search: textSearch.length > 2 ? textSearch : undefined });
  const updateFeeStatus = useUpdateMemberFeeStatus();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const filtered = (members ?? []).filter((m) => statusFilter === "all" || m.feeStatus === statusFilter);

  const totalCollected = (members ?? []).filter((m) => m.feeStatus === "paid").reduce((acc, m) => acc + m.membershipFee, 0);
  const totalOutstanding = (members ?? []).filter((m) => m.feeStatus !== "paid").reduce((acc, m) => acc + m.membershipFee, 0);

  const handleFeeStatus = (id: string, feeStatus: FeeStatusInputFeeStatus) => {
    updateFeeStatus.mutate({ id, data: { feeStatus } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
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
          <h1 className="text-3xl font-bold tracking-tight text-emerald-950 dark:text-emerald-100">Membership Fees</h1>
          <p className="text-emerald-700/80 dark:text-slate-400">Track the one-time registration fee for each member</p>
        </div>
        <Link href="/members">
          <Button className="bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white">
            <Plus className="mr-2 h-4 w-4" /> Add Member
          </Button>
        </Link>
      </div>

      {/* FRF placeholder banner */}
      <div className="flex items-start gap-3 rounded-xl border border-emerald-100 dark:border-slate-800 bg-emerald-50/50 dark:bg-slate-900 p-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 shrink-0">
          <HeartHandshake className="h-5 w-5" />
        </div>
        <div className="text-sm">
          <p className="font-semibold text-emerald-900 dark:text-slate-200">Family Relief Fund (FRF) contributions</p>
          <p className="text-emerald-700/80 dark:text-slate-400">
            Recurring FRF contribution cycles will be tracked here in a future phase. For now, this page covers the one-time membership registration fee.
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-100 dark:border-slate-800 dark:bg-slate-900 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-emerald-700 dark:text-slate-400">Total Members</p>
          {isLoading ? <Skeleton className="h-8 w-16 mt-1" /> : (
            <p className="text-2xl font-bold text-emerald-950 dark:text-white mt-1">{members?.length || 0}</p>
          )}
        </div>
        <div className="rounded-2xl border border-emerald-100 dark:border-slate-800 dark:bg-slate-900 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-emerald-700 dark:text-slate-400">Fees Collected</p>
          {isLoading ? <Skeleton className="h-8 w-24 mt-1" /> : (
            <p className="text-2xl font-bold text-emerald-700 dark:text-green-400 mt-1">{formatSAR(totalCollected)}</p>
          )}
        </div>
        <div className="rounded-2xl border border-red-100 dark:border-red-900/40 dark:bg-slate-900 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-emerald-700 dark:text-slate-400">Outstanding Fees</p>
          {isLoading ? <Skeleton className="h-8 w-24 mt-1" /> : (
            <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{formatSAR(totalOutstanding)}</p>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-emerald-100 dark:border-slate-800 shadow-sm">
        <div className="space-y-1">
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
        <div className="space-y-1">
          <label className="text-xs font-medium text-emerald-700 dark:text-slate-400">Filter by Status</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="border-emerald-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 h-10">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-emerald-500 dark:text-slate-500" />
                <SelectValue placeholder="All Statuses" />
              </div>
            </SelectTrigger>
            <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
              {FEE_STATUSES.map(s => (
                <SelectItem key={s.value} value={s.value} className="dark:text-slate-300 dark:focus:bg-slate-800">{s.label}</SelectItem>
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
                  <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-emerald-600 dark:text-slate-500">
                  <div className="flex flex-col items-center justify-center">
                    <Wallet className="h-8 w-8 text-emerald-200 dark:text-slate-700 mb-2" />
                    <p>No members found for the selected filters.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((member) => (
                <TableRow key={member.id} className="hover:bg-emerald-50/30 dark:hover:bg-slate-800/50 dark:border-slate-800 transition-colors">
                  <TableCell>
                    <Link href={`/members/${member.id}`} className="flex items-center gap-3 group">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-900/60 transition-colors shrink-0">
                        <UserCircle className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-medium text-emerald-950 dark:text-slate-200 group-hover:text-emerald-700 dark:group-hover:text-green-300 transition-colors">{member.fullName}</div>
                        <div className="text-xs text-emerald-600 dark:text-slate-500">ID: {member.membershipId}</div>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    {member.refMemberName ? (
                      <div className="text-sm">
                        <div className="text-emerald-900 dark:text-slate-200">{member.refMemberName}</div>
                        {member.refMemberId ? (
                          <div className="text-xs text-emerald-600 dark:text-slate-500">ID: {member.refMemberId}</div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-emerald-500/70 dark:text-slate-600">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-bold text-emerald-900 dark:text-green-300">
                    {formatSAR(member.membershipFee)}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${feeStatusBadgeClass(member.feeStatus)}`}>
                      {member.feeStatus === "paid" ? <CheckCircle2 className="h-3 w-3" /> : member.feeStatus === "pending" ? <Clock className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {feeStatusLabel(member.feeStatus)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-emerald-700 dark:text-slate-400">
                    {member.feePaidAt ? formatDate(member.feePaidAt) : "—"}
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
                        {member.feeStatus !== "paid" && (
                          <DropdownMenuItem onClick={() => handleFeeStatus(member.id, "paid")} className="text-emerald-700 dark:text-emerald-400 dark:focus:bg-slate-800">
                            <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Fee Paid
                          </DropdownMenuItem>
                        )}
                        {member.feeStatus !== "pending" && (
                          <DropdownMenuItem onClick={() => handleFeeStatus(member.id, "pending")} className="text-amber-700 dark:text-amber-400 dark:focus:bg-slate-800">
                            <Clock className="mr-2 h-4 w-4" /> Mark Fee Pending
                          </DropdownMenuItem>
                        )}
                        {member.feeStatus !== "unpaid" && (
                          <DropdownMenuItem onClick={() => handleFeeStatus(member.id, "unpaid")} className="dark:text-slate-300 dark:focus:bg-slate-800">
                            <XCircle className="mr-2 h-4 w-4" /> Mark Fee Unpaid
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
