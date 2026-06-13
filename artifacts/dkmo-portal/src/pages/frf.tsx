import { useState } from "react";
import {
  useListFrfClaims,
  useCreateFrfClaim,
  useUpdateFrfClaim,
  useDeleteFrfClaim,
  useGetFrfStats,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  HeartHandshake, Plus, Trash2, Edit, CheckCircle2, Clock, XCircle, DollarSign, Users,
} from "lucide-react";
import { cn, formatSAR, formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

type ClaimType = "death_benefit" | "emergency" | "air_ticket" | "other";
type ClaimStatus = "pending" | "under_review" | "approved" | "rejected" | "disbursed";

const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  death_benefit: "Death Benefit",
  emergency: "Emergency Assistance",
  air_ticket: "Air Ticket Support",
  other: "Other",
};

const STATUS_STYLE: Record<ClaimStatus, string> = {
  pending:      "bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300 ring-1 ring-orange-300 dark:ring-orange-700/50",
  under_review: "bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-700/50",
  approved:     "bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-300 ring-1 ring-green-300 dark:ring-green-700/50",
  rejected:     "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300 ring-1 ring-red-300 dark:ring-red-700/50",
  disbursed:    "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-300 dark:ring-emerald-700/50",
};

const CLAIM_TYPES: ClaimType[] = ["death_benefit", "emergency", "air_ticket", "other"];
const CLAIM_STATUSES: ClaimStatus[] = ["pending", "under_review", "approved", "rejected", "disbursed"];

type FrfClaimInput = {
  claimantName: string;
  membershipId: string;
  claimType: ClaimType;
  amountRequested: number;
  amountApproved: number;
  status: ClaimStatus;
  beneficiaryName: string;
  beneficiaryRelation: string;
  description: string;
  notes: string;
};

const EMPTY_FORM: FrfClaimInput = {
  claimantName: "",
  membershipId: "",
  claimType: "death_benefit",
  amountRequested: 0,
  amountApproved: 0,
  status: "pending",
  beneficiaryName: "",
  beneficiaryRelation: "",
  description: "",
  notes: "",
};

export default function Frf() {
  const { canEdit, canDelete } = useAuth();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingClaim, setEditingClaim] = useState<any>(null);
  const [deletingClaim, setDeletingClaim] = useState<any>(null);
  const [form, setForm] = useState<FrfClaimInput>(EMPTY_FORM);

  const { data: claims = [], isLoading, refetch } = useListFrfClaims({
    status: statusFilter !== "all" ? statusFilter : undefined,
    claimType: typeFilter !== "all" ? typeFilter : undefined,
  });

  const { data: stats } = useGetFrfStats();
  const createMutation = useCreateFrfClaim({ mutation: { onSuccess: () => { refetch(); setIsFormOpen(false); setForm(EMPTY_FORM); toast({ title: "FRF claim created" }); }, onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }) } });
  const updateMutation = useUpdateFrfClaim({ mutation: { onSuccess: () => { refetch(); setEditingClaim(null); setForm(EMPTY_FORM); toast({ title: "Claim updated" }); }, onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }) } });
  const deleteMutation = useDeleteFrfClaim({ mutation: { onSuccess: () => { refetch(); setDeletingClaim(null); toast({ title: "Claim deleted" }); }, onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }) } });

  const openEdit = (claim: any) => {
    setEditingClaim(claim);
    setForm({
      claimantName: claim.claimantName,
      membershipId: claim.membershipId,
      claimType: claim.claimType,
      amountRequested: claim.amountRequested,
      amountApproved: claim.amountApproved,
      status: claim.status,
      beneficiaryName: claim.beneficiaryName,
      beneficiaryRelation: claim.beneficiaryRelation,
      description: claim.description,
      notes: claim.notes,
    });
  };

  const handleSubmit = () => {
    if (!form.claimantName.trim()) { toast({ title: "Claimant name is required", variant: "destructive" }); return; }
    if (editingClaim) {
      updateMutation.mutate({ id: editingClaim.id, data: form as any });
    } else {
      createMutation.mutate({ data: form as any });
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-green-950 dark:text-green-100 flex items-center gap-2">
            <HeartHandshake className="h-7 w-7 text-green-700 dark:text-green-400" />
            Family Relief Fund
          </h1>
          <p className="text-green-800/70 dark:text-slate-400 mt-1">
            FRF has been running for 18 years · Rs 3 lakh provided to families of deceased members
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => { setForm(EMPTY_FORM); setEditingClaim(null); setIsFormOpen(true); }}
            className="bg-green-700 hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700 text-white"
          >
            <Plus className="h-4 w-4 mr-1" /> New Claim
          </Button>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-green-900 dark:text-slate-300">Total Claims</CardTitle>
              <Users className="h-4 w-4 text-green-700 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-950 dark:text-white">{stats.total}</div>
              <p className="text-xs text-green-700/70 dark:text-slate-500 mt-1">All time</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-orange-100 dark:border-orange-900/40 dark:bg-slate-900 shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-orange-900 dark:text-orange-300">Pending</CardTitle>
              <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{stats.pendingCount}</div>
              <p className="text-xs text-orange-700/70 dark:text-orange-600/70 mt-1">Awaiting review</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-green-900 dark:text-slate-300">Approved</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-700 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-950 dark:text-green-300">{stats.approvedCount}</div>
              <p className="text-xs text-green-700/70 dark:text-slate-500 mt-1">Approved & disbursed</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-green-900 dark:text-slate-300">Total Disbursed</CardTitle>
              <DollarSign className="h-4 w-4 text-green-700 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-950 dark:text-green-300">{formatSAR(stats.totalDisbursed)}</div>
              <p className="text-xs text-green-700/70 dark:text-slate-500 mt-1">Relief provided</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Breakdown by type */}
      {stats?.byType && stats.byType.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-4">
          {stats.byType.map((t: any) => (
            <div key={t.type} className="rounded-xl border border-green-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-center shadow-sm">
              <p className="text-xs text-green-700/70 dark:text-slate-500">{CLAIM_TYPE_LABEL[t.type as ClaimType] ?? t.type}</p>
              <p className="text-lg font-bold text-green-950 dark:text-white mt-0.5">{t.count}</p>
              <p className="text-xs text-green-800 dark:text-green-400 font-medium">{formatSAR(t.totalAmount)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters + Table */}
      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <CardTitle className="text-base text-green-950 dark:text-green-100">Claims Register</CardTitle>
              <CardDescription className="dark:text-slate-400">
                {isLoading ? "Loading…" : `${claims.length} claim${claims.length === 1 ? "" : "s"}`}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px] dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                  <SelectItem value="all" className="dark:text-slate-300 dark:focus:bg-slate-800">All statuses</SelectItem>
                  {CLAIM_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize dark:text-slate-300 dark:focus:bg-slate-800">
                      {s.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[160px] dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                  <SelectItem value="all" className="dark:text-slate-300 dark:focus:bg-slate-800">All types</SelectItem>
                  {CLAIM_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="dark:text-slate-300 dark:focus:bg-slate-800">
                      {CLAIM_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-green-50/50 dark:bg-slate-800/60">
                <TableRow className="dark:border-slate-700">
                  <TableHead className="dark:text-slate-300">Claimant</TableHead>
                  <TableHead className="dark:text-slate-300">Type</TableHead>
                  <TableHead className="dark:text-slate-300">Beneficiary</TableHead>
                  <TableHead className="text-right dark:text-slate-300">Requested</TableHead>
                  <TableHead className="text-right dark:text-slate-300">Approved</TableHead>
                  <TableHead className="dark:text-slate-300">Status</TableHead>
                  <TableHead className="dark:text-slate-300">Date</TableHead>
                  {canEdit && <TableHead className="dark:text-slate-300"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i} className="dark:border-slate-800">
                      <TableCell><Skeleton className="h-8 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      {canEdit && <TableCell><Skeleton className="h-7 w-14" /></TableCell>}
                    </TableRow>
                  ))
                ) : claims.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 8 : 7} className="h-24 text-center text-green-600 dark:text-slate-500">
                      <div className="flex flex-col items-center gap-2">
                        <HeartHandshake className="h-8 w-8 text-green-200 dark:text-slate-700" />
                        <p>No FRF claims found.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  claims.map((claim: any) => (
                    <TableRow key={claim.id} className="hover:bg-green-50/30 dark:hover:bg-slate-800/50 dark:border-slate-800 transition-colors">
                      <TableCell>
                        <div className="font-medium text-green-950 dark:text-slate-200">{claim.claimantName}</div>
                        {claim.membershipId && (
                          <div className="text-xs text-green-600 dark:text-slate-500">ID: {claim.membershipId}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-green-800 dark:text-slate-300">
                          {CLAIM_TYPE_LABEL[claim.claimType as ClaimType] ?? claim.claimType}
                        </span>
                      </TableCell>
                      <TableCell>
                        {claim.beneficiaryName ? (
                          <div>
                            <div className="text-sm text-green-900 dark:text-slate-200">{claim.beneficiaryName}</div>
                            <div className="text-xs text-green-700/70 dark:text-slate-500 capitalize">{claim.beneficiaryRelation}</div>
                          </div>
                        ) : (
                          <span className="text-green-700/50 dark:text-slate-600">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-green-900 dark:text-slate-300 font-medium">
                        {formatSAR(claim.amountRequested)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-green-900 dark:text-green-300">
                        {claim.amountApproved > 0 ? formatSAR(claim.amountApproved) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("text-[11px] capitalize", STATUS_STYLE[claim.status as ClaimStatus] ?? "")}>
                          {claim.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-green-700 dark:text-slate-400">
                        {formatDate(claim.claimDate)}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7 dark:text-slate-400 dark:hover:bg-slate-800" onClick={() => openEdit(claim)}>
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            {canDelete && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:bg-slate-800" onClick={() => setDeletingClaim(claim)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isFormOpen || !!editingClaim} onOpenChange={(open) => { if (!open) { setIsFormOpen(false); setEditingClaim(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="sm:max-w-[540px] dark:bg-slate-900 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">{editingClaim ? "Edit FRF Claim" : "New FRF Claim"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium text-green-800 dark:text-slate-400">Claimant Name *</label>
                <Input value={form.claimantName} onChange={(e) => setForm((f) => ({ ...f, claimantName: e.target.value }))} placeholder="Full name" className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-green-800 dark:text-slate-400">Membership ID</label>
                <Input value={form.membershipId} onChange={(e) => setForm((f) => ({ ...f, membershipId: e.target.value }))} placeholder="DKMO-XXX" className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-green-800 dark:text-slate-400">Claim Type</label>
                <Select value={form.claimType} onValueChange={(v) => setForm((f) => ({ ...f, claimType: v as ClaimType }))}>
                  <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                    {CLAIM_TYPES.map((t) => <SelectItem key={t} value={t} className="dark:text-slate-300 dark:focus:bg-slate-800">{CLAIM_TYPE_LABEL[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-green-800 dark:text-slate-400">Amount Requested (SAR)</label>
                <Input type="number" min={0} value={form.amountRequested} onChange={(e) => setForm((f) => ({ ...f, amountRequested: Number(e.target.value) }))} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-green-800 dark:text-slate-400">Amount Approved (SAR)</label>
                <Input type="number" min={0} value={form.amountApproved} onChange={(e) => setForm((f) => ({ ...f, amountApproved: Number(e.target.value) }))} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-green-800 dark:text-slate-400">Status</label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as ClaimStatus }))}>
                  <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                    {CLAIM_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize dark:text-slate-300 dark:focus:bg-slate-800">{s.replace("_", " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-green-800 dark:text-slate-400">Beneficiary Name</label>
                <Input value={form.beneficiaryName} onChange={(e) => setForm((f) => ({ ...f, beneficiaryName: e.target.value }))} placeholder="Name of beneficiary" className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-green-800 dark:text-slate-400">Relation</label>
                <Input value={form.beneficiaryRelation} onChange={(e) => setForm((f) => ({ ...f, beneficiaryRelation: e.target.value }))} placeholder="e.g. Spouse, Son" className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium text-green-800 dark:text-slate-400">Description</label>
                <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Brief description of the claim" className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium text-green-800 dark:text-slate-400">Notes</label>
                <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Additional notes" className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => { setIsFormOpen(false); setEditingClaim(null); setForm(EMPTY_FORM); }} className="flex-1 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</Button>
              <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1 bg-green-700 hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700 text-white">
                {isSubmitting ? "Saving…" : editingClaim ? "Update Claim" : "Create Claim"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deletingClaim} onOpenChange={(open) => !open && setDeletingClaim(null)}>
        <AlertDialogContent className="dark:bg-slate-900 dark:border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-slate-100">Delete FRF Claim?</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-slate-400">
              This will permanently delete the claim for "{deletingClaim?.claimantName}". This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate({ id: deletingClaim.id })} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
