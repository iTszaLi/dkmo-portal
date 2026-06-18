import { useCallback, useMemo, useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetMember,
  useUpdateMember,
  useUpdateMemberFeeStatus,
  useGetMemberAssistanceHistory,
  useGetMemberReferrals,
  useListPayments,
  useCreatePayment,
  useGetCommitteePerformance,
  useListDocuments,
  useCreateDocument,
  customFetch,
  getListPaymentsQueryKey,
  getGetMemberQueryKey,
  getGetMemberAssistanceHistoryQueryKey,
  getGetMemberReferralsQueryKey,
  getListMembersQueryKey,
  getGetCommitteePerformanceQueryKey,
} from "@workspace/api-client-react";
import type { FeeStatusInputFeeStatus, MemberInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MemberForm } from "@/components/MemberForm";
import { MemberBadges } from "@/components/MemberBadges";
import { formatSAR, formatDate, feeStatusLabel, feeStatusBadgeClass } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, UserCircle, MapPin, Phone, CalendarDays, CheckCircle2, Clock, XCircle, Users,
  HeartHandshake, HandHelping, Coins, IdCard, FileText, Building2, ChevronDown, ChevronUp,
  Wallet, Pencil, Plus, Printer, Receipt, ArrowRight, Award, UserCheck,
  FolderOpen, Upload, ExternalLink, Download,
} from "lucide-react";

const STANDARD_DOCS = ["Passport", "Iqama", "Photo", "Membership Form"] as const;

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  membership_fee: "Membership Fee",
  frf_contribution: "FRF Contribution",
};
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank Transfer",
  card: "Card",
  cheque: "Cheque",
  other: "Other",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function assistanceStatusClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "approved" || s === "disbursed" || s === "completed" || s === "closed" || s === "active") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
  }
  if (s === "rejected" || s === "defaulted") {
    return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
  }
  if (s === "overdue") {
    return "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300";
  }
  return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
}

function paymentStatusClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "paid") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (s === "overdue") return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
  return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-emerald-500 dark:text-slate-500 text-xs font-medium">{label}</p>
        <p className="text-emerald-900 dark:text-slate-200 font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

export default function MemberDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState("membership");
  const [referralsExpanded, setReferralsExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const { data: member, isLoading: isMemberLoading } = useGetMember(id || "", {
    query: { enabled: !!id, queryKey: getGetMemberQueryKey(id || "") },
  });

  const updateMember = useUpdateMember();
  const updateFeeStatus = useUpdateMemberFeeStatus();
  const createPayment = useCreatePayment();

  const { data: assistance, isLoading: isAssistanceLoading } = useGetMemberAssistanceHistory(id || "", {
    query: { enabled: !!id, queryKey: getGetMemberAssistanceHistoryQueryKey(id || "") },
  });

  const { data: referrals, isLoading: isReferralsLoading } = useGetMemberReferrals(id || "", {
    query: { enabled: !!id, queryKey: getGetMemberReferralsQueryKey(id || "") },
  });

  const { data: payments, isLoading: isPaymentsLoading } = useListPayments(
    { memberId: id || "" },
    { query: { enabled: !!id, queryKey: getListPaymentsQueryKey({ memberId: id || "" }) } },
  );

  const paymentsTotal = useMemo(
    () => (payments ?? []).reduce((sum, p) => sum + Number(p.amountPaid || 0), 0),
    [payments],
  );

  const isCommittee = !!member?.designation;

  // Committee contribution — sourced from the same committee-performance endpoint
  // so the figures stay consistent across the portal (single source of truth).
  const { data: committeePerf } = useGetCommitteePerformance({
    query: { enabled: isCommittee, queryKey: getGetCommitteePerformanceQueryKey() },
  });
  const committeeEntry = useMemo(() => {
    if (!member?.fullName) return undefined;
    return (committeePerf?.entries ?? []).find((e) => e.name === member.fullName);
  }, [committeePerf, member?.fullName]);

  // Documents linked to this member (item 15)
  const { data: docsResp, isLoading: isDocsLoading, refetch: refetchDocs } = useListDocuments({
    linkedEntityType: "member",
    linkedEntityId: id || "",
    pageSize: 100,
  });
  const memberDocs = useMemo(() => docsResp?.items ?? [], [docsResp]);
  const hasDoc = useCallback(
    (label: string) =>
      memberDocs.some((d) => d.title.trim().toLowerCase() === label.trim().toLowerCase()),
    [memberDocs],
  );

  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [docTitle, setDocTitle] = useState<string>(STANDARD_DOCS[0]);
  const [docFile, setDocFile] = useState<{ fileUrl: string; fileName: string; fileSize: number; mimeType: string } | null>(null);
  const [docUploading, setDocUploading] = useState(false);

  const createDocument = useCreateDocument();

  const handleDocUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setDocUploading(true);
      try {
        const res = await customFetch<{ uploadURL: string; objectPath: string }>(
          "/api/storage/uploads/request-url",
          { method: "POST", body: JSON.stringify({ fileName: file.name, contentType: file.type }) },
        );
        const put = await fetch(res.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        if (!put.ok) throw new Error(`Upload failed with status ${put.status}`);
        const publicUrl = `/api/storage/public-objects/${res.objectPath}`;
        setDocFile({ fileUrl: publicUrl, fileName: file.name, fileSize: file.size, mimeType: file.type });
        toast({ title: "File uploaded" });
      } catch {
        toast({ title: "Upload failed", variant: "destructive" });
      } finally {
        setDocUploading(false);
        e.target.value = "";
      }
    },
    [toast],
  );

  const handleDocSave = async () => {
    if (!id) return;
    if (!docTitle.trim()) { toast({ title: "Document label is required", variant: "destructive" }); return; }
    if (!docFile) { toast({ title: "Please choose a file first", variant: "destructive" }); return; }
    try {
      await createDocument.mutateAsync({
        title: docTitle.trim(),
        category: "member_docs",
        status: "active",
        fileUrl: docFile.fileUrl,
        fileName: docFile.fileName,
        fileSize: docFile.fileSize,
        mimeType: docFile.mimeType,
        linkedEntityType: "member",
        linkedEntityId: id,
      });
      toast({ title: "Document attached" });
      setDocDialogOpen(false);
      setDocFile(null);
      setDocTitle(STANDARD_DOCS[0]);
      void refetchDocs();
    } catch (err) {
      toast({ title: "Failed to attach document", description: String(err), variant: "destructive" });
    }
  };

  const invalidateMember = () => {
    if (!id) return;
    queryClient.invalidateQueries({ queryKey: getGetMemberQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
  };

  const handleFeeStatus = (feeStatus: FeeStatusInputFeeStatus) => {
    if (!id) return;
    updateFeeStatus.mutate({ id, data: { feeStatus } }, {
      onSuccess: () => {
        invalidateMember();
        toast({ title: "Fee status updated" });
      },
      onError: (err: any) => {
        toast({ title: "Failed to update fee status", description: err.message, variant: "destructive" });
      },
    });
  };

  const handleEdit = (data: MemberInput) => {
    if (!id) return;
    updateMember.mutate({ id, data }, {
      onSuccess: () => {
        invalidateMember();
        setEditOpen(false);
        toast({ title: "Member updated" });
      },
      onError: (err: any) => {
        toast({ title: "Failed to update member", description: err.message, variant: "destructive" });
      },
    });
  };

  const printMembershipCard = () => {
    if (!member) return;
    const m = member as any;
    const rows: Array<[string, string]> = [
      ["Membership ID", member.membershipId],
      ["Mobile", member.mobileNumber],
      ["Location", [member.city, member.country].filter(Boolean).join(", ")],
    ];
    if (m.iqamaNumber) rows.push(["Iqama No", m.iqamaNumber]);
    if (m.applicationNumber) rows.push(["Application No", m.applicationNumber]);
    if (m.jamaath) rows.push(["Jamaath", m.jamaath]);
    if (member.designation) rows.push(["Role", member.designation]);
    rows.push(["Joined", formatDate(member.createdAt)]);

    const rowsHtml = rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 12px;color:#047857;font-weight:600;font-size:12px;white-space:nowrap;">${escapeHtml(k)}</td><td style="padding:6px 12px;color:#064e3b;font-size:13px;">${v ? escapeHtml(v) : "—"}</td></tr>`,
      )
      .join("");

    const html = `<!doctype html><html><head><title>DKMO Membership Card</title><style>
      body{font-family:system-ui,Segoe UI,Roboto,sans-serif;margin:0;padding:40px;background:#f0fdf4;}
      .card{max-width:520px;margin:0 auto;border:2px solid #059669;border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 8px 30px rgba(5,150,105,.15);}
      .head{background:linear-gradient(135deg,#047857,#059669);color:#fff;padding:20px 24px;}
      .head h1{margin:0;font-size:20px;letter-spacing:.5px;}
      .head p{margin:4px 0 0;font-size:12px;opacity:.9;}
      .body{padding:22px 12px 24px;}
      .name{font-size:22px;font-weight:800;color:#064e3b;padding:0 12px 12px;}
      table{width:100%;border-collapse:collapse;}
      .foot{padding:14px 24px;border-top:1px dashed #a7f3d0;color:#059669;font-size:11px;text-align:center;}
      @media print{body{background:#fff;padding:0;} .card{box-shadow:none;}}
    </style></head><body>
      <div class="card">
        <div class="head"><h1>DKMO</h1><p>Dakshina Karnataka Muslim Ookota — Membership Card</p></div>
        <div class="body"><div class="name">${escapeHtml(member.fullName)}</div><table>${rowsHtml}</table></div>
        <div class="foot">This card certifies active membership of DKMO.</div>
      </div>
      <script>window.onload=function(){window.print();}</script>
    </body></html>`;
    const w = window.open("", "_blank", "width=640,height=720");
    if (w) {
      w.document.open();
      w.document.write(html);
      w.document.close();
    }
  };

  if (isMemberLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-32" />
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-64 md:col-span-1" />
          <Skeleton className="h-64 md:col-span-2" />
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">Member not found</h2>
        <Link href="/members" className="text-emerald-600 hover:underline mt-4 inline-block">
          Back to Members
        </Link>
      </div>
    );
  }

  const m = member as any;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Link href="/members">
            <Button variant="outline" size="icon" className="h-9 w-9 border-emerald-200 dark:border-slate-700">
              <ArrowLeft className="h-4 w-4 text-emerald-700 dark:text-slate-300" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-emerald-950 dark:text-emerald-100">Member Profile</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="border-emerald-200 text-emerald-700 dark:border-slate-700 dark:text-emerald-400" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1.5 h-4 w-4" /> Edit Member
          </Button>
          <Button size="sm" variant="outline" className="border-emerald-200 text-emerald-700 dark:border-slate-700 dark:text-emerald-400" onClick={() => setPayOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Payment
          </Button>
          <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white" onClick={printMembershipCard}>
            <Printer className="mr-1.5 h-4 w-4" /> Print Card
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Profile summary */}
        <Card className="md:col-span-1 rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm h-fit">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">
                <UserCircle className="h-11 w-11" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-emerald-950 dark:text-slate-100">{member.fullName}</h2>
                <p className="text-sm font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 inline-block px-2 py-1 rounded-md mt-1">
                  ID: {member.membershipId}
                </p>
                <MemberBadges
                  designation={member.designation}
                  isExecutiveCommittee={(member as any).isExecutiveCommittee}
                  isCoreCommittee={(member as any).isCoreCommittee}
                  size="md"
                  className="mt-2 justify-center"
                />
              </div>
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${feeStatusBadgeClass(member.feeStatus)}`}>
                {member.feeStatus === "paid" ? <CheckCircle2 className="h-3 w-3" /> : member.feeStatus === "pending" ? <Clock className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                Fee {feeStatusLabel(member.feeStatus)}
              </span>
            </div>

            <div className="mt-6 space-y-3">
              <InfoRow icon={<Phone className="h-4 w-4" />} label="Mobile" value={member.mobileNumber} />
              <InfoRow icon={<MapPin className="h-4 w-4" />} label="Location" value={`${member.city}${member.country ? `, ${member.country}` : ""}`} />
              {m.applicationNumber ? <InfoRow icon={<FileText className="h-4 w-4" />} label="Application No" value={m.applicationNumber} /> : null}
              {m.iqamaNumber ? <InfoRow icon={<IdCard className="h-4 w-4" />} label="Iqama No" value={m.iqamaNumber} /> : null}
              {m.jamaath ? <InfoRow icon={<Building2 className="h-4 w-4" />} label="Jamaath" value={m.jamaath} /> : null}
              <InfoRow icon={<CalendarDays className="h-4 w-4" />} label="Joined" value={formatDate(member.createdAt)} />
            </div>

            {/* Referred By — clearly distinct from "Members Referred" */}
            <div className="mt-6 pt-5 border-t border-emerald-100 dark:border-slate-800">
              <div className="flex items-center gap-2 mb-2">
                <UserCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-semibold text-emerald-900 dark:text-slate-200">Referred By</span>
              </div>
              {member.refMemberName ? (
                member.refMemberId ? (
                  <Link href={`/members/${member.refMemberId}`} className="block text-sm group">
                    <p className="text-emerald-900 dark:text-slate-200 font-medium group-hover:underline">{member.refMemberName}</p>
                    <p className="text-emerald-600 dark:text-slate-500 text-xs mt-0.5">ID: {member.refMemberId}</p>
                  </Link>
                ) : (
                  <p className="text-sm text-emerald-900 dark:text-slate-200 font-medium">{member.refMemberName}</p>
                )
              ) : (
                <p className="text-sm text-emerald-500/70 dark:text-slate-500">Direct registration — not referred by another member.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabbed detail */}
        <div className="md:col-span-2">
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="flex w-full flex-wrap h-auto bg-emerald-50/70 dark:bg-slate-800/70">
              <TabsTrigger value="membership">Membership</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
              <TabsTrigger value="referrals">Referrals</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              {isCommittee ? <TabsTrigger value="committee">Committee</TabsTrigger> : null}
            </TabsList>

            {/* MEMBERSHIP */}
            <TabsContent value="membership" className="mt-4">
              <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg text-emerald-900 dark:text-slate-100">Membership Fee</CardTitle>
                  <CardDescription className="dark:text-slate-400">One-time registration fee for this member.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl bg-emerald-50/60 dark:bg-slate-800/50 p-4">
                      <p className="text-xs font-medium text-emerald-600 dark:text-slate-500">Fee Amount</p>
                      <p className="mt-1 text-2xl font-bold text-emerald-900 dark:text-green-300">{formatSAR(member.membershipFee)}</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50/60 dark:bg-slate-800/50 p-4">
                      <p className="text-xs font-medium text-emerald-600 dark:text-slate-500">Status</p>
                      <span className={`mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${feeStatusBadgeClass(member.feeStatus)}`}>
                        {member.feeStatus === "paid" ? <CheckCircle2 className="h-3 w-3" /> : member.feeStatus === "pending" ? <Clock className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {feeStatusLabel(member.feeStatus)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs font-medium text-emerald-600 dark:text-slate-500">Paid On</p>
                      <p className="mt-1 text-emerald-900 dark:text-slate-200 font-medium">{member.feePaidAt ? formatDate(member.feePaidAt) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-emerald-600 dark:text-slate-500">Updated By</p>
                      <p className="mt-1 text-emerald-900 dark:text-slate-200 font-medium">{member.feeUpdatedBy || "—"}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-emerald-100 dark:border-slate-800">
                    <Button size="sm" variant={member.feeStatus === "paid" ? "default" : "outline"} disabled={member.feeStatus === "paid" || updateFeeStatus.isPending} onClick={() => handleFeeStatus("paid")} className={member.feeStatus === "paid" ? "bg-emerald-700 hover:bg-emerald-800" : "border-emerald-200 text-emerald-700 dark:border-slate-700 dark:text-emerald-400"}>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Paid
                    </Button>
                    <Button size="sm" variant="outline" disabled={member.feeStatus === "pending" || updateFeeStatus.isPending} onClick={() => handleFeeStatus("pending")} className="border-amber-200 text-amber-700 dark:border-slate-700 dark:text-amber-400">
                      <Clock className="mr-2 h-4 w-4" /> Mark Pending
                    </Button>
                    <Button size="sm" variant="outline" disabled={member.feeStatus === "unpaid" || updateFeeStatus.isPending} onClick={() => handleFeeStatus("unpaid")} className="border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400">
                      <XCircle className="mr-2 h-4 w-4" /> Mark Unpaid
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* PAYMENTS */}
            <TabsContent value="payments" className="mt-4">
              <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg text-emerald-900 dark:text-slate-100 flex items-center gap-2">
                        <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> Payment History
                      </CardTitle>
                      <CardDescription className="dark:text-slate-400">All recorded payments for this member.</CardDescription>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {payments && payments.length > 0 ? (
                        <div className="text-right">
                          <p className="text-xs text-emerald-600 dark:text-slate-500">Total paid</p>
                          <p className="text-lg font-bold text-emerald-900 dark:text-green-300">{formatSAR(paymentsTotal)}</p>
                        </div>
                      ) : null}
                      <Button size="sm" variant="outline" className="border-emerald-200 text-emerald-700 dark:border-slate-700 dark:text-emerald-400" onClick={() => setPayOpen(true)}>
                        <Plus className="mr-1.5 h-4 w-4" /> Add
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {isPaymentsLoading ? (
                    <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
                  ) : !payments || payments.length === 0 ? (
                    <div className="text-center py-8 bg-emerald-50/30 dark:bg-slate-800/40 rounded-lg border border-emerald-100 dark:border-slate-800 border-dashed">
                      <Receipt className="h-10 w-10 text-emerald-200 dark:text-slate-700 mx-auto mb-3" />
                      <p className="text-sm text-emerald-700 dark:text-slate-400">No payments recorded for this member yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {payments.map((p) => (
                        <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-emerald-100 dark:border-slate-800 bg-emerald-50/30 dark:bg-slate-800/40 p-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-emerald-950 dark:text-slate-100 text-sm">{PAYMENT_TYPE_LABELS[p.paymentType] ?? p.paymentType}</p>
                              <span className="text-[11px] font-mono text-emerald-600 dark:text-slate-500 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded">{p.receiptNumber}</span>
                            </div>
                            <p className="text-[11px] text-emerald-600/70 dark:text-slate-500 mt-0.5">
                              {formatDate(p.paidAt)} • {PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <p className="text-sm font-bold text-emerald-900 dark:text-green-300">{formatSAR(p.amountPaid)}</p>
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize ${paymentStatusClass(p.status)}`}>{p.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* REFERRALS */}
            <TabsContent value="referrals" className="mt-4">
              <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg text-emerald-900 dark:text-slate-100 flex items-center gap-2">
                    <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> Members Referred
                  </CardTitle>
                  <CardDescription className="dark:text-slate-400">
                    Members registered under {member.fullName}&apos;s reference and the FRF responsibility they carry (SAR 50 per active member).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isReferralsLoading ? (
                    <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-xl bg-emerald-50/60 dark:bg-slate-800/50 p-4">
                          <p className="text-xs font-medium text-emerald-600 dark:text-slate-500 flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Members Referred</p>
                          <p className="mt-1 text-2xl font-bold text-emerald-900 dark:text-slate-100">{referrals?.totalCount ?? 0}</p>
                        </div>
                        <div className="rounded-xl bg-emerald-50/60 dark:bg-slate-800/50 p-4">
                          <p className="text-xs font-medium text-emerald-600 dark:text-slate-500 flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> FRF Responsibility</p>
                          <p className="mt-1 text-2xl font-bold text-emerald-900 dark:text-green-300">{formatSAR(referrals?.frfResponsibilityAmount ?? 0)}</p>
                          <p className="text-[11px] text-emerald-600/70 dark:text-slate-500 mt-0.5">{referrals?.totalCount ?? 0} × SAR 50 (auto-calculated)</p>
                        </div>
                      </div>

                      {referrals && referrals.totalCount > 0 ? (
                        <div className="mt-4">
                          <button type="button" onClick={() => setReferralsExpanded((v) => !v)} className="flex w-full items-center justify-between rounded-lg border border-emerald-100 dark:border-slate-800 bg-emerald-50/40 dark:bg-slate-800/40 px-3 py-2 text-sm font-medium text-emerald-800 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 transition-colors">
                            <span>{referralsExpanded ? "Hide" : "Show"} member list ({referrals.totalCount})</span>
                            {referralsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                          {referralsExpanded ? (
                            <div className="mt-3 space-y-2">
                              {referrals.members.map((rm) => (
                                <Link key={rm.id} href={`/members/${rm.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-emerald-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 hover:bg-emerald-50/40 dark:hover:bg-slate-800/50 transition-colors">
                                  <div className="min-w-0">
                                    <p className="font-medium text-emerald-950 dark:text-slate-100 text-sm truncate">{rm.fullName}</p>
                                    <p className="text-xs text-emerald-600 dark:text-slate-500">ID: {rm.membershipId}{rm.city ? ` • ${rm.city}` : ""}</p>
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-xs text-emerald-700 dark:text-slate-400">{rm.mobileNumber}</span>
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${feeStatusBadgeClass(rm.feeStatus)}`}>{feeStatusLabel(rm.feeStatus)}</span>
                                  </div>
                                </Link>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-4 text-center py-6 bg-emerald-50/30 dark:bg-slate-800/40 rounded-lg border border-emerald-100 dark:border-slate-800 border-dashed">
                          <p className="text-sm text-emerald-700 dark:text-slate-400">No members registered under this member&apos;s reference.</p>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* DOCUMENTS */}
            <TabsContent value="documents" className="mt-4">
              <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg text-emerald-900 dark:text-slate-100 flex items-center gap-2">
                        <FolderOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> Documents
                      </CardTitle>
                      <CardDescription className="dark:text-slate-400">Identity and membership documents attached to this member.</CardDescription>
                    </div>
                    <Button size="sm" variant="outline" className="border-emerald-200 text-emerald-700 dark:border-slate-700 dark:text-emerald-400 shrink-0" onClick={() => setDocDialogOpen(true)}>
                      <Plus className="mr-1.5 h-4 w-4" /> Attach
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Standard document checklist */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {STANDARD_DOCS.map((label) => {
                      const present = hasDoc(label);
                      return (
                        <div
                          key={label}
                          className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-medium ${
                            present
                              ? "border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300"
                              : "border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500"
                          }`}
                        >
                          {present ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                          <span className="truncate">{label}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Attached documents list */}
                  {isDocsLoading ? (
                    <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
                  ) : memberDocs.length === 0 ? (
                    <div className="text-center py-8 bg-emerald-50/30 dark:bg-slate-800/40 rounded-lg border border-emerald-100 dark:border-slate-800 border-dashed">
                      <FileText className="h-10 w-10 text-emerald-200 dark:text-slate-700 mx-auto mb-3" />
                      <p className="text-sm text-emerald-700 dark:text-slate-400">No documents attached yet. Use "Attach" to upload Passport, Iqama, Photo, or the Membership Form.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {memberDocs.map((d) => (
                        <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-emerald-100 dark:border-slate-800 bg-emerald-50/30 dark:bg-slate-800/40 p-3">
                          <div className="min-w-0 flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 shrink-0">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-emerald-950 dark:text-slate-100 text-sm truncate">{d.title}</p>
                              <p className="text-[11px] text-emerald-600/70 dark:text-slate-500 truncate">{d.fileName || "Attached file"}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {d.fileUrl ? (
                              <>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-700 dark:text-emerald-400" onClick={() => window.open(d.fileUrl, "_blank")} title="Open">
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-700 dark:text-emerald-400" title="Download" onClick={() => { const a = document.createElement("a"); a.href = d.fileUrl; a.download = d.fileName || d.title; a.click(); }}>
                                  <Download className="h-4 w-4" />
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* HISTORY */}
            <TabsContent value="history" className="mt-4">
              <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg text-emerald-900 dark:text-slate-100 flex items-center gap-2">
                        <HandHelping className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> Assistance History
                      </CardTitle>
                      <CardDescription className="dark:text-slate-400">All support received across FRF, Medical Aid, Loans, Air Ticket, and Relief programs.</CardDescription>
                    </div>
                    {assistance && assistance.totalCount > 0 ? (
                      <div className="text-right shrink-0">
                        <p className="text-xs text-emerald-600 dark:text-slate-500">Total received</p>
                        <p className="text-lg font-bold text-emerald-900 dark:text-green-300 inline-flex items-center gap-1"><Coins className="h-4 w-4" /> {formatSAR(assistance.totalReceived)}</p>
                      </div>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent>
                  {isAssistanceLoading ? (
                    <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
                  ) : !assistance || assistance.items.length === 0 ? (
                    <div className="text-center py-8 bg-emerald-50/30 dark:bg-slate-800/40 rounded-lg border border-emerald-100 dark:border-slate-800 border-dashed">
                      <HeartHandshake className="h-10 w-10 text-emerald-200 dark:text-slate-700 mx-auto mb-3" />
                      <p className="text-sm text-emerald-700 dark:text-slate-400">No assistance has been recorded for this member yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {assistance.items.map((item) => (
                        <div key={`${item.category}-${item.id}`} data-testid={`row-assistance-${item.id}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-emerald-100 dark:border-slate-800 bg-emerald-50/30 dark:bg-slate-800/40 p-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-emerald-950 dark:text-slate-100 text-sm">{item.category}</p>
                              {item.referenceNumber ? <span className="text-[11px] font-mono text-emerald-600 dark:text-slate-500 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded">{item.referenceNumber}</span> : null}
                            </div>
                            {item.description ? <p className="text-xs text-emerald-700/80 dark:text-slate-400 mt-0.5 line-clamp-1">{item.description}</p> : null}
                            <p className="text-[11px] text-emerald-600/70 dark:text-slate-500 mt-0.5">{item.date ? formatDate(item.date) : "Date not recorded"}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <p className="text-sm font-bold text-emerald-900 dark:text-green-300">{formatSAR(item.amountApproved)}</p>
                              {item.amountRequested > item.amountApproved ? <p className="text-[11px] text-emerald-600/70 dark:text-slate-500">of {formatSAR(item.amountRequested)} req.</p> : null}
                            </div>
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize ${assistanceStatusClass(item.status)}`}>{item.status.replace(/_/g, " ")}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* COMMITTEE */}
            {isCommittee ? (
              <TabsContent value="committee" className="mt-4">
                <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg text-emerald-900 dark:text-slate-100 flex items-center gap-2">
                      <Award className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> Committee Information
                    </CardTitle>
                    <CardDescription className="dark:text-slate-400">Role and contribution of this committee member, calculated from real records.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-xl bg-emerald-50/60 dark:bg-slate-800/50 p-4">
                        <p className="text-xs font-medium text-emerald-600 dark:text-slate-500">Committee Role</p>
                        <p className="mt-1 text-base font-bold text-emerald-900 dark:text-slate-100">{member.designation}</p>
                      </div>
                      <div className="rounded-xl bg-emerald-50/60 dark:bg-slate-800/50 p-4">
                        <p className="text-xs font-medium text-emerald-600 dark:text-slate-500">Committee Since</p>
                        <p className="mt-1 text-base font-bold text-emerald-900 dark:text-slate-100">{formatDate(member.createdAt)}</p>
                      </div>
                      <div className="rounded-xl bg-emerald-50/60 dark:bg-slate-800/50 p-4">
                        <p className="text-xs font-medium text-emerald-600 dark:text-slate-500">Members Referred</p>
                        <p className="mt-1 text-2xl font-bold text-emerald-900 dark:text-slate-100">{referrals?.totalCount ?? 0}</p>
                      </div>
                      <div className="rounded-xl bg-emerald-50/60 dark:bg-slate-800/50 p-4">
                        <p className="text-xs font-medium text-emerald-600 dark:text-slate-500">FRF Responsibility</p>
                        <p className="mt-1 text-2xl font-bold text-emerald-900 dark:text-green-300">{formatSAR(referrals?.frfResponsibilityAmount ?? 0)}</p>
                      </div>
                      <div className="rounded-xl bg-emerald-50/60 dark:bg-slate-800/50 p-4">
                        <p className="text-xs font-medium text-emerald-600 dark:text-slate-500">Payments Collected</p>
                        <p className="mt-1 text-2xl font-bold text-emerald-900 dark:text-green-300">{formatSAR(committeeEntry?.feesCollected ?? 0)}</p>
                      </div>
                      <div className="rounded-xl bg-emerald-50/60 dark:bg-slate-800/50 p-4">
                        <p className="text-xs font-medium text-emerald-600 dark:text-slate-500">FRF Members Added</p>
                        <p className="mt-1 text-2xl font-bold text-emerald-900 dark:text-slate-100">{committeeEntry?.frfReferred ?? 0}</p>
                      </div>
                    </div>
                    <Link href="/committee-performance" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline">
                      View full committee performance <ArrowRight className="h-4 w-4" />
                    </Link>
                  </CardContent>
                </Card>
              </TabsContent>
            ) : null}
          </Tabs>
        </div>
      </div>

      {/* Edit Member dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[500px] dark:bg-slate-900 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">Edit Member</DialogTitle>
          </DialogHeader>
          <MemberForm defaultValues={member as Partial<MemberInput>} onSubmit={handleEdit} isSubmitting={updateMember.isPending} />
        </DialogContent>
      </Dialog>

      {/* Add Payment dialog */}
      <AddPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        memberId={id || ""}
        isSubmitting={createPayment.isPending}
        onSubmit={(data, onDone) => {
          createPayment.mutate({ data }, {
            onSuccess: () => {
              queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/payments") });
              invalidateMember();
              setPayOpen(false);
              setTab("payments");
              toast({ title: "Payment recorded" });
              onDone();
            },
            onError: (err: any) => {
              toast({ title: "Failed to record payment", description: err.message, variant: "destructive" });
            },
          });
        }}
      />

      {/* Attach Document dialog */}
      <Dialog open={docDialogOpen} onOpenChange={(v) => { setDocDialogOpen(v); if (!v) { setDocFile(null); setDocTitle(STANDARD_DOCS[0]); } }}>
        <DialogContent className="sm:max-w-[460px] dark:bg-slate-900 dark:border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-emerald-900 dark:text-slate-100">Attach Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="dark:text-slate-300">Document Type</Label>
              <select
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              >
                {STANDARD_DOCS.map((label) => <option key={label} value={label}>{label}</option>)}
                <option value="Other">Other</option>
              </select>
            </div>
            {docTitle === "Other" || !STANDARD_DOCS.includes(docTitle as (typeof STANDARD_DOCS)[number]) ? (
              <div className="space-y-1.5">
                <Label className="dark:text-slate-300">Custom Label</Label>
                <Input
                  value={docTitle === "Other" ? "" : docTitle}
                  placeholder="e.g. Sponsor Letter"
                  onChange={(e) => setDocTitle(e.target.value)}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label className="dark:text-slate-300">File</Label>
              <Input
                type="file"
                onChange={handleDocUpload}
                disabled={docUploading}
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              />
              {docUploading ? (
                <p className="text-xs text-emerald-600 dark:text-slate-400 flex items-center gap-1.5"><Upload className="h-3.5 w-3.5 animate-pulse" /> Uploading…</p>
              ) : docFile ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> {docFile.fileName}</p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" className="dark:border-slate-700 dark:text-slate-300" onClick={() => setDocDialogOpen(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleDocSave} disabled={createDocument.isPending || docUploading || !docFile}>
                {createDocument.isPending ? "Saving…" : "Attach"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddPaymentDialog({
  open, onOpenChange, memberId, isSubmitting, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  memberId: string;
  isSubmitting?: boolean;
  onSubmit: (data: any, onDone: () => void) => void;
}) {
  const [paymentType, setPaymentType] = useState("membership_fee");
  const [amountPaid, setAmountPaid] = useState("100");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const reset = () => {
    setPaymentType("membership_fee");
    setAmountPaid("100");
    setPaymentMethod("cash");
    setReceiptNumber("");
    setPaidAt(new Date().toISOString().slice(0, 10));
    setNotes("");
  };

  const [error, setError] = useState("");

  const submit = () => {
    const amount = Number(amountPaid);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid amount greater than 0.");
      return;
    }
    const parsedDate = new Date(paidAt);
    if (!paidAt || Number.isNaN(parsedDate.getTime())) {
      setError("Select a valid payment date.");
      return;
    }
    setError("");
    const receipt = receiptNumber.trim() || `RCPT-${Date.now()}`;
    onSubmit(
      {
        memberId,
        paymentType,
        amountPaid: amount,
        paymentMethod,
        receiptNumber: receipt,
        status: "paid",
        paidAt: parsedDate.toISOString(),
        notes: notes.trim() || null,
      },
      reset,
    );
  };

  const selectClass = "w-full border border-input rounded-md px-3 h-10 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] dark:bg-slate-900 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Record Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Payment Type</Label>
              <select className={selectClass} value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
                <option value="membership_fee">Membership Fee</option>
                <option value="frf_contribution">FRF Contribution</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Amount (SAR)</Label>
              <Input type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Method</Label>
              <select className={selectClass} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="card">Card</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Paid On</Label>
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Receipt Number</Label>
            <Input value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} placeholder="Auto-generated if left blank" />
          </div>
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error ? <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="border-emerald-200 dark:border-slate-700">Cancel</Button>
            <Button onClick={submit} disabled={isSubmitting} className="bg-emerald-700 hover:bg-emerald-800 text-white">
              {isSubmitting ? "Saving..." : "Save Payment"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
