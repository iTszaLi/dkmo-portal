import { useState } from "react";
import { Link } from "wouter";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HeartHandshake, Plus, Trash2, Edit, CheckCircle2, Clock, XCircle, DollarSign,
  Users, Search, MoreHorizontal, Eye, Download, Printer,
  CheckCheck, CircleDot,
} from "lucide-react";
import { cn, formatSAR, formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { generateClaimPdf } from "@/lib/frf-claim-pdf";

type ClaimType = "death_benefit" | "emergency" | "air_ticket" | "other";
type ClaimStatus = "pending" | "under_review" | "approved" | "rejected" | "disbursed";

const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  death_benefit: "Death Benefit",
  emergency: "Emergency Assistance",
  air_ticket: "Air Ticket Support",
  other: "Other",
};

const STATUS_STYLE: Record<ClaimStatus, string> = {
  pending:      "bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300 ring-1 ring-orange-300/50",
  under_review: "bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 ring-1 ring-blue-300/50",
  approved:     "bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-300 ring-1 ring-green-300/50",
  rejected:     "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300 ring-1 ring-red-300/50",
  disbursed:    "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-300/50",
};

const CLAIM_TYPES: ClaimType[] = ["death_benefit", "emergency", "air_ticket", "other"];
const CLAIM_STATUSES: ClaimStatus[] = ["pending", "under_review", "approved", "rejected", "disbursed"];

type FrfClaimFull = {
  id: string;
  memberId?: string | null;
  title: string;
  caseStatus: string;
  closingDate: string | null;
  claimantName: string;
  membershipId: string;
  claimType: string;
  amountRequested: number;
  amountApproved: number;
  status: string;
  claimDate: string | null;
  approvedDate: string | null;
  approvedBy: string;
  underReviewAt: string | null;
  underReviewBy: string;
  disbursedAt: string | null;
  disbursedBy: string;
  rejectedBy: string;
  rejectedAt: string | null;
  reviewNotes: string;
  beneficiaryName: string;
  beneficiaryRelation: string;
  description: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type FrfClaimInput = {
  title: string;
  closingDate: string;
  claimantName: string;
  membershipId: string;
  claimType: ClaimType;
  amountRequested: number;
  amountApproved: number;
  contributionAmount: number;
  status: ClaimStatus;
  beneficiaryName: string;
  beneficiaryRelation: string;
  description: string;
  notes: string;
  reviewNotes: string;
};

const EMPTY_FORM: FrfClaimInput = {
  title: "",
  closingDate: "",
  claimantName: "",
  membershipId: "",
  claimType: "death_benefit",
  amountRequested: 0,
  amountApproved: 0,
  contributionAmount: 50,
  status: "pending",
  beneficiaryName: "",
  beneficiaryRelation: "",
  description: "",
  notes: "",
  reviewNotes: "",
};

// ── Timeline component ────────────────────────────────────────────────────────

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface TimelineStep {
  label: string;
  date: string | null | undefined;
  by?: string;
  done: boolean;
  active?: boolean;
  rejected?: boolean;
}

function StatusTimeline({ claim }: { claim: FrfClaimFull }) {
  const steps: TimelineStep[] = [
    { label: "Submitted", date: claim.claimDate ?? claim.createdAt, by: claim.claimantName, done: true },
    { label: "Under Review", date: claim.underReviewAt, by: claim.underReviewBy || undefined, done: !!claim.underReviewAt, active: claim.status === "under_review" },
  ];

  if (claim.status === "rejected") {
    steps.push({ label: "Rejected", date: claim.rejectedAt, by: claim.rejectedBy || undefined, done: true, rejected: true });
  } else {
    steps.push({ label: "Approved", date: claim.approvedDate, by: claim.approvedBy || undefined, done: !!claim.approvedDate, active: claim.status === "approved" });
    steps.push({ label: "Disbursed", date: claim.disbursedAt, by: claim.disbursedBy || undefined, done: !!claim.disbursedAt, active: claim.status === "disbursed" });
  }

  return (
    <div className="space-y-0">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div className={cn(
              "h-7 w-7 rounded-full border-2 flex items-center justify-center shrink-0 text-xs font-bold mt-1",
              step.done && !step.rejected ? "bg-green-600 border-green-600 text-white" :
              step.rejected ? "bg-red-500 border-red-500 text-white" :
              step.active ? "border-blue-400 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400" :
              "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-400"
            )}>
              {step.done && !step.rejected ? <CheckCheck className="h-3.5 w-3.5" /> :
               step.rejected ? <XCircle className="h-3.5 w-3.5" /> :
               step.active ? <CircleDot className="h-3.5 w-3.5" /> :
               <span>{i + 1}</span>}
            </div>
            {i < steps.length - 1 && (
              <div className={cn("w-0.5 h-8", step.done ? "bg-green-300 dark:bg-green-700" : "bg-slate-200 dark:bg-slate-700")} />
            )}
          </div>
          <div className="pb-4 flex-1">
            <p className={cn("text-sm font-semibold", step.rejected ? "text-red-600 dark:text-red-400" : step.done ? "text-green-800 dark:text-green-300" : step.active ? "text-blue-700 dark:text-blue-400" : "text-slate-400 dark:text-slate-500")}>
              {step.label}
            </p>
            {step.done ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">{fmt(step.date)}{step.by ? ` · by ${step.by}` : ""}</p>
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-600 italic">Pending</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Frf() {
  const { canEdit, canDelete } = useAuth();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingClaim, setEditingClaim] = useState<FrfClaimFull | null>(null);
  const [deletingClaim, setDeletingClaim] = useState<FrfClaimFull | null>(null);
  const [viewingClaim, setViewingClaim] = useState<FrfClaimFull | null>(null);
  const [form, setForm] = useState<FrfClaimInput>(EMPTY_FORM);

  // Quick status action state
  const [approvingClaim, setApprovingClaim] = useState<FrfClaimFull | null>(null);
  const [rejectingClaim, setRejectingClaim] = useState<FrfClaimFull | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [disbursingClaim, setDisbursingClaim] = useState<FrfClaimFull | null>(null);
  const [isSubmittingQuick, setIsSubmittingQuick] = useState(false);

  const { data: rawClaims = [], isLoading, refetch } = useListFrfClaims({
    status: statusFilter !== "all" ? statusFilter : undefined,
    claimType: typeFilter !== "all" ? typeFilter : undefined,
  });

  const claims = (searchText.trim()
    ? rawClaims.filter((c) => {
        const q = searchText.toLowerCase();
        return (
          c.claimantName?.toLowerCase().includes(q) ||
          c.membershipId?.toLowerCase().includes(q) ||
          c.beneficiaryName?.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q)
        );
      })
    : rawClaims) as unknown as FrfClaimFull[];

  const { data: stats } = useGetFrfStats();

  const createMutation = useCreateFrfClaim({ mutation: { onSuccess: () => { refetch(); setIsFormOpen(false); setForm(EMPTY_FORM); toast({ title: "FRF claim created" }); }, onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }) } });
  const updateMutation = useUpdateFrfClaim({ mutation: { onSuccess: (data) => { refetch(); setEditingClaim(null); setForm(EMPTY_FORM); toast({ title: "Claim updated" }); if (viewingClaim) setViewingClaim(data as unknown as FrfClaimFull); }, onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }) } });
  const deleteMutation = useDeleteFrfClaim({ mutation: { onSuccess: () => { refetch(); setDeletingClaim(null); toast({ title: "Claim deleted" }); }, onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }) } });

  const openEdit = (claim: FrfClaimFull) => {
    setEditingClaim(claim);
    setForm({
      title: claim.title ?? "",
      closingDate: claim.closingDate ? claim.closingDate.slice(0, 10) : "",
      claimantName: claim.claimantName,
      membershipId: claim.membershipId,
      claimType: claim.claimType as ClaimType,
      amountRequested: claim.amountRequested,
      amountApproved: claim.amountApproved,
      contributionAmount: (claim as any).contributionAmount ?? 50,
      status: claim.status as ClaimStatus,
      beneficiaryName: claim.beneficiaryName,
      beneficiaryRelation: claim.beneficiaryRelation,
      description: claim.description,
      notes: claim.notes,
      reviewNotes: claim.reviewNotes,
    });
  };

  const handleSubmit = () => {
    if (!form.claimantName.trim()) { toast({ title: "Claimant name is required", variant: "destructive" }); return; }
    const payload = {
      ...form,
      closingDate: form.closingDate ? new Date(form.closingDate).toISOString() : null,
    };
    if (editingClaim) {
      updateMutation.mutate({ id: editingClaim.id, data: payload as any });
    } else {
      createMutation.mutate({ data: payload as any });
    }
  };

  async function handleQuickStatus(claim: FrfClaimFull, status: ClaimStatus, notes?: string) {
    setIsSubmittingQuick(true);
    try {
      await updateMutation.mutateAsync({ id: claim.id, data: { status, ...(notes ? { reviewNotes: notes } : {}) } as any });
      toast({ title: `Status updated to ${status.replace("_", " ")}` });
      void refetch();
    } finally {
      setIsSubmittingQuick(false);
    }
  }

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
          <Button onClick={() => { setForm(EMPTY_FORM); setEditingClaim(null); setIsFormOpen(true); }}
            className="bg-green-700 hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700 text-white">
            <Plus className="h-4 w-4 mr-1" /> New Claim
          </Button>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { title: "Total Claims", value: stats.total, icon: Users, color: "text-green-700 dark:text-green-400", sub: "All time" },
            { title: "Pending", value: stats.pendingCount, icon: Clock, color: "text-orange-600 dark:text-orange-400", sub: "Awaiting review", border: "border-orange-100 dark:border-orange-900/40" },
            { title: "Approved", value: stats.approvedCount, icon: CheckCircle2, color: "text-green-700 dark:text-green-400", sub: "Approved & disbursed" },
            { title: "Total Disbursed", value: formatSAR(stats.totalDisbursed), icon: DollarSign, color: "text-green-700 dark:text-green-400", sub: "Relief provided" },
          ].map(({ title, value, icon: Icon, color, sub, border }) => (
            <Card key={title} className={`rounded-2xl ${border ?? "border-green-100 dark:border-slate-800"} dark:bg-slate-900 shadow-sm`}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-green-900 dark:text-slate-300">{title}</CardTitle>
                <Icon className={`h-4 w-4 ${color}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
                <p className="text-xs text-green-700/70 dark:text-slate-500 mt-1">{sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Breakdown */}
      {(stats?.byType?.length ?? 0) > 0 && (
        <div className="grid gap-3 sm:grid-cols-4">
          {(stats?.byType ?? []).map((t: any) => (
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
              <CardDescription className="dark:text-slate-400">{isLoading ? "Loading…" : `${claims.length} claim${claims.length === 1 ? "" : "s"}`}</CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-400 dark:text-slate-500" />
                <Input placeholder="Search claimant, ID, beneficiary…" value={searchText} onChange={(e) => setSearchText(e.target.value)}
                  className="pl-9 h-9 border-green-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px] dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                  <SelectItem value="all" className="dark:text-slate-300">All statuses</SelectItem>
                  {CLAIM_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize dark:text-slate-300">{s.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[160px] dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                  <SelectItem value="all" className="dark:text-slate-300">All types</SelectItem>
                  {CLAIM_TYPES.map((t) => <SelectItem key={t} value={t} className="dark:text-slate-300">{CLAIM_TYPE_LABEL[t]}</SelectItem>)}
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
                  <TableHead className="dark:text-slate-300 w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i} className="dark:border-slate-800">
                      {Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
                    </TableRow>
                  ))
                ) : claims.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-green-600 dark:text-slate-500">
                      <div className="flex flex-col items-center gap-2">
                        <HeartHandshake className="h-8 w-8 text-green-200 dark:text-slate-700" />
                        <p>No FRF claims found.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  claims.map((claim) => (
                    <TableRow key={claim.id} className="hover:bg-green-50/30 dark:hover:bg-slate-800/50 dark:border-slate-800 transition-colors">
                      <TableCell>
                        <Link href={`/frf/${claim.id}`} className="block hover:underline">
                          {claim.title && <div className="text-xs font-semibold text-green-700 dark:text-green-400">{claim.title}</div>}
                          <div className="font-medium text-green-950 dark:text-slate-200">{claim.claimantName}</div>
                          {claim.membershipId && <div className="text-xs text-green-600 dark:text-slate-500">ID: {claim.membershipId}</div>}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-green-800 dark:text-slate-300">{CLAIM_TYPE_LABEL[claim.claimType as ClaimType] ?? claim.claimType}</span>
                      </TableCell>
                      <TableCell>
                        {claim.beneficiaryName ? (
                          <div>
                            <div className="text-sm text-green-900 dark:text-slate-200">{claim.beneficiaryName}</div>
                            <div className="text-xs text-green-700/70 dark:text-slate-500 capitalize">{claim.beneficiaryRelation}</div>
                          </div>
                        ) : <span className="text-green-700/50 dark:text-slate-600">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-green-900 dark:text-slate-300 font-medium">{formatSAR(claim.amountRequested)}</TableCell>
                      <TableCell className="text-right font-bold text-green-900 dark:text-green-300">
                        {claim.amountApproved > 0 ? formatSAR(claim.amountApproved) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("text-[11px] capitalize", STATUS_STYLE[claim.status as ClaimStatus] ?? "")}>
                          {claim.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-green-700 dark:text-slate-400">{formatDate(claim.claimDate)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 dark:text-slate-400 hover:bg-green-50 dark:hover:bg-slate-800">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52 dark:bg-slate-900 dark:border-slate-800">
                            <DropdownMenuLabel className="text-xs dark:text-slate-400">Claim Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator className="dark:border-slate-700" />
                            <DropdownMenuItem onClick={() => setViewingClaim(claim)} className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800">
                              <Eye className="h-3.5 w-3.5 text-green-600" /> View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800">
                              <Link href={`/frf/${claim.id}`}>
                                <Users className="h-3.5 w-3.5 text-green-600" /> Collection Details
                              </Link>
                            </DropdownMenuItem>
                            {canEdit && (
                              <DropdownMenuItem onClick={() => openEdit(claim)} className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800">
                                <Edit className="h-3.5 w-3.5 text-blue-500" /> Edit
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator className="dark:border-slate-700" />
                            {canEdit && claim.status !== "under_review" && (
                              <DropdownMenuItem onClick={() => handleQuickStatus(claim, "under_review")} disabled={isSubmittingQuick} className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800">
                                <Clock className="h-3.5 w-3.5 text-yellow-500" /> Mark Under Review
                              </DropdownMenuItem>
                            )}
                            {canEdit && claim.status !== "approved" && claim.status !== "disbursed" && claim.status !== "rejected" && (
                              <DropdownMenuItem onClick={() => setApprovingClaim(claim)} className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800">
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Approve
                              </DropdownMenuItem>
                            )}
                            {canEdit && claim.status !== "rejected" && claim.status !== "disbursed" && (
                              <DropdownMenuItem onClick={() => { setRejectingClaim(claim); setRejectNotes(""); }} className="gap-2 cursor-pointer text-red-600 dark:text-red-400 dark:focus:bg-slate-800">
                                <XCircle className="h-3.5 w-3.5" /> Reject
                              </DropdownMenuItem>
                            )}
                            {canEdit && claim.status === "approved" && (
                              <DropdownMenuItem onClick={() => setDisbursingClaim(claim)} className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800">
                                <DollarSign className="h-3.5 w-3.5 text-emerald-600" /> Mark Disbursed
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator className="dark:border-slate-700" />
                            <DropdownMenuItem onClick={() => generateClaimPdf(claim)} className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800">
                              <Download className="h-3.5 w-3.5 text-slate-500" /> Download PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => window.print()} className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800">
                              <Printer className="h-3.5 w-3.5 text-slate-500" /> Print
                            </DropdownMenuItem>
                            {canDelete && (
                              <>
                                <DropdownMenuSeparator className="dark:border-slate-700" />
                                <DropdownMenuItem onClick={() => setDeletingClaim(claim)} className="gap-2 cursor-pointer text-red-600 dark:text-red-400 dark:focus:bg-slate-800">
                                  <Trash2 className="h-3.5 w-3.5" /> Delete
                                </DropdownMenuItem>
                              </>
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
        </CardContent>
      </Card>

      {/* View Detail Dialog */}
      <Dialog open={!!viewingClaim} onOpenChange={(o) => !o && setViewingClaim(null)}>
        <DialogContent className="sm:max-w-xl dark:bg-slate-900 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
          {viewingClaim && (
            <>
              <DialogHeader>
                <DialogTitle className="text-green-950 dark:text-green-100 flex items-center gap-2">
                  <HeartHandshake className="h-5 w-5 text-green-600" />
                  {viewingClaim.claimantName}
                </DialogTitle>
                <DialogDescription className="dark:text-slate-400">
                  {CLAIM_TYPE_LABEL[viewingClaim.claimType as ClaimType] ?? viewingClaim.claimType} · ID: {viewingClaim.membershipId || "—"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5 py-2">
                {/* Status badge */}
                <div className="flex items-center gap-3">
                  <Badge className={cn("text-xs capitalize px-3 py-1", STATUS_STYLE[viewingClaim.status as ClaimStatus] ?? "")}>
                    {viewingClaim.status.replace("_", " ")}
                  </Badge>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Filed: {formatDate(viewingClaim.claimDate)}</span>
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Amount Requested</span><span className="font-semibold text-green-900 dark:text-slate-200">{formatSAR(viewingClaim.amountRequested)}</span></div>
                  <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Amount Approved</span><span className="font-bold text-green-700 dark:text-green-300">{viewingClaim.amountApproved > 0 ? formatSAR(viewingClaim.amountApproved) : "—"}</span></div>
                  <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Beneficiary</span><span className="font-medium text-green-900 dark:text-slate-200">{viewingClaim.beneficiaryName || "—"}</span></div>
                  <div><span className="text-xs text-slate-500 dark:text-slate-400 block">Relation</span><span className="font-medium text-green-900 dark:text-slate-200">{viewingClaim.beneficiaryRelation || "—"}</span></div>
                  {viewingClaim.description && <div className="col-span-2"><span className="text-xs text-slate-500 dark:text-slate-400 block">Description</span><span className="text-green-900 dark:text-slate-200">{viewingClaim.description}</span></div>}
                  {viewingClaim.notes && <div className="col-span-2"><span className="text-xs text-slate-500 dark:text-slate-400 block">Notes</span><span className="text-green-900 dark:text-slate-200">{viewingClaim.notes}</span></div>}
                  {viewingClaim.reviewNotes && <div className="col-span-2"><span className="text-xs text-slate-500 dark:text-slate-400 block">Review Notes</span><span className="text-amber-700 dark:text-amber-300">{viewingClaim.reviewNotes}</span></div>}
                </div>

                <Separator className="dark:border-slate-700" />

                {/* Timeline */}
                <div>
                  <p className="text-xs font-semibold text-green-800 dark:text-green-300 uppercase tracking-wider mb-3">Status Timeline</p>
                  <StatusTimeline claim={viewingClaim} />
                </div>
              </div>
              <DialogFooter className="gap-2 flex-wrap">
                {canEdit && viewingClaim.status === "under_review" && (
                  <Button size="sm" className="bg-green-700 hover:bg-green-800 text-white" onClick={() => { setApprovingClaim(viewingClaim); setViewingClaim(null); }}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Approve
                  </Button>
                )}
                {canEdit && viewingClaim.status === "approved" && (
                  <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white" onClick={() => { setDisbursingClaim(viewingClaim); setViewingClaim(null); }}>
                    <DollarSign className="h-3.5 w-3.5 mr-1.5" /> Mark Disbursed
                  </Button>
                )}
                <Button size="sm" variant="outline" className="dark:border-slate-700" onClick={() => generateClaimPdf(viewingClaim)}>
                  <Download className="h-3.5 w-3.5 mr-1.5" /> PDF
                </Button>
                <Button size="sm" variant="outline" className="dark:border-slate-700" onClick={() => setViewingClaim(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Approve Confirmation */}
      <AlertDialog open={!!approvingClaim} onOpenChange={(o) => !o && setApprovingClaim(null)}>
        <AlertDialogContent className="dark:bg-slate-900 dark:border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-green-800 dark:text-green-300">Approve Claim?</AlertDialogTitle>
            <AlertDialogDescription>
              Approve the {CLAIM_TYPE_LABEL[approvingClaim?.claimType as ClaimType] ?? ""} claim for <strong>{approvingClaim?.claimantName}</strong>? Amount: {formatSAR(approvingClaim?.amountApproved ?? 0)}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-slate-700">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-green-700 hover:bg-green-800 text-white" disabled={isSubmittingQuick}
              onClick={async () => { if (approvingClaim) { await handleQuickStatus(approvingClaim, "approved"); setApprovingClaim(null); } }}>
              {isSubmittingQuick ? "Approving…" : "Approve Claim"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejectingClaim} onOpenChange={(o) => !o && setRejectingClaim(null)}>
        <DialogContent className="sm:max-w-md dark:bg-slate-900 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-red-700 dark:text-red-400">Reject Claim</DialogTitle>
            <DialogDescription>Provide the reason for rejecting this claim from <strong>{rejectingClaim?.claimantName}</strong>.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-sm font-medium">Review Notes / Reason <span className="text-red-500">*</span></Label>
            <Textarea placeholder="Reason for rejection…" value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)}
              rows={4} className="border-red-200 dark:border-slate-700 dark:bg-slate-800/60 resize-none" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingClaim(null)} className="dark:border-slate-700">Cancel</Button>
            <Button onClick={async () => { if (rejectingClaim) { await handleQuickStatus(rejectingClaim, "rejected", rejectNotes.trim()); setRejectingClaim(null); setRejectNotes(""); } }}
              disabled={!rejectNotes.trim() || isSubmittingQuick} className="bg-red-600 hover:bg-red-700 text-white">
              {isSubmittingQuick ? "Rejecting…" : "Reject Claim"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disburse Confirmation */}
      <AlertDialog open={!!disbursingClaim} onOpenChange={(o) => !o && setDisbursingClaim(null)}>
        <AlertDialogContent className="dark:bg-slate-900 dark:border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-emerald-700 dark:text-emerald-400">Mark as Disbursed?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm that the approved amount of <strong>{formatSAR(disbursingClaim?.amountApproved ?? 0)}</strong> has been disbursed to <strong>{disbursingClaim?.claimantName}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-slate-700">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-emerald-700 hover:bg-emerald-800 text-white" disabled={isSubmittingQuick}
              onClick={async () => { if (disbursingClaim) { await handleQuickStatus(disbursingClaim, "disbursed"); setDisbursingClaim(null); } }}>
              {isSubmittingQuick ? "Updating…" : "Confirm Disbursement"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete */}
      <AlertDialog open={!!deletingClaim} onOpenChange={(o) => !o && setDeletingClaim(null)}>
        <AlertDialogContent className="dark:bg-slate-900 dark:border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete FRF Claim?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the claim for {deletingClaim?.claimantName}.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-slate-700">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deletingClaim && deleteMutation.mutate({ id: deletingClaim.id })}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create/Edit Dialog */}
      <Dialog open={isFormOpen || !!editingClaim} onOpenChange={(open) => { if (!open) { setIsFormOpen(false); setEditingClaim(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="sm:max-w-[540px] dark:bg-slate-900 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">{editingClaim ? "Edit FRF Claim" : "New FRF Claim"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium text-green-800 dark:text-slate-400">Case Title</label>
                <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. FRF Case — Family of Late Ahmed" className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
              </div>
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
                    {CLAIM_TYPES.map((t) => <SelectItem key={t} value={t} className="dark:text-slate-300">{CLAIM_TYPE_LABEL[t]}</SelectItem>)}
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
                <label className="text-xs font-medium text-green-800 dark:text-slate-400">Contribution per Member (SAR)</label>
                <Input type="number" min={0} value={form.contributionAmount} onChange={(e) => setForm((f) => ({ ...f, contributionAmount: Number(e.target.value) }))} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-green-800 dark:text-slate-400">Status</label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as ClaimStatus }))}>
                  <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                    {CLAIM_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize dark:text-slate-300">{s.replace("_", " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-green-800 dark:text-slate-400">Closing Date</label>
                <Input type="date" value={form.closingDate} onChange={(e) => setForm((f) => ({ ...f, closingDate: e.target.value }))} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
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
                <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Brief description" className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium text-green-800 dark:text-slate-400">Notes</label>
                <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Additional notes" rows={2} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 resize-none" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium text-green-800 dark:text-slate-400">Review Notes</label>
                <Textarea value={form.reviewNotes} onChange={(e) => setForm((f) => ({ ...f, reviewNotes: e.target.value }))} placeholder="Reviewer notes / rejection reason" rows={2} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 resize-none" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsFormOpen(false); setEditingClaim(null); setForm(EMPTY_FORM); }} className="dark:border-slate-700 dark:text-slate-300">Cancel</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-green-700 hover:bg-green-800 text-white">
              {isSubmitting ? "Saving…" : editingClaim ? "Update Claim" : "Create Claim"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
