import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useGetFrfClaimCollection, useUpdateFrfContributionStatus, useUpdateFrfClaimPhoto } from "@workspace/api-client-react";
import type { FrfContributor } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  HeartHandshake, ArrowLeft, Search, Download, FileSpreadsheet, Users,
  CheckCircle2, Clock, AlertTriangle, DollarSign, Target, UserX, RotateCcw,
  Camera, Trash2, History, Award, XCircle,
} from "lucide-react";
import { FrfCaseDocuments } from "@/components/FrfCaseDocuments";
import { useRef } from "react";
import { cn, formatSAR, formatDate } from "@/lib/utils";
import { fileToCompressedDataUrl } from "@/lib/image-utils";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const CLAIM_TYPE_LABEL: Record<string, string> = {
  death_benefit: "Death Benefit",
  emergency: "Emergency Assistance",
  air_ticket: "Air Ticket Support",
  other: "Other",
};

const CONTRIB_STATUS_STYLE: Record<string, string> = {
  paid: "bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-300 ring-1 ring-green-300/50",
  partial: "bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 ring-1 ring-blue-300/50",
  pending: "bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300 ring-1 ring-orange-300/50",
  overdue: "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300 ring-1 ring-red-300/50",
  cancelled: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 ring-1 ring-slate-300/50",
  exempt: "bg-purple-100 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 ring-1 ring-purple-300/50",
};

const CONTRIB_STATUS_LABEL: Record<string, string> = {
  paid: "Paid",
  partial: "Partially Paid",
  pending: "Pending",
  overdue: "Overdue",
  cancelled: "Cancelled",
  exempt: "Exempt",
};

type TimelineEvent = {
  label: string;
  date: string | null;
  detail?: string;
  tone: "done" | "info" | "rejected" | "pending";
};

/** Builds the case activity timeline from claim milestones + the payment ledger. */
function buildTimeline(claim: any, contributors: { amountPaid: number; paidAt?: string | null }[], targetAmount: number): TimelineEvent[] {
  const paidDates = contributors
    .filter((c) => c.amountPaid > 0 && c.paidAt)
    .map((c) => c.paidAt as string)
    .sort();
  const events: TimelineEvent[] = [
    { label: "Case created", date: claim.claimDate ?? claim.createdAt, tone: "done" },
  ];
  if (targetAmount > 0) {
    events.push({ label: "Target amount set", date: claim.claimDate ?? claim.createdAt, detail: `Target SAR ${targetAmount.toLocaleString()}`, tone: "done" });
  }
  if (claim.underReviewAt) events.push({ label: "Under review", date: claim.underReviewAt, detail: claim.underReviewBy ? `by ${claim.underReviewBy}` : undefined, tone: "info" });
  if (claim.approvedDate) events.push({ label: "Approved", date: claim.approvedDate, detail: claim.approvedBy ? `by ${claim.approvedBy}` : undefined, tone: "done" });
  if (paidDates.length > 0) {
    events.push({ label: "First payment received", date: paidDates[0]!, tone: "done" });
    if (paidDates.length > 1) events.push({ label: "Latest payment received", date: paidDates[paidDates.length - 1]!, detail: `${paidDates.length} payments so far`, tone: "done" });
  }
  if (claim.rejectedAt) events.push({ label: "Case rejected", date: claim.rejectedAt, detail: claim.rejectedBy ? `by ${claim.rejectedBy}` : undefined, tone: "rejected" });
  if (claim.disbursedAt) events.push({ label: "Funds disbursed", date: claim.disbursedAt, detail: claim.disbursedBy ? `by ${claim.disbursedBy}` : undefined, tone: "done" });
  if (claim.caseStatus === "closed") {
    events.push({ label: "Case closed", date: claim.closingDate ?? claim.disbursedAt ?? claim.rejectedAt ?? null, tone: claim.rejectedAt ? "rejected" : "done" });
  } else if (claim.closingDate) {
    events.push({ label: "Scheduled to close", date: claim.closingDate, tone: "pending" });
  }
  return events.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
}

function CaseTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div>
      {events.map((ev, i) => (
        <div key={`${ev.label}-${i}`} className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div className={cn(
              "h-7 w-7 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
              ev.tone === "done" ? "bg-green-600 border-green-600 text-white" :
              ev.tone === "rejected" ? "bg-red-500 border-red-500 text-white" :
              ev.tone === "info" ? "border-blue-400 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400" :
              "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-400",
            )}>
              {ev.tone === "done" ? <CheckCircle2 className="h-3.5 w-3.5" /> :
               ev.tone === "rejected" ? <XCircle className="h-3.5 w-3.5" /> :
               <Clock className="h-3.5 w-3.5" />}
            </div>
            {i < events.length - 1 && <div className="w-0.5 h-7 bg-green-200 dark:bg-slate-700" />}
          </div>
          <div className="pb-3 flex-1 min-w-0">
            <p className={cn("text-sm font-semibold",
              ev.tone === "rejected" ? "text-red-600 dark:text-red-400" :
              ev.tone === "pending" ? "text-slate-500 dark:text-slate-400" :
              "text-green-900 dark:text-slate-200")}>
              {ev.label}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {ev.date ? formatDate(ev.date) : "—"}{ev.detail ? ` · ${ev.detail}` : ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export default function FrfClaimDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useGetFrfClaimCollection(id);
  const { canEdit, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const { toast } = useToast();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const contributorsRef = useRef<HTMLDivElement>(null);

  const photoMutation = useUpdateFrfClaimPhoto({
    mutation: {
      onSuccess: () => { void refetch(); toast({ title: "Beneficiary photo updated" }); },
      onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }),
    },
  });

  async function onPhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataUrl(file, 800);
      photoMutation.mutate({ id, data: { photoUrl: dataUrl } });
    } catch (err) {
      toast({ title: "Could not read image", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    }
  }

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const statusMutation = useUpdateFrfContributionStatus({
    mutation: {
      onSuccess: () => { void refetch(); toast({ title: "Contribution status updated" }); },
      onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }),
    },
  });

  const contributors = useMemo(() => {
    let rows: FrfContributor[] = data?.contributors ?? [];
    if (statusFilter === "collected") rows = rows.filter((c) => c.status === "paid" || c.status === "partial");
    else if (statusFilter === "owing") rows = rows.filter((c) => c.status === "pending" || c.status === "overdue" || c.status === "partial");
    else if (statusFilter !== "all") rows = rows.filter((c) => c.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (c) =>
          c.fullName.toLowerCase().includes(q) ||
          c.membershipId.toLowerCase().includes(q) ||
          c.mobileNumber.toLowerCase().includes(q) ||
          c.refMemberName.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [data, search, statusFilter]);

  const exportExcel = async () => {
    if (!data) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("FRF Collection");
    ws.addRow([`FRF Claim Collection — ${data.claim.claimantName}`]);
    ws.addRow([`Type: ${CLAIM_TYPE_LABEL[data.claim.claimType] ?? data.claim.claimType}`, `Contribution: SAR ${data.claim.contributionAmount}`]);
    ws.addRow([`Expected: SAR ${data.expectedAmount}`, `Collected: SAR ${data.collectedAmount}`, `Outstanding: SAR ${data.outstandingAmount}`, `Rate: ${data.collectionRate}%`]);
    ws.addRow([]);
    const header = ws.addRow(["Member", "Membership ID", "Mobile", "Reference", "Due (SAR)", "Paid (SAR)", "Balance (SAR)", "Status", "Method", "Paid Date", "Receipt #", "Remarks"]);
    header.font = { bold: true };
    for (const c of contributors) {
      ws.addRow([
        c.fullName, c.membershipId, c.mobileNumber, c.refMemberName || "—",
        c.amount, c.amountPaid, c.balance, CONTRIB_STATUS_LABEL[c.status] ?? c.status,
        c.paymentMethod || "—", c.paidAt ? formatDate(c.paidAt) : "—", c.receiptNumber || "—", c.remarks || "—",
      ]);
    }
    ws.columns.forEach((col) => { col.width = 20; });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `frf-collection-${data.claim.claimantName.replace(/\s+/g, "-").toLowerCase()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    if (!data) return;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.setTextColor(20, 83, 45);
    doc.text("DKMO — FRF Claim Collection Report", 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(60);
    doc.text(`Claimant: ${data.claim.claimantName} · ${CLAIM_TYPE_LABEL[data.claim.claimType] ?? data.claim.claimType}`, 14, 24);
    doc.text(`Contribution per member: SAR ${data.claim.contributionAmount}`, 14, 30);
    doc.text(
      `Expected: SAR ${data.expectedAmount}  |  Collected: SAR ${data.collectedAmount}  |  Outstanding: SAR ${data.outstandingAmount}  |  Rate: ${data.collectionRate}%`,
      14, 36,
    );
    autoTable(doc, {
      startY: 42,
      head: [["Member", "Membership ID", "Mobile", "Due", "Paid", "Balance", "Status", "Paid Date"]],
      body: contributors.map((c) => [
        c.fullName, c.membershipId, c.mobileNumber,
        `SAR ${c.amount}`, `SAR ${c.amountPaid}`, `SAR ${c.balance}`,
        CONTRIB_STATUS_LABEL[c.status] ?? c.status, c.paidAt ? formatDate(c.paidAt) : "—",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [21, 128, 61] },
    });
    doc.save(`frf-collection-${data.claim.claimantName.replace(/\s+/g, "-").toLowerCase()}.pdf`);
  };

  const exportCompletionCertificate = () => {
    if (!data) return;
    // Collection payload's claim schema omits some milestone timestamps; treat as loose record.
    const c = data.claim as typeof data.claim & Record<string, any>;
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    // Border
    doc.setDrawColor(21, 128, 61);
    doc.setLineWidth(1.2);
    doc.rect(8, 8, pageW - 16, doc.internal.pageSize.getHeight() - 16);
    doc.setLineWidth(0.3);
    doc.rect(11, 11, pageW - 22, doc.internal.pageSize.getHeight() - 22);
    // Header
    doc.setFontSize(20);
    doc.setTextColor(20, 83, 45);
    doc.text("Dakshina Karnataka Muslim Ookota", pageW / 2, 30, { align: "center" });
    doc.setFontSize(13);
    doc.setTextColor(60);
    doc.text("Family Relief Fund — Case Completion Summary", pageW / 2, 40, { align: "center" });
    doc.setDrawColor(180);
    doc.line(30, 46, pageW - 30, 46);
    // Body
    const paidContribs = data.contributors.filter((x) => x.amountPaid > 0).length;
    const progress = data.targetAmount > 0 ? data.targetProgress : data.collectionRate;
    const rows: [string, string][] = [
      ["Case Title", c.title || "—"],
      ["Beneficiary Name", c.beneficiaryName || c.claimantName],
      ["Member ID", c.membershipId || "—"],
      ["Case Type", CLAIM_TYPE_LABEL[c.claimType] ?? c.claimType],
      ["Target Amount", data.targetAmount > 0 ? `SAR ${data.targetAmount.toLocaleString()}` : "—"],
      ["Total Collected", `SAR ${data.collectedAmount.toLocaleString()}`],
      ["Number of Contributors", `${paidContribs} of ${data.totalMembers} members`],
      ["Collection Percentage", `${progress}%`],
      ["Date Opened", formatDate(c.claimDate ?? c.createdAt)],
      ["Date Closed", c.caseStatus === "closed" ? formatDate(c.closingDate ?? c.disbursedAt ?? c.rejectedAt ?? null) : "Still open"],
      ["Distribution Status", c.status === "disbursed" ? `Disbursed — SAR ${Number(c.amountApproved).toLocaleString()}` : c.status === "rejected" ? "Rejected" : "Not yet disbursed"],
    ];
    autoTable(doc, {
      startY: 56,
      margin: { left: 30, right: 30 },
      body: rows,
      theme: "plain",
      styles: { fontSize: 11, cellPadding: 3 },
      columnStyles: { 0: { fontStyle: "bold", textColor: [20, 83, 45], cellWidth: 62 }, 1: { textColor: [40, 40, 40] } },
    });
    const y = (doc as any).lastAutoTable.finalY + 16;
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Generated on ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} · DKMO Management Portal`, pageW / 2, y, { align: "center" });
    doc.text("This is a permanent record generated for transparency and audit purposes.", pageW / 2, y + 6, { align: "center" });
    doc.save(`frf-completion-${(c.title || c.claimantName).replace(/\s+/g, "-").toLowerCase()}.pdf`);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link href="/frf">
          <Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back to FRF</Button>
        </Link>
        <Card className="rounded-2xl">
          <CardContent className="py-12 text-center text-slate-500">Claim not found or failed to load.</CardContent>
        </Card>
      </div>
    );
  }

  const { claim } = data;

  const stats: { title: string; value: string; icon: typeof Users; color: string; sub?: string; filter?: string }[] = [
    { title: "Contributing Members", value: String(data.totalMembers), icon: Users, color: "text-green-700 dark:text-green-400", sub: `${data.exemptCount} exempt`, filter: "all" },
    { title: "Collected", value: formatSAR(data.collectedAmount), icon: CheckCircle2, color: "text-green-700 dark:text-green-400", sub: `${data.paidCount} paid · ${data.partialCount} partial`, filter: "collected" },
    { title: "Outstanding", value: formatSAR(data.outstandingAmount), icon: Clock, color: "text-orange-600 dark:text-orange-400", sub: `${data.pendingCount} pending · ${data.overdueCount} overdue · ${data.partialCount} partial`, filter: "owing" },
    { title: "Overdue", value: String(data.overdueCount), icon: AlertTriangle, color: "text-red-600 dark:text-red-400", sub: "30+ days", filter: "overdue" },
    {
      title: "Target",
      value: formatSAR(data.targetAmount),
      icon: Target,
      color: "text-blue-700 dark:text-blue-400",
      sub: data.targetAmount > 0
        ? `${data.targetProgress}% reached · ${formatSAR(data.remainingToTarget)} to go`
        : "No target set",
    },
  ];

  const showContributors = (filter: string) => {
    setStatusFilter(filter);
    contributorsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Link href="/frf" className="inline-flex items-center gap-1 text-sm text-green-700 dark:text-green-400 hover:underline mb-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Family Relief Fund
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-green-950 dark:text-green-100 flex items-center gap-2">
            <HeartHandshake className="h-6 w-6 text-green-700 dark:text-green-400" />
            {claim.title || claim.claimantName}
            <Badge className={cn(
              "text-[11px] ml-1",
              claim.caseStatus === "closed"
                ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 ring-1 ring-slate-300/50"
                : "bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-300 ring-1 ring-green-300/50",
            )}>
              {claim.caseStatus === "closed" ? "Closed" : "Open"}
            </Badge>
          </h1>
          <p className="text-green-800/70 dark:text-slate-400 mt-1 text-sm">
            {claim.title ? `${claim.claimantName} · ` : ""}{CLAIM_TYPE_LABEL[claim.claimType] ?? claim.claimType} · Opened {formatDate(claim.claimDate ?? null)}{claim.closingDate ? ` · Closes ${formatDate(claim.closingDate)}` : ""} · Contribution {formatSAR(claim.contributionAmount)} per member
          </p>
          {(claim.beneficiaryName || claim.beneficiaryRelation) && (
            <p className="text-xs text-green-700/70 dark:text-slate-500 mt-0.5">
              Beneficiary: {claim.beneficiaryName || "—"}{claim.beneficiaryRelation ? ` (${claim.beneficiaryRelation})` : ""}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel} className="dark:border-slate-700">
            <FileSpreadsheet className="h-4 w-4 mr-1.5 text-green-600" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportPdf} className="dark:border-slate-700">
            <Download className="h-4 w-4 mr-1.5 text-green-600" /> PDF
          </Button>
          <Button
            size="sm"
            onClick={exportCompletionCertificate}
            className={claim.caseStatus === "closed"
              ? "bg-green-700 hover:bg-green-800 text-white"
              : "bg-white dark:bg-slate-900 border border-green-200 dark:border-slate-700 text-green-800 dark:text-green-300 hover:bg-green-50 dark:hover:bg-slate-800"}
            title="Printable case completion summary">
            <Award className="h-4 w-4 mr-1.5" /> Certificate
          </Button>
        </div>
      </div>

      {/* Beneficiary hero */}
      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm overflow-hidden">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row gap-5 sm:gap-6">
            <div className="shrink-0 flex flex-col items-center gap-2">
              <Avatar className="h-32 w-32 sm:h-40 sm:w-40 rounded-2xl ring-2 ring-green-200 dark:ring-slate-700">
                <AvatarImage src={claim.photoUrl ?? undefined} alt={claim.beneficiaryName || claim.claimantName} className="object-cover" />
                <AvatarFallback className="rounded-2xl bg-green-100 dark:bg-slate-800 text-green-600 dark:text-green-400">
                  <HeartHandshake className="h-12 w-12" />
                </AvatarFallback>
              </Avatar>
              {isAdmin && (
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 text-xs dark:border-slate-700" disabled={photoMutation.isPending} onClick={() => photoInputRef.current?.click()}>
                    <Camera className="h-3 w-3 mr-1" /> {claim.photoUrl ? "Replace" : "Upload"}
                  </Button>
                  {claim.photoUrl && (
                    <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 dark:text-red-400 dark:border-slate-700" disabled={photoMutation.isPending}
                      onClick={() => photoMutation.mutate({ id, data: { photoUrl: null } })}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                  <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPhotoFile} />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <p className="text-xl font-bold text-green-950 dark:text-green-100">{claim.beneficiaryName || claim.claimantName}</p>
                <p className="text-sm text-green-800/70 dark:text-slate-400">
                  {claim.membershipId ? `Member ID: ${claim.membershipId} · ` : ""}{CLAIM_TYPE_LABEL[claim.claimType] ?? claim.claimType}
                  {claim.beneficiaryRelation ? ` · ${claim.beneficiaryRelation}` : ""}
                </p>
                {claim.title && <p className="text-sm font-medium text-green-800 dark:text-green-300 mt-0.5">{claim.title}</p>}
                {claim.description && <p className="text-sm text-green-900/80 dark:text-slate-300 mt-1.5">{claim.description}</p>}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-sm">
                <div><span className="text-xs text-green-700/70 dark:text-slate-500 block">Target</span><span className="font-semibold text-green-950 dark:text-slate-200">{data.targetAmount > 0 ? formatSAR(data.targetAmount) : "—"}</span></div>
                <div><span className="text-xs text-green-700/70 dark:text-slate-500 block">Collected</span><span className="font-semibold text-green-700 dark:text-green-300">{formatSAR(data.collectedAmount)}</span></div>
                <div><span className="text-xs text-green-700/70 dark:text-slate-500 block">Committed</span><span className="font-semibold text-blue-700 dark:text-blue-300">{formatSAR(data.expectedAmount)}</span></div>
                <div><span className="text-xs text-green-700/70 dark:text-slate-500 block">Remaining</span><span className="font-semibold text-orange-700 dark:text-orange-300">{data.targetAmount > 0 ? formatSAR(data.remainingToTarget) : formatSAR(data.outstandingAmount)}</span></div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-green-700/70 dark:text-slate-500">Collection Progress</span>
                  <span className="text-xs font-semibold text-green-800 dark:text-green-300">{data.targetAmount > 0 ? data.targetProgress : data.collectionRate}%</span>
                </div>
                <Progress value={data.targetAmount > 0 ? data.targetProgress : data.collectionRate} className="h-2" />
              </div>
              {(claim.supportingPhotos?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs text-green-700/70 dark:text-slate-500 mb-1.5">Supporting Photos</p>
                  <div className="flex flex-wrap gap-2">
                    {claim.supportingPhotos!.map((url: string, i: number) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt={`Supporting ${i + 1}`} loading="lazy" className="h-16 w-16 rounded-lg object-cover ring-1 ring-green-200 dark:ring-slate-700 hover:opacity-90" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map(({ title, value, icon: Icon, color, sub, filter }) => (
          <Card
            key={title}
            role={filter ? "button" : undefined}
            tabIndex={filter ? 0 : undefined}
            aria-pressed={filter ? statusFilter === filter && statusFilter !== "all" : undefined}
            onClick={filter ? () => showContributors(filter) : undefined}
            onKeyDown={filter ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showContributors(filter); } } : undefined}
            title={filter ? "Show these members below" : undefined}
            data-testid={`card-stat-${title.toLowerCase().replace(/\s+/g, "-")}`}
            className={cn(
              "rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm",
              filter && "cursor-pointer transition-all hover:shadow-md hover:border-green-300 dark:hover:border-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500",
              filter && statusFilter === filter && statusFilter !== "all" && "ring-2 ring-green-500 dark:ring-green-400",
            )}
          >
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-green-900 dark:text-slate-300">{title}</CardTitle>
              <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              {sub && <p className="text-xs text-green-700/70 dark:text-slate-500 mt-1">{sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardContent className="py-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-green-900 dark:text-slate-300 flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-green-600" /> Collection Progress
            </p>
            <p className="text-sm font-bold text-green-800 dark:text-green-300">
              {formatSAR(data.collectedAmount)} of {formatSAR(data.expectedAmount)} ({data.collectionRate}%)
            </p>
          </div>
          <Progress value={data.collectionRate} className="h-3" />
        </CardContent>
      </Card>

      {/* Activity timeline + case documents */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
              <History className="h-4 w-4 text-green-600" /> Case Timeline
            </CardTitle>
            <CardDescription className="dark:text-slate-400">Key milestones and payment activity for this case</CardDescription>
          </CardHeader>
          <CardContent>
            <CaseTimeline events={buildTimeline(claim, data.contributors, data.targetAmount)} />
          </CardContent>
        </Card>
        <FrfCaseDocuments claimId={id} isAdmin={isAdmin} />
      </div>

      <Card ref={contributorsRef} className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm scroll-mt-4">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <CardTitle className="text-base text-green-950 dark:text-green-100">Contributors</CardTitle>
              <CardDescription className="dark:text-slate-400">
                {contributors.length} of {data.contributors.length} member{data.contributors.length === 1 ? "" : "s"}
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-400 dark:text-slate-500" />
                <Input placeholder="Search name, ID, mobile, reference…" value={search} onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 border-green-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="collected">Collected (paid + partial)</SelectItem>
                  <SelectItem value="owing">Owing (pending + overdue + partial)</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="partial">Partially Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="exempt">Exempt</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
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
                  <TableHead className="dark:text-slate-300">Member</TableHead>
                  <TableHead className="dark:text-slate-300">Mobile</TableHead>
                  <TableHead className="dark:text-slate-300">Reference</TableHead>
                  <TableHead className="text-right dark:text-slate-300">Due</TableHead>
                  <TableHead className="text-right dark:text-slate-300">Paid</TableHead>
                  <TableHead className="text-right dark:text-slate-300">Balance</TableHead>
                  <TableHead className="dark:text-slate-300">Status</TableHead>
                  <TableHead className="dark:text-slate-300">Method</TableHead>
                  <TableHead className="dark:text-slate-300">Paid Date</TableHead>
                  <TableHead className="dark:text-slate-300">Receipt #</TableHead>
                  <TableHead className="dark:text-slate-300">Remarks</TableHead>
                  {canEdit && <TableHead className="dark:text-slate-300 w-12"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {contributors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 12 : 11} className="h-24 text-center text-green-600 dark:text-slate-500">
                      {data.contributors.length === 0
                        ? "No contributions yet. Contributions are generated when the claim is approved."
                        : "No contributors match the current filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  contributors.map((c) => (
                    <TableRow key={c.contributionId} className="hover:bg-green-50/30 dark:hover:bg-slate-800/50 dark:border-slate-800">
                      <TableCell>
                        <Link href={`/members/${c.memberId}`} className="flex items-center gap-2 hover:underline">
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={c.photoUrl ?? undefined} />
                            <AvatarFallback className="text-[10px] bg-green-100 text-green-800">{initials(c.fullName)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium text-green-950 dark:text-slate-200">{c.fullName}</div>
                            <div className="text-xs text-green-600 dark:text-slate-500">{c.membershipId}</div>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-green-800 dark:text-slate-300">{c.mobileNumber}</TableCell>
                      <TableCell className="text-sm text-green-800 dark:text-slate-300">{c.refMemberName || "—"}</TableCell>
                      <TableCell className="text-right font-medium text-green-900 dark:text-slate-200">{c.status === "exempt" ? "—" : formatSAR(c.amount)}</TableCell>
                      <TableCell className="text-right font-medium text-green-800 dark:text-green-300">{c.amountPaid > 0 ? formatSAR(c.amountPaid) : "—"}</TableCell>
                      <TableCell className={cn("text-right font-medium", c.status === "exempt" ? "text-slate-400" : c.balance > 0 ? "text-orange-700 dark:text-orange-400" : "text-green-700 dark:text-green-400")}>
                        {c.status === "exempt" ? "—" : formatSAR(c.balance)}
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("text-[11px]", CONTRIB_STATUS_STYLE[c.status] ?? "")}>{CONTRIB_STATUS_LABEL[c.status] ?? c.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-green-700 dark:text-slate-400 capitalize">{c.paymentMethod ? c.paymentMethod.replace("_", " ") : "—"}</TableCell>
                      <TableCell className="text-sm text-green-700 dark:text-slate-400">{c.paidAt ? formatDate(c.paidAt) : "—"}</TableCell>
                      <TableCell className="text-sm text-green-700 dark:text-slate-400">{c.receiptNumber || "—"}</TableCell>
                      <TableCell className="text-sm text-green-700 dark:text-slate-400 max-w-[160px] truncate" title={c.remarks ?? undefined}>{c.remarks || "—"}</TableCell>
                      {canEdit && (
                        <TableCell>
                          {c.status === "pending" || c.status === "overdue" ? (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-purple-600 hover:bg-purple-50 dark:hover:bg-slate-800" title="Mark exempt"
                              disabled={statusMutation.isPending}
                              onClick={() => statusMutation.mutate({ id, contributionId: c.contributionId, data: { status: "exempt" } })}>
                              <UserX className="h-3.5 w-3.5" />
                            </Button>
                          ) : c.status === "exempt" ? (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800" title="Revert to pending"
                              disabled={statusMutation.isPending}
                              onClick={() => statusMutation.mutate({ id, contributionId: c.contributionId, data: { status: "pending" } })}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
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
    </div>
  );
}
