import { useMemo, useRef, useState } from "react";
import {
  useListWelfareRequests,
  useGetWelfareStats,
  useCreateWelfareRequest,
  useUpdateWelfareRequest,
  useDeleteWelfareRequest,
  type WelfareRequest,
  type WelfareRequestInput,
  type WelfareRequestUpdate,
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
  Plus, Trash2, Edit, CheckCircle2, Clock, XCircle, DollarSign,
  Users, Search, MoreHorizontal, Eye, FileText, Upload, Loader2,
  CheckCheck, CircleDot, Paperclip, Flag,
} from "lucide-react";
import { cn, formatSAR, formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { MemberRefPicker, type MemberRefEntry } from "@/components/MemberRefPicker";
import {
  SERVICE_CONFIG, STATUS_LABEL, STATUS_STYLE, WELFARE_STATUSES,
  type ServiceType, type WelfareStatus,
} from "@/lib/welfare-config";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type DocEntry = { name: string; url: string; uploadedAt?: string };

interface FormState {
  applicantName: string;
  membershipId: string;
  contactNumber: string;
  status: WelfareStatus;
  amountRequested: number;
  amountApproved: number;
  description: string;
  details: Record<string, unknown>;
  assignedTo: string;
  approvalNotes: string;
}

function emptyForm(): FormState {
  return {
    applicantName: "",
    membershipId: "",
    contactNumber: "",
    status: "submitted",
    amountRequested: 0,
    amountApproved: 0,
    description: "",
    details: {},
    assignedTo: "",
    approvalNotes: "",
  };
}

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Timeline ──────────────────────────────────────────────────────────────────

interface TimelineStep { label: string; date: string | null | undefined; by?: string; done: boolean; active?: boolean; rejected?: boolean; }

function StatusTimeline({ req }: { req: WelfareRequest }) {
  const steps: TimelineStep[] = [
    { label: "Submitted", date: req.submittedAt ?? req.createdAt, by: req.applicantName, done: true },
    { label: "Under Review", date: req.underReviewAt, by: req.underReviewBy || undefined, done: !!req.underReviewAt, active: req.status === "under_review" },
  ];
  if (req.status === "rejected") {
    steps.push({ label: "Rejected", date: req.rejectedAt, by: req.rejectedBy || undefined, done: true, rejected: true });
  } else {
    steps.push({ label: "Approved", date: req.approvedAt, by: req.approvedBy || undefined, done: !!req.approvedAt, active: req.status === "approved" });
    steps.push({ label: "Completed", date: req.completedAt, by: req.completedBy || undefined, done: !!req.completedAt, active: req.status === "completed" });
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

// ── Main ────────────────────────────────────────────────────────────────────

export default function WelfareModule({ serviceType }: { serviceType: ServiceType }) {
  const config = SERVICE_CONFIG[serviceType];
  const { canEdit, canDelete } = useAuth();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<WelfareRequest | null>(null);
  const [deleting, setDeleting] = useState<WelfareRequest | null>(null);
  const [viewing, setViewing] = useState<WelfareRequest | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [memberRef, setMemberRef] = useState<MemberRefEntry | null>(null);
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rejecting, setRejecting] = useState<WelfareRequest | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [isSubmittingQuick, setIsSubmittingQuick] = useState(false);

  const { data: rawRequests = [], isLoading, refetch } = useListWelfareRequests({
    serviceType,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });
  const { data: stats } = useGetWelfareStats({ serviceType });

  const requests = useMemo(() => {
    const list = rawRequests as WelfareRequest[];
    if (!searchText.trim()) return list;
    const q = searchText.toLowerCase();
    return list.filter((r) =>
      r.applicantName?.toLowerCase().includes(q) ||
      r.membershipId?.toLowerCase().includes(q) ||
      r.requestNumber?.toLowerCase().includes(q) ||
      r.description?.toLowerCase().includes(q),
    );
  }, [rawRequests, searchText]);

  const createMutation = useCreateWelfareRequest({ mutation: { onSuccess: () => { refetch(); closeForm(); toast({ title: "Request created" }); }, onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }) } });
  const updateMutation = useUpdateWelfareRequest({ mutation: { onSuccess: (data) => { refetch(); closeForm(); toast({ title: "Request updated" }); if (viewing) setViewing(data as WelfareRequest); }, onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }) } });
  const deleteMutation = useDeleteWelfareRequest({ mutation: { onSuccess: () => { refetch(); setDeleting(null); toast({ title: "Request deleted" }); }, onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }) } });

  function closeForm() {
    setIsFormOpen(false);
    setEditing(null);
    setForm(emptyForm());
    setMemberRef(null);
    setDocs([]);
  }

  function openNew() {
    setForm(emptyForm());
    setEditing(null);
    setMemberRef(null);
    setDocs([]);
    setIsFormOpen(true);
  }

  function openEdit(req: WelfareRequest) {
    setEditing(req);
    setForm({
      applicantName: req.applicantName,
      membershipId: req.membershipId,
      contactNumber: req.contactNumber,
      status: req.status as WelfareStatus,
      amountRequested: req.amountRequested,
      amountApproved: req.amountApproved,
      description: req.description,
      details: { ...(req.details as Record<string, unknown>) },
      assignedTo: req.assignedTo,
      approvalNotes: req.approvalNotes,
    });
    setMemberRef(req.memberId ? { id: req.memberId, fullName: req.applicantName, membershipId: req.membershipId } : null);
    setDocs((req.supportingDocuments as DocEntry[]) ?? []);
    setIsFormOpen(true);
  }

  function setDetail(key: string, value: unknown) {
    setForm((f) => ({ ...f, details: { ...f.details, [key]: value } }));
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const res = await fetch(`${basePath}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!res.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await res.json();
      const put = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
      if (!put.ok) throw new Error("Upload failed");
      const viewUrl = `${basePath}/api/storage${objectPath}`;
      setDocs((d) => [...d, { name: file.name, url: viewUrl, uploadedAt: new Date().toISOString() }]);
      toast({ title: "File uploaded" });
    } catch (e) {
      toast({ title: "Upload error", description: String(e), variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleSubmit() {
    if (!form.applicantName.trim()) { toast({ title: "Applicant name is required", variant: "destructive" }); return; }
    const payload: WelfareRequestInput = {
      serviceType,
      memberId: memberRef?.id ?? null,
      applicantName: form.applicantName,
      membershipId: memberRef?.membershipId || form.membershipId,
      contactNumber: form.contactNumber,
      status: form.status,
      amountRequested: form.amountRequested,
      amountApproved: form.amountApproved,
      description: form.description,
      details: form.details,
      supportingDocuments: docs,
      assignedTo: form.assignedTo,
      approvalNotes: form.approvalNotes,
    };
    if (editing) updateMutation.mutate({ id: editing.id, data: payload });
    else createMutation.mutate({ data: payload });
  }

  async function quickStatus(req: WelfareRequest, status: WelfareStatus, notes?: string) {
    setIsSubmittingQuick(true);
    try {
      const data: WelfareRequestUpdate = { status, ...(notes ? { approvalNotes: notes } : {}) };
      await updateMutation.mutateAsync({ id: req.id, data });
      toast({ title: `Marked ${STATUS_LABEL[status]}` });
      void refetch();
      setRejecting(null);
    } finally {
      setIsSubmittingQuick(false);
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const Icon = config.icon;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", config.tile)}>
            <Icon className={cn("h-6 w-6", config.accent)} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-green-950 dark:text-green-100">{config.label}</h1>
            <p className="text-green-800/70 dark:text-slate-400 mt-0.5 text-sm max-w-2xl">{config.description}</p>
          </div>
        </div>
        {canEdit && (
          <Button onClick={openNew} className="bg-green-700 hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700 text-white shrink-0">
            <Plus className="h-4 w-4 mr-1" /> New Request
          </Button>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { title: "Total Requests", value: stats.total, icon: Users, color: "text-green-700 dark:text-green-400", sub: "All time" },
            { title: "Pending", value: stats.submittedCount + stats.underReviewCount, icon: Clock, color: "text-orange-600 dark:text-orange-400", sub: "Submitted & under review", border: "border-orange-100 dark:border-orange-900/40" },
            { title: "Approved", value: stats.approvedCount + stats.completedCount, icon: CheckCircle2, color: "text-green-700 dark:text-green-400", sub: "Approved & completed" },
            ...(config.hasAmount
              ? [{ title: "Total Approved", value: formatSAR(stats.totalApproved), icon: DollarSign, color: "text-green-700 dark:text-green-400", sub: "Assistance granted" }]
              : [{ title: "Completed", value: stats.completedCount, icon: Flag, color: "text-emerald-700 dark:text-emerald-400", sub: "Closed cases" }]),
          ].map(({ title, value, icon: I, color, sub, border }) => (
            <Card key={title} className={`rounded-2xl ${border ?? "border-green-100 dark:border-slate-800"} dark:bg-slate-900 shadow-sm`}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-green-900 dark:text-slate-300">{title}</CardTitle>
                <I className={`h-4 w-4 ${color}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
                <p className="text-xs text-green-700/70 dark:text-slate-500 mt-1">{sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters + Table */}
      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <CardTitle className="text-base text-green-950 dark:text-green-100">Request Register</CardTitle>
              <CardDescription className="dark:text-slate-400">{isLoading ? "Loading…" : `${requests.length} request${requests.length === 1 ? "" : "s"}`}</CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-400 dark:text-slate-500" />
                <Input placeholder="Search name, ID, number…" value={searchText} onChange={(e) => setSearchText(e.target.value)}
                  className="pl-9 h-9 border-green-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px] dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                  <SelectItem value="all" className="dark:text-slate-300">All statuses</SelectItem>
                  {WELFARE_STATUSES.map((s) => <SelectItem key={s} value={s} className="dark:text-slate-300">{STATUS_LABEL[s]}</SelectItem>)}
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
                  <TableHead className="dark:text-slate-300">Request #</TableHead>
                  <TableHead className="dark:text-slate-300">Applicant</TableHead>
                  {config.hasAmount && <TableHead className="text-right dark:text-slate-300">Requested</TableHead>}
                  {config.hasAmount && <TableHead className="text-right dark:text-slate-300">Approved</TableHead>}
                  <TableHead className="dark:text-slate-300">Status</TableHead>
                  <TableHead className="dark:text-slate-300">Assigned To</TableHead>
                  <TableHead className="dark:text-slate-300">Date</TableHead>
                  <TableHead className="dark:text-slate-300 w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i} className="dark:border-slate-800">
                      {Array.from({ length: config.hasAmount ? 8 : 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
                    </TableRow>
                  ))
                ) : requests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={config.hasAmount ? 8 : 6} className="h-24 text-center text-green-600 dark:text-slate-500">
                      <div className="flex flex-col items-center gap-2">
                        <Icon className="h-8 w-8 text-green-200 dark:text-slate-700" />
                        <p>No requests found.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  requests.map((req) => (
                    <TableRow key={req.id} className="hover:bg-green-50/30 dark:hover:bg-slate-800/50 dark:border-slate-800 transition-colors">
                      <TableCell className="font-mono text-xs text-green-700 dark:text-slate-400">{req.requestNumber}</TableCell>
                      <TableCell>
                        <div className="font-medium text-green-950 dark:text-slate-200">{req.applicantName}</div>
                        {req.membershipId && <div className="text-xs text-green-600 dark:text-slate-500">ID: {req.membershipId}</div>}
                      </TableCell>
                      {config.hasAmount && <TableCell className="text-right text-green-900 dark:text-slate-300 font-medium">{formatSAR(req.amountRequested)}</TableCell>}
                      {config.hasAmount && <TableCell className="text-right font-bold text-green-900 dark:text-green-300">{req.amountApproved > 0 ? formatSAR(req.amountApproved) : "—"}</TableCell>}
                      <TableCell>
                        <Badge className={cn("text-[11px]", STATUS_STYLE[req.status as WelfareStatus] ?? "")}>{STATUS_LABEL[req.status as WelfareStatus] ?? req.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-green-800 dark:text-slate-400">{req.assignedTo || "—"}</TableCell>
                      <TableCell className="text-sm text-green-700 dark:text-slate-400">{formatDate(req.submittedAt)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 dark:text-slate-400 hover:bg-green-50 dark:hover:bg-slate-800">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52 dark:bg-slate-900 dark:border-slate-800">
                            <DropdownMenuLabel className="text-xs dark:text-slate-400">Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator className="dark:border-slate-700" />
                            <DropdownMenuItem onClick={() => setViewing(req)} className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800">
                              <Eye className="h-3.5 w-3.5 text-green-600" /> View Details
                            </DropdownMenuItem>
                            {canEdit && (
                              <DropdownMenuItem onClick={() => openEdit(req)} className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800">
                                <Edit className="h-3.5 w-3.5 text-blue-500" /> Edit
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator className="dark:border-slate-700" />
                            {canEdit && req.status !== "under_review" && req.status !== "completed" && req.status !== "rejected" && (
                              <DropdownMenuItem onClick={() => quickStatus(req, "under_review")} disabled={isSubmittingQuick} className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800">
                                <Clock className="h-3.5 w-3.5 text-yellow-500" /> Mark Under Review
                              </DropdownMenuItem>
                            )}
                            {canEdit && req.status !== "approved" && req.status !== "completed" && req.status !== "rejected" && (
                              <DropdownMenuItem onClick={() => quickStatus(req, "approved")} disabled={isSubmittingQuick} className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800">
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Approve
                              </DropdownMenuItem>
                            )}
                            {canEdit && req.status === "approved" && (
                              <DropdownMenuItem onClick={() => quickStatus(req, "completed")} disabled={isSubmittingQuick} className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800">
                                <Flag className="h-3.5 w-3.5 text-emerald-600" /> Mark Completed
                              </DropdownMenuItem>
                            )}
                            {canEdit && req.status !== "rejected" && req.status !== "completed" && (
                              <DropdownMenuItem onClick={() => { setRejecting(req); setRejectNotes(""); }} className="gap-2 cursor-pointer text-red-600 dark:text-red-400 dark:focus:bg-slate-800">
                                <XCircle className="h-3.5 w-3.5" /> Reject
                              </DropdownMenuItem>
                            )}
                            {canDelete && (
                              <>
                                <DropdownMenuSeparator className="dark:border-slate-700" />
                                <DropdownMenuItem onClick={() => setDeleting(req)} className="gap-2 cursor-pointer text-red-600 dark:text-red-400 dark:focus:bg-slate-800">
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

      {/* Create / Edit dialog */}
      <Dialog open={isFormOpen} onOpenChange={(o) => { if (!o) closeForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-slate-900 dark:border-slate-800">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">{editing ? `Edit ${config.label} Request` : `New ${config.label} Request`}</DialogTitle>
            <DialogDescription className="dark:text-slate-400">{editing ? editing.requestNumber : "Capture the applicant and request details."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="dark:text-slate-300">Link Member (optional)</Label>
              <MemberRefPicker value={memberRef} onChange={(m) => { setMemberRef(m); if (m) setForm((f) => ({ ...f, applicantName: f.applicantName || m.fullName, membershipId: m.membershipId })); }} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="dark:text-slate-300">Applicant Name *</Label>
                <Input value={form.applicantName} onChange={(e) => setForm((f) => ({ ...f, applicantName: e.target.value }))} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="dark:text-slate-300">Contact Number</Label>
                <Input value={form.contactNumber} onChange={(e) => setForm((f) => ({ ...f, contactNumber: e.target.value }))} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
              </div>
            </div>

            {/* Type-specific fields */}
            <div className="grid sm:grid-cols-2 gap-4">
              {config.fields.map((fld) => {
                const val = (form.details[fld.key] ?? "") as string | number;
                if (fld.type === "textarea") {
                  return (
                    <div key={fld.key} className="space-y-1.5 sm:col-span-2">
                      <Label className="dark:text-slate-300">{fld.label}</Label>
                      <Textarea value={val as string} onChange={(e) => setDetail(fld.key, e.target.value)} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
                    </div>
                  );
                }
                if (fld.type === "select") {
                  return (
                    <div key={fld.key} className="space-y-1.5">
                      <Label className="dark:text-slate-300">{fld.label}</Label>
                      <Select value={(val as string) || undefined} onValueChange={(v) => setDetail(fld.key, v)}>
                        <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                          {(fld.options ?? []).map((o) => <SelectItem key={o} value={o} className="dark:text-slate-300">{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }
                return (
                  <div key={fld.key} className="space-y-1.5">
                    <Label className="dark:text-slate-300">{fld.label}</Label>
                    <Input
                      type={fld.type === "number" ? "number" : fld.type === "date" ? "date" : "text"}
                      value={val as string}
                      placeholder={fld.placeholder}
                      onChange={(e) => setDetail(fld.key, fld.type === "number" ? Number(e.target.value) : e.target.value)}
                      className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                    />
                  </div>
                );
              })}
            </div>

            {config.hasAmount && (
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="dark:text-slate-300">Amount Requested (SAR)</Label>
                  <Input type="number" value={form.amountRequested} onChange={(e) => setForm((f) => ({ ...f, amountRequested: Number(e.target.value) }))} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
                </div>
                <div className="space-y-1.5">
                  <Label className="dark:text-slate-300">Amount Approved (SAR)</Label>
                  <Input type="number" value={form.amountApproved} onChange={(e) => setForm((f) => ({ ...f, amountApproved: Number(e.target.value) }))} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
                </div>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="dark:text-slate-300">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as WelfareStatus }))}>
                  <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                    {WELFARE_STATUSES.map((s) => <SelectItem key={s} value={s} className="dark:text-slate-300">{STATUS_LABEL[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="dark:text-slate-300">Assigned Committee Member</Label>
                <Input value={form.assignedTo} onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="dark:text-slate-300">Description / Notes</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
            </div>

            <div className="space-y-1.5">
              <Label className="dark:text-slate-300">Review / Approval Notes</Label>
              <Textarea value={form.approvalNotes} onChange={(e) => setForm((f) => ({ ...f, approvalNotes: e.target.value }))} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
            </div>

            {/* Supporting documents */}
            <div className="space-y-2">
              <Label className="dark:text-slate-300">Supporting Documents</Label>
              <div className="flex flex-wrap gap-2">
                {docs.map((d, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 dark:bg-slate-800 px-2.5 py-1 text-xs text-green-800 dark:text-slate-300 border border-green-100 dark:border-slate-700">
                    <Paperclip className="h-3 w-3" />
                    <a href={d.url} target="_blank" rel="noreferrer" className="hover:underline max-w-[160px] truncate">{d.name}</a>
                    <button type="button" onClick={() => setDocs((arr) => arr.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-600"><XCircle className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
              <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
              <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()} className="gap-1.5 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload File
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">Cancel</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-green-700 hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700 text-white">
              {isSubmitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} {editing ? "Save Changes" : "Create Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-slate-900 dark:border-slate-800">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
                  <Icon className={cn("h-5 w-5", config.accent)} /> {viewing.applicantName}
                  <Badge className={cn("ml-1 text-[11px]", STATUS_STYLE[viewing.status as WelfareStatus] ?? "")}>{STATUS_LABEL[viewing.status as WelfareStatus]}</Badge>
                </DialogTitle>
                <DialogDescription className="font-mono dark:text-slate-400">{viewing.requestNumber} · {config.label}</DialogDescription>
              </DialogHeader>
              <div className="grid sm:grid-cols-2 gap-6 py-2">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-green-700/60 dark:text-slate-500 mb-1">Applicant</p>
                    <p className="text-sm font-medium text-green-950 dark:text-slate-200">{viewing.applicantName}</p>
                    {viewing.membershipId && <p className="text-xs text-green-600 dark:text-slate-500">ID: {viewing.membershipId}</p>}
                    {viewing.contactNumber && <p className="text-xs text-green-600 dark:text-slate-500">{viewing.contactNumber}</p>}
                  </div>
                  {config.hasAmount && (
                    <div className="flex gap-6">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-green-700/60 dark:text-slate-500 mb-1">Requested</p>
                        <p className="text-sm font-semibold text-green-900 dark:text-slate-200">{formatSAR(viewing.amountRequested)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-green-700/60 dark:text-slate-500 mb-1">Approved</p>
                        <p className="text-sm font-semibold text-green-900 dark:text-green-300">{viewing.amountApproved > 0 ? formatSAR(viewing.amountApproved) : "—"}</p>
                      </div>
                    </div>
                  )}
                  {config.fields.some((f) => viewing.details && (viewing.details as Record<string, unknown>)[f.key]) && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-green-700/60 dark:text-slate-500 mb-1">Details</p>
                      <dl className="space-y-1">
                        {config.fields.map((f) => {
                          const v = (viewing.details as Record<string, unknown>)?.[f.key];
                          if (v === undefined || v === null || v === "") return null;
                          return (
                            <div key={f.key} className="flex justify-between gap-4 text-sm">
                              <dt className="text-green-700/70 dark:text-slate-500">{f.label}</dt>
                              <dd className="text-green-950 dark:text-slate-300 text-right">{String(v)}</dd>
                            </div>
                          );
                        })}
                      </dl>
                    </div>
                  )}
                  {viewing.assignedTo && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-green-700/60 dark:text-slate-500 mb-1">Assigned To</p>
                      <p className="text-sm text-green-950 dark:text-slate-300">{viewing.assignedTo}</p>
                    </div>
                  )}
                  {viewing.description && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-green-700/60 dark:text-slate-500 mb-1">Description</p>
                      <p className="text-sm text-green-950 dark:text-slate-300 whitespace-pre-wrap">{viewing.description}</p>
                    </div>
                  )}
                  {viewing.approvalNotes && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-green-700/60 dark:text-slate-500 mb-1">Review Notes</p>
                      <p className="text-sm text-green-950 dark:text-slate-300 whitespace-pre-wrap">{viewing.approvalNotes}</p>
                    </div>
                  )}
                  {viewing.supportingDocuments?.length > 0 && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-green-700/60 dark:text-slate-500 mb-1">Documents</p>
                      <div className="flex flex-col gap-1">
                        {viewing.supportingDocuments.map((d, i) => (
                          <a key={i} href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400 hover:underline">
                            <FileText className="h-3.5 w-3.5" /> {d.name}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-green-700/60 dark:text-slate-500 mb-3">Status Timeline</p>
                  <StatusTimeline req={viewing} />
                </div>
              </div>
              <Separator className="dark:bg-slate-700" />
              <DialogFooter className="gap-2">
                {canEdit && <Button variant="outline" onClick={() => { const r = viewing; setViewing(null); openEdit(r); }} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"><Edit className="h-3.5 w-3.5 mr-1" /> Edit</Button>}
                <Button onClick={() => setViewing(null)} className="bg-green-700 hover:bg-green-800 text-white">Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejecting} onOpenChange={(o) => { if (!o) setRejecting(null); }}>
        <DialogContent className="dark:bg-slate-900 dark:border-slate-800">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">Reject Request</DialogTitle>
            <DialogDescription className="dark:text-slate-400">Provide a reason. This will be recorded on the request.</DialogDescription>
          </DialogHeader>
          <Textarea value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} placeholder="Reason for rejection…" className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">Cancel</Button>
            <Button variant="destructive" disabled={isSubmittingQuick} onClick={() => rejecting && quickStatus(rejecting, "rejected", rejectNotes)}>
              {isSubmittingQuick && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent className="dark:bg-slate-900 dark:border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-slate-100">Delete request?</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-slate-400">
              This permanently removes {deleting?.requestNumber} for {deleting?.applicantName}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && deleteMutation.mutate({ id: deleting.id })} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
