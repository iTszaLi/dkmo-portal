import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  useListFrfMemberships,
  useGetFrfMembershipStats,
  useDeleteFrfMembership,
  useUpdateFrfMembership,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Plus, UserCheck, Clock, CheckCircle, XCircle, Users,
  Download, FileSpreadsheet, FileText, Eye, Edit, Trash2,
  MoreHorizontal, Printer, CheckCircle2, ChevronDown, Square, CheckSquare,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { generateFrfPdf } from "@/lib/frf-pdf";
import ExcelJS from "exceljs";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  submitted:    { label: "Submitted",    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  under_review: { label: "Under Review", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  approved:     { label: "Approved",     color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  rejected:     { label: "Rejected",     color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  completed:    { label: "Completed",    color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
};

type FrfMembership = {
  id: string;
  frfNumber: string;
  fullName: string;
  dateOfBirth?: string | null;
  passportNumber?: string | null;
  iqamaNumber?: string | null;
  occupation?: string | null;
  companyName?: string | null;
  maritalStatus?: string | null;
  numDependents?: number | null;
  bloodGroup?: string | null;
  mobileSaudi?: string | null;
  mobileIndia?: string | null;
  email?: string | null;
  areaSaudi?: string | null;
  poBox?: string | null;
  businessPhone?: string | null;
  emergencyNameSaudi?: string | null;
  emergencyMobileSaudi?: string | null;
  houseName?: string | null;
  postalAddress?: string | null;
  district?: string | null;
  nearestJamaath?: string | null;
  homePhone?: string | null;
  emergencyNameIndia?: string | null;
  emergencyMobileIndia?: string | null;
  nomineeName?: string | null;
  nomineeRelation?: string | null;
  nomineeMobile?: string | null;
  status: string;
  notes?: string | null;
  createdAt?: string | null;
};

function v(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val);
}

async function exportToExcel(rows: FrfMembership[], filename: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DKMO Portal";
  const ws = wb.addWorksheet("FRF Applications");
  const headers = [
    "FRF ID", "Full Name", "Date of Birth", "Passport No", "Iqama No",
    "Occupation", "Employer", "Marital Status", "Dependents", "Blood Group",
    "Mobile (Saudi)", "Email", "Area (Saudi)", "PO Box", "Business Phone",
    "Emergency Name (Saudi)", "Emergency Mobile (Saudi)",
    "House Name", "Postal Address", "District", "Nearest Jamaath",
    "Home Phone", "Mobile (India)", "Emergency Name (India)", "Emergency Mobile (India)",
    "Status", "Application Date",
  ];
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14532D" } };
  headers.forEach((_, i) => { ws.getColumn(i + 1).width = 18; });
  rows.forEach((m) => {
    ws.addRow([
      v(m.frfNumber), v(m.fullName), v(m.dateOfBirth), v(m.passportNumber), v(m.iqamaNumber),
      v(m.occupation), v(m.companyName), v(m.maritalStatus), v(m.numDependents), v(m.bloodGroup),
      v(m.mobileSaudi), v(m.email), v(m.areaSaudi), v(m.poBox), v(m.businessPhone),
      v(m.emergencyNameSaudi), v(m.emergencyMobileSaudi),
      v(m.houseName), v(m.postalAddress), v(m.district), v(m.nearestJamaath),
      v(m.homePhone), v(m.mobileIndia), v(m.emergencyNameIndia), v(m.emergencyMobileIndia),
      v(m.status), v(m.createdAt),
    ]);
  });
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function exportToCsv(rows: FrfMembership[], filename: string) {
  const headers = [
    "FRF ID", "Full Name", "DOB", "Passport", "Iqama", "Occupation", "Employer",
    "Marital Status", "Dependents", "Blood Group", "Mobile (SA)", "Email",
    "Area (SA)", "PO Box", "Biz Phone", "Emg Name (SA)", "Emg Mobile (SA)",
    "House Name", "Postal", "District", "Jamaath", "Home Phone", "Mobile (IN)",
    "Emg Name (IN)", "Emg Mobile (IN)", "Status", "Applied",
  ];
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csvRows = [
    headers.map(escape).join(","),
    ...rows.map((m) => [
      v(m.frfNumber), v(m.fullName), v(m.dateOfBirth), v(m.passportNumber), v(m.iqamaNumber),
      v(m.occupation), v(m.companyName), v(m.maritalStatus), v(m.numDependents), v(m.bloodGroup),
      v(m.mobileSaudi), v(m.email), v(m.areaSaudi), v(m.poBox), v(m.businessPhone),
      v(m.emergencyNameSaudi), v(m.emergencyMobileSaudi),
      v(m.houseName), v(m.postalAddress), v(m.district), v(m.nearestJamaath),
      v(m.homePhone), v(m.mobileIndia), v(m.emergencyNameIndia), v(m.emergencyMobileIndia),
      v(m.status), v(m.createdAt),
    ].map(escape).join(",")),
  ];
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

export default function FrfMembershipPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [exporting, setExporting] = useState(false);

  // Quick action state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [approvingMembership, setApprovingMembership] = useState<FrfMembership | null>(null);
  const [rejectingMembership, setRejectingMembership] = useState<FrfMembership | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isSubmittingQuick, setIsSubmittingQuick] = useState(false);

  // Bulk action state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  const { data: memberships, isLoading, refetch } = useListFrfMemberships(
    { search: search || undefined, status: statusFilter !== "all" ? statusFilter : undefined }
  );

  const { data: stats, isLoading: isLoadingStats } = useGetFrfMembershipStats();

  const { mutateAsync: deleteMembership, isPending: isDeleting } = useDeleteFrfMembership({
    mutation: { onSuccess: () => { toast({ title: "Deleted", description: "FRF membership removed." }); void refetch(); } },
  });

  const { mutateAsync: updateMembership } = useUpdateFrfMembership();

  const dateStr = new Date().toISOString().split("T")[0];
  const statusStr = statusFilter !== "all" ? `_${statusFilter}` : "";

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (!memberships) return;
    if (selectedIds.size === memberships.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(memberships.map((m) => m.id)));
    }
  }, [memberships, selectedIds.size]);

  const handleBulkStatus = useCallback(async () => {
    if (!bulkAction || selectedIds.size === 0) return;
    setIsBulkSubmitting(true);
    try {
      const resp = await fetch("/api/frf/memberships/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), status: bulkAction }),
      });
      if (!resp.ok) throw new Error("Failed");
      const { updated } = await resp.json() as { updated: number };
      toast({ title: `${updated} application${updated !== 1 ? "s" : ""} updated to "${STATUS_MAP[bulkAction]?.label ?? bulkAction}"` });
      setSelectedIds(new Set());
      setBulkAction(null);
      void refetch();
    } catch {
      toast({ title: "Bulk update failed", variant: "destructive" });
    } finally {
      setIsBulkSubmitting(false);
    }
  }, [bulkAction, selectedIds, toast, refetch]);

  async function handleQuickStatus(m: FrfMembership, status: string) {
    setIsSubmittingQuick(true);
    try {
      await updateMembership({ id: m.id, data: { status: status as any, fullName: m.fullName } });
      toast({ title: `Status updated to ${STATUS_MAP[status]?.label ?? status}` });
      void refetch();
    } finally {
      setIsSubmittingQuick(false);
    }
  }

  async function handleApproveConfirm() {
    if (!approvingMembership) return;
    setIsSubmittingQuick(true);
    try {
      await updateMembership({ id: approvingMembership.id, data: { status: "approved", fullName: approvingMembership.fullName } });
      toast({ title: "Application Approved", description: `${approvingMembership.fullName} approved successfully.` });
      setApprovingMembership(null);
      void refetch();
    } finally {
      setIsSubmittingQuick(false);
    }
  }

  async function handleRejectConfirm() {
    if (!rejectingMembership || !rejectReason.trim()) return;
    setIsSubmittingQuick(true);
    try {
      await updateMembership({ id: rejectingMembership.id, data: { status: "rejected", declineReason: rejectReason.trim(), fullName: rejectingMembership.fullName } as any });
      toast({ title: "Application Rejected" });
      setRejectingMembership(null);
      setRejectReason("");
      void refetch();
    } finally {
      setIsSubmittingQuick(false);
    }
  }

  async function handleDownloadPdf(m: FrfMembership) {
    const submittedDate = m.createdAt
      ? new Date(m.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    await generateFrfPdf(
      {
        fullName: m.fullName,
        dateOfBirth: m.dateOfBirth,
        passportNumber: m.passportNumber,
        iqamaNumber: m.iqamaNumber,
        occupation: m.occupation,
        companyName: m.companyName,
        maritalStatus: m.maritalStatus,
        bloodGroup: m.bloodGroup,
        photoDataUrl: null,
        areaSaudi: m.areaSaudi,
        poBox: m.poBox,
        businessPhone: m.businessPhone,
        mobileSaudi: m.mobileSaudi,
        email: m.email,
        emergencyNameSaudi: m.emergencyNameSaudi,
        emergencyMobileSaudi: m.emergencyMobileSaudi,
        houseName: m.houseName,
        postalAddress: m.postalAddress,
        district: m.district,
        nearestJamaath: m.nearestJamaath,
        homePhone: m.homePhone,
        mobileIndia: m.mobileIndia,
        emergencyNameIndia: m.emergencyNameIndia,
        emergencyMobileIndia: m.emergencyMobileIndia,
        notes: m.notes,
      },
      [],
      m.frfNumber,
      submittedDate,
    );
  }

  const statCards = [
    { label: "Total",          value: stats?.total,        icon: Users,       color: "text-green-700 dark:text-green-400" },
    { label: "Pending Review", value: stats?.pending,      icon: Clock,       color: "text-yellow-600 dark:text-yellow-400" },
    { label: "Approved",       value: stats?.approved,     icon: CheckCircle, color: "text-green-700 dark:text-green-400" },
    { label: "New This Month", value: stats?.newThisMonth, icon: UserCheck,   color: "text-blue-600 dark:text-blue-400" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-green-950 dark:text-green-100">FRF Membership</h1>
          <p className="text-sm text-green-800/70 dark:text-slate-400 mt-1">Family Relief Fund membership applications</p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="border-green-200 dark:border-slate-700 text-green-800 dark:text-green-300 gap-2" disabled={exporting}>
                <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="dark:bg-slate-900 dark:border-slate-800">
              <DropdownMenuLabel className="dark:text-slate-300">Export FRF Applications</DropdownMenuLabel>
              <DropdownMenuSeparator className="dark:border-slate-700" />
              <DropdownMenuItem
                onClick={async () => {
                  if (!memberships?.length) { toast({ title: "No data to export" }); return; }
                  setExporting(true);
                  try { await exportToExcel(memberships as unknown as FrfMembership[], `DKMO_FRF${statusStr}_${dateStr}.xlsx`); toast({ title: "Excel exported" }); }
                  catch { toast({ title: "Export failed", variant: "destructive" }); }
                  finally { setExporting(false); }
                }}
                className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800"
              >
                <FileSpreadsheet className="h-4 w-4 text-green-700" /> Export to Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (!memberships?.length) { toast({ title: "No data to export" }); return; }
                  exportToCsv(memberships as unknown as FrfMembership[], `DKMO_FRF${statusStr}_${dateStr}.csv`);
                  toast({ title: "CSV exported" });
                }}
                className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800"
              >
                <FileText className="h-4 w-4 text-slate-600" /> Export to CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => setLocation("/frf-membership/new")} className="bg-green-800 hover:bg-green-900 dark:bg-green-700 dark:hover:bg-green-600 text-white">
            <Plus className="h-4 w-4 mr-2" /> New Application
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <CardContent className="pt-4 pb-4">
              {isLoadingStats ? <Skeleton className="h-8 w-16" /> : (
                <div className="flex items-center gap-3">
                  <Icon className={`h-5 w-5 ${color}`} />
                  <div>
                    <p className="text-2xl font-bold text-green-950 dark:text-white">{value ?? 0}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-green-800 dark:bg-green-900 text-white shadow">
          <div className="flex items-center gap-2 flex-1">
            <CheckSquare className="h-5 w-5 text-green-200" />
            <span className="font-semibold text-sm">{selectedIds.size} selected</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="bg-yellow-500 hover:bg-yellow-400 text-white border-0 gap-1"
              onClick={() => setBulkAction("under_review")}
              disabled={isBulkSubmitting}
            >
              <Clock className="h-4 w-4" /> Mark Under Review
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="bg-green-400 hover:bg-green-300 text-green-950 border-0 gap-1"
              onClick={() => setBulkAction("approved")}
              disabled={isBulkSubmitting}
            >
              <CheckCircle2 className="h-4 w-4" /> Approve All
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-green-700 gap-1"
              onClick={() => setSelectedIds(new Set())}
            >
              <XCircle className="h-4 w-4" /> Deselect All
            </Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-700/60 dark:text-green-500/60" />
          <Input
            placeholder="Search by name, FRF#, mobile, passport, iqama..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 border-green-200 dark:border-slate-700 dark:bg-slate-800/60"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44 border-green-200 dark:border-slate-700 dark:bg-slate-800/60">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="under_review">Under Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-green-100 dark:border-slate-800 bg-green-50/50 dark:bg-slate-800/50">
                <th className="px-4 py-3 w-10">
                  <button onClick={toggleSelectAll} className="text-green-700 dark:text-green-400 hover:text-green-900">
                    {memberships && selectedIds.size === memberships.length && memberships.length > 0
                      ? <CheckSquare className="h-4 w-4" />
                      : <Square className="h-4 w-4" />}
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-green-900 dark:text-green-300">FRF #</th>
                <th className="text-left px-4 py-3 font-semibold text-green-900 dark:text-green-300">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-green-900 dark:text-green-300 hidden md:table-cell">Mobile</th>
                <th className="text-left px-4 py-3 font-semibold text-green-900 dark:text-green-300 hidden lg:table-cell">Area</th>
                <th className="text-left px-4 py-3 font-semibold text-green-900 dark:text-green-300">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-green-900 dark:text-green-300 hidden sm:table-cell">Applied</th>
                <th className="text-right px-4 py-3 font-semibold text-green-900 dark:text-green-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-green-50 dark:border-slate-800">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : memberships?.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                    No FRF memberships found
                  </td>
                </tr>
              ) : (
                memberships?.map((m) => {
                  const statusInfo = STATUS_MAP[m.status] ?? { label: m.status, color: "bg-slate-100 text-slate-800" };
                  const ms = m as unknown as FrfMembership;
                  const isSelected = selectedIds.has(m.id);
                  return (
                    <tr key={m.id} className={`border-b border-green-50 dark:border-slate-800 hover:bg-green-50/40 dark:hover:bg-slate-800/40 transition-colors ${isSelected ? "bg-green-50 dark:bg-green-950/20" : ""}`}>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleSelect(m.id)} className="text-green-700 dark:text-green-400 hover:text-green-900">
                          {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-medium text-green-800 dark:text-green-300">{m.frfNumber}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-green-950 dark:text-slate-100">{m.fullName}</div>
                        {m.occupation && <div className="text-xs text-slate-500 dark:text-slate-400">{m.occupation}</div>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-slate-600 dark:text-slate-400 text-xs">
                        {m.mobileSaudi || m.mobileIndia || "—"}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-slate-600 dark:text-slate-400 text-xs">{m.areaSaudi || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs font-medium ${statusInfo.color}`}>{statusInfo.label}</Badge>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-xs text-slate-500 dark:text-slate-400">
                        {formatDate(m.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600 dark:text-slate-400 hover:bg-green-50 dark:hover:bg-slate-800">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52 dark:bg-slate-900 dark:border-slate-800">
                            <DropdownMenuLabel className="dark:text-slate-300 text-xs">Application Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator className="dark:border-slate-700" />
                            <DropdownMenuItem onClick={() => setLocation(`/frf-membership/${m.id}`)} className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800">
                              <Eye className="h-4 w-4 text-green-600" /> View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setLocation(`/frf-membership/${m.id}/edit`)} className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800">
                              <Edit className="h-4 w-4 text-blue-500" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="dark:border-slate-700" />
                            {m.status !== "under_review" && (
                              <DropdownMenuItem onClick={() => handleQuickStatus(ms, "under_review")} disabled={isSubmittingQuick} className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800">
                                <Clock className="h-4 w-4 text-yellow-500" /> Mark Under Review
                              </DropdownMenuItem>
                            )}
                            {m.status !== "approved" && m.status !== "completed" && (
                              <DropdownMenuItem onClick={() => setApprovingMembership(ms)} className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800">
                                <CheckCircle2 className="h-4 w-4 text-green-600" /> Approve
                              </DropdownMenuItem>
                            )}
                            {m.status !== "rejected" && (
                              <DropdownMenuItem onClick={() => { setRejectingMembership(ms); setRejectReason(""); }} className="gap-2 cursor-pointer text-red-600 dark:text-red-400 dark:focus:bg-slate-800">
                                <XCircle className="h-4 w-4" /> Reject
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator className="dark:border-slate-700" />
                            <DropdownMenuItem onClick={() => setLocation(`/frf-membership/${m.id}`)} className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800">
                              <Printer className="h-4 w-4 text-slate-500" /> Print
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownloadPdf(ms)} className="gap-2 cursor-pointer dark:text-slate-300 dark:focus:bg-slate-800">
                              <Download className="h-4 w-4 text-slate-500" /> Download PDF
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="dark:border-slate-700" />
                            <DropdownMenuItem onClick={() => setDeleteId(m.id)} className="gap-2 cursor-pointer text-red-600 dark:text-red-400 dark:focus:bg-slate-800">
                              <Trash2 className="h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Bulk Status Confirmation */}
      <AlertDialog open={!!bulkAction} onOpenChange={(o) => !o && setBulkAction(null)}>
        <AlertDialogContent className="dark:bg-slate-900 dark:border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className={bulkAction === "approved" ? "text-green-800 dark:text-green-300" : "text-yellow-700 dark:text-yellow-400"}>
              {bulkAction === "approved" ? "Approve Selected Applications?" : "Mark Applications Under Review?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will update <strong>{selectedIds.size}</strong> application{selectedIds.size !== 1 ? "s" : ""} to{" "}
              <strong>{STATUS_MAP[bulkAction ?? ""]?.label}</strong>. This action is logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-slate-700">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={bulkAction === "approved" ? "bg-green-700 hover:bg-green-800 text-white" : "bg-yellow-600 hover:bg-yellow-700 text-white"}
              onClick={handleBulkStatus}
              disabled={isBulkSubmitting}
            >
              {isBulkSubmitting ? "Updating…" : `Update ${selectedIds.size} Application${selectedIds.size !== 1 ? "s" : ""}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="dark:bg-slate-900 dark:border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete FRF membership?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the membership and all its dependents.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-slate-700">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white"
              onClick={async () => { if (deleteId) { await deleteMembership({ id: deleteId }); setDeleteId(null); } }}>
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approve Confirmation */}
      <AlertDialog open={!!approvingMembership} onOpenChange={(o) => !o && setApprovingMembership(null)}>
        <AlertDialogContent className="dark:bg-slate-900 dark:border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-green-800 dark:text-green-300">Approve Application?</AlertDialogTitle>
            <AlertDialogDescription>
              Approve FRF membership application for <strong>{approvingMembership?.fullName}</strong> ({approvingMembership?.frfNumber})?
              This will be recorded with your name and the current timestamp.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-slate-700">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-green-700 hover:bg-green-800 text-white" onClick={handleApproveConfirm} disabled={isSubmittingQuick}>
              {isSubmittingQuick ? "Approving…" : "Approve"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejectingMembership} onOpenChange={(o) => !o && setRejectingMembership(null)}>
        <DialogContent className="sm:max-w-md dark:bg-slate-900 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-red-700 dark:text-red-400">Reject Application</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting <strong>{rejectingMembership?.fullName}</strong>'s application.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="reject-reason" className="text-sm font-medium">Reason <span className="text-red-500">*</span></Label>
            <Textarea
              id="reject-reason"
              placeholder="e.g. Incomplete documentation, eligibility criteria not met…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              className="border-red-200 dark:border-slate-700 dark:bg-slate-800/60 resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingMembership(null)} className="dark:border-slate-700">Cancel</Button>
            <Button onClick={handleRejectConfirm} disabled={!rejectReason.trim() || isSubmittingQuick} className="bg-red-600 hover:bg-red-700 text-white">
              {isSubmittingQuick ? "Rejecting…" : "Reject Application"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
