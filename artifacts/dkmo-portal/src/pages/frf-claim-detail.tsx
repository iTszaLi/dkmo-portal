import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useGetFrfClaimCollection } from "@workspace/api-client-react";
import type { FrfContributor } from "@workspace/api-client-react";
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
  CheckCircle2, Clock, AlertTriangle, DollarSign,
} from "lucide-react";
import { cn, formatSAR, formatDate } from "@/lib/utils";
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
  pending: "bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300 ring-1 ring-orange-300/50",
  overdue: "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300 ring-1 ring-red-300/50",
  cancelled: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 ring-1 ring-slate-300/50",
};

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export default function FrfClaimDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const { data, isLoading, error } = useGetFrfClaimCollection(id);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const contributors = useMemo(() => {
    let rows: FrfContributor[] = data?.contributors ?? [];
    if (statusFilter !== "all") rows = rows.filter((c) => c.status === statusFilter);
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
    const header = ws.addRow(["Member", "Membership ID", "Mobile", "Reference", "Amount (SAR)", "Status", "Paid Date", "Receipt #"]);
    header.font = { bold: true };
    for (const c of contributors) {
      ws.addRow([
        c.fullName, c.membershipId, c.mobileNumber, c.refMemberName || "—",
        c.amount, c.status, c.paidAt ? formatDate(c.paidAt) : "—", c.receiptNumber || "—",
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
      head: [["Member", "Membership ID", "Mobile", "Reference", "Amount", "Status", "Paid Date"]],
      body: contributors.map((c) => [
        c.fullName, c.membershipId, c.mobileNumber, c.refMemberName || "—",
        `SAR ${c.amount}`, c.status, c.paidAt ? formatDate(c.paidAt) : "—",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [21, 128, 61] },
    });
    doc.save(`frf-collection-${data.claim.claimantName.replace(/\s+/g, "-").toLowerCase()}.pdf`);
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

  const stats = [
    { title: "Contributing Members", value: String(data.totalMembers), icon: Users, color: "text-green-700 dark:text-green-400" },
    { title: "Collected", value: formatSAR(data.collectedAmount), icon: CheckCircle2, color: "text-green-700 dark:text-green-400", sub: `${data.paidCount} paid` },
    { title: "Pending", value: formatSAR(data.outstandingAmount), icon: Clock, color: "text-orange-600 dark:text-orange-400", sub: `${data.pendingCount} pending` },
    { title: "Overdue", value: String(data.overdueCount), icon: AlertTriangle, color: "text-red-600 dark:text-red-400", sub: "30+ days" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Link href="/frf" className="inline-flex items-center gap-1 text-sm text-green-700 dark:text-green-400 hover:underline mb-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Family Relief Fund
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-green-950 dark:text-green-100 flex items-center gap-2">
            <HeartHandshake className="h-6 w-6 text-green-700 dark:text-green-400" />
            {claim.claimantName}
          </h1>
          <p className="text-green-800/70 dark:text-slate-400 mt-1 text-sm">
            {CLAIM_TYPE_LABEL[claim.claimType] ?? claim.claimType} · Approved {formatDate(claim.approvedDate ?? null)} · Contribution {formatSAR(claim.contributionAmount)} per member
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel} className="dark:border-slate-700">
            <FileSpreadsheet className="h-4 w-4 mr-1.5 text-green-600" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportPdf} className="dark:border-slate-700">
            <Download className="h-4 w-4 mr-1.5 text-green-600" /> PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ title, value, icon: Icon, color, sub }) => (
          <Card key={title} className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
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

      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
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
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
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
                  <TableHead className="text-right dark:text-slate-300">Amount</TableHead>
                  <TableHead className="dark:text-slate-300">Status</TableHead>
                  <TableHead className="dark:text-slate-300">Paid Date</TableHead>
                  <TableHead className="dark:text-slate-300">Receipt #</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contributors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-green-600 dark:text-slate-500">
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
                      <TableCell className="text-right font-medium text-green-900 dark:text-slate-200">{formatSAR(c.amount)}</TableCell>
                      <TableCell>
                        <Badge className={cn("text-[11px] capitalize", CONTRIB_STATUS_STYLE[c.status] ?? "")}>{c.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-green-700 dark:text-slate-400">{c.paidAt ? formatDate(c.paidAt) : "—"}</TableCell>
                      <TableCell className="text-sm text-green-700 dark:text-slate-400">{c.receiptNumber || "—"}</TableCell>
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
