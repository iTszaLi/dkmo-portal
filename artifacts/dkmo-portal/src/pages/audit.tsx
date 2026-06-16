import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ScrollText, Search, Download, FileSpreadsheet, FileText, ChevronLeft, ChevronRight,
  LogIn, LogOut, UserPlus, UserCog, UserMinus, CreditCard, HeartHandshake, Trash2,
  Shield, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── API types ────────────────────────────────────────────────────────────────

interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  module: string;
  entityId: string | null;
  entityName: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditLogsResponse {
  items: AuditLog[];
  total: number;
}

// ── Lookup tables ─────────────────────────────────────────────────────────────

const MODULES = ["auth", "members", "payments", "frf", "loans", "documents", "settings"];

const ACTIONS: Record<string, string> = {
  login: "Login",
  logout: "Logout",
  member_created: "Member Created",
  member_updated: "Member Updated",
  member_deleted: "Member Deleted",
  payment_created: "Payment Created",
  payment_deleted: "Payment Deleted",
  claim_created: "Claim Created",
  claim_updated: "Claim Updated",
  claim_approved: "Claim Approved",
  claim_rejected: "Claim Rejected",
  claim_deleted: "Claim Deleted",
  loan_created: "Loan Created",
  loan_updated: "Loan Updated",
  loan_closed: "Loan Closed",
  document_uploaded: "Document Uploaded",
  settings_changed: "Settings Changed",
};

const ACTION_ICON: Record<string, typeof LogIn> = {
  login: LogIn,
  logout: LogOut,
  member_created: UserPlus,
  member_updated: UserCog,
  member_deleted: UserMinus,
  payment_created: CreditCard,
  payment_deleted: Trash2,
  claim_created: HeartHandshake,
  claim_updated: HeartHandshake,
  claim_approved: HeartHandshake,
  claim_rejected: HeartHandshake,
  claim_deleted: Trash2,
  loan_created: Shield,
  loan_updated: Shield,
  loan_closed: Shield,
  document_uploaded: FileText,
  settings_changed: Shield,
};

const ACTION_COLOR: Record<string, string> = {
  login: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300",
  logout: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  member_created: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
  member_updated: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  member_deleted: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  payment_created: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  payment_deleted: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  claim_created: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
  claim_updated: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  claim_approved: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300",
  claim_rejected: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  claim_deleted: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  loan_created: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
  loan_updated: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  loan_closed: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  document_uploaded: "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300",
  settings_changed: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
};

const MODULE_COLOR: Record<string, string> = {
  auth: "text-slate-500 dark:text-slate-400",
  members: "text-blue-600 dark:text-blue-400",
  payments: "text-emerald-600 dark:text-emerald-400",
  frf: "text-purple-600 dark:text-purple-400",
  loans: "text-amber-600 dark:text-amber-400",
  documents: "text-teal-600 dark:text-teal-400",
  settings: "text-orange-600 dark:text-orange-400",
};

// ── Hook ──────────────────────────────────────────────────────────────────────

function useAuditLogs(params: {
  module?: string;
  action?: string;
  userId?: string;
  search?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}) {
  const query = new URLSearchParams();
  if (params.module && params.module !== "all") query.set("module", params.module);
  if (params.action && params.action !== "all") query.set("action", params.action);
  if (params.userId && params.userId !== "all") query.set("userId", params.userId);
  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  query.set("page", String(params.page));
  query.set("pageSize", String(params.pageSize));

  return useQuery<AuditLogsResponse>({
    queryKey: ["audit-logs", params],
    queryFn: async () => {
      const res = await fetch(`${basePath}/api/audit-logs?${query.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function actionLabel(action: string) {
  return ACTIONS[action] ?? action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Export helpers ─────────────────────────────────────────────────────────────

async function fetchAllLogs(params: object): Promise<AuditLog[]> {
  const query = new URLSearchParams({ ...(params as Record<string, string>), page: "1", pageSize: "2000" });
  const res = await fetch(`${basePath}/api/audit-logs?${query.toString()}`, { credentials: "include" });
  const data: AuditLogsResponse = await res.json();
  return data.items;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Audit() {
  const [module, setModule] = useState("all");
  const [action, setAction] = useState("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const { data, isLoading } = useAuditLogs({ module, action, search, from, to, page, pageSize: PAGE_SIZE });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Extract unique users from current page for display
  const uniqueUsers = useMemo(() => {
    const seen = new Map<string, string>();
    items.forEach((r) => seen.set(r.userId, r.userName));
    return seen;
  }, [items]);

  const resetFilters = () => {
    setModule("all"); setAction("all"); setSearch(""); setFrom(""); setTo(""); setPage(1);
  };

  const hasFilters = module !== "all" || action !== "all" || search || from || to;

  // ── Exports ─────────────────────────────────────────────────────────────────

  const exportCSV = async () => {
    const logs = await fetchAllLogs({ module: module !== "all" ? module : "", action: action !== "all" ? action : "", search, from, to });
    const header = ["Date & Time", "User", "Action", "Module", "Entity", "Details", "IP Address"];
    const rows = logs.map((r) => [
      formatTimestamp(r.createdAt),
      r.userName,
      actionLabel(r.action),
      r.module,
      r.entityName ?? r.entityId ?? "",
      r.details ?? "",
      r.ipAddress ?? "",
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DKMO_Audit_Trail_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = async () => {
    const logs = await fetchAllLogs({ module: module !== "all" ? module : "", action: action !== "all" ? action : "", search, from, to });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Audit Trail");
    ws.columns = [
      { header: "Date & Time", key: "date", width: 22 },
      { header: "User", key: "user", width: 20 },
      { header: "Action", key: "action", width: 22 },
      { header: "Module", key: "module", width: 14 },
      { header: "Entity", key: "entity", width: 28 },
      { header: "Details", key: "details", width: 40 },
      { header: "IP Address", key: "ip", width: 16 },
    ];
    ws.addRows(logs.map((r) => ({
      date: formatTimestamp(r.createdAt),
      user: r.userName,
      action: actionLabel(r.action),
      module: r.module,
      entity: r.entityName ?? r.entityId ?? "",
      details: r.details ?? "",
      ip: r.ipAddress ?? "",
    })));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } };
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DKMO_Audit_Trail_${new Date().toISOString().split("T")[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    const logs = await fetchAllLogs({ module: module !== "all" ? module : "", action: action !== "all" ? action : "", search, from, to });
    const doc = new jsPDF({ orientation: "landscape" });
    const logoDataUrl = await loadImageAsBase64(`${basePath}/logo.png`);
    const green: [number, number, number] = [5, 150, 105];

    doc.setFillColor(...green);
    doc.rect(0, 0, 297, 28, "F");
    if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", 5, 3, 18, 18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text("DKMO Audit Trail", 28, 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleString()}  ·  Total entries: ${logs.length}`, 28, 22);

    autoTable(doc, {
      startY: 34,
      head: [["Date & Time", "User", "Action", "Module", "Entity", "Details"]],
      body: logs.map((r) => [
        formatTimestamp(r.createdAt),
        r.userName,
        actionLabel(r.action),
        r.module,
        r.entityName ?? r.entityId ?? "",
        (r.details ?? "").slice(0, 60),
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: green, fontStyle: "bold", textColor: 255 },
      alternateRowStyles: { fillColor: [240, 253, 244] },
      columnStyles: {
        0: { cellWidth: 38 },
        1: { cellWidth: 28 },
        2: { cellWidth: 36 },
        3: { cellWidth: 20 },
        4: { cellWidth: 40 },
        5: { cellWidth: 80 },
      },
    });

    doc.save(`DKMO_Audit_Trail_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-green-950 dark:text-green-100 flex items-center gap-3">
            <ScrollText className="h-8 w-8 text-green-600 dark:text-green-400" />
            Audit Trail
          </h1>
          <p className="text-green-800/70 dark:text-slate-400 mt-1">
            Complete activity log — every login, change, and deletion recorded
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={exportCSV} variant="outline" size="sm" className="border-green-200 dark:border-slate-700 text-green-700 dark:text-slate-300 hover:bg-green-50 dark:hover:bg-slate-800">
            <Download className="h-4 w-4 mr-1.5" /> CSV
          </Button>
          <Button onClick={exportExcel} variant="outline" size="sm" className="border-green-200 dark:border-slate-700 text-green-700 dark:text-slate-300 hover:bg-green-50 dark:hover:bg-slate-800">
            <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel
          </Button>
          <Button onClick={exportPDF} variant="outline" size="sm" className="border-green-200 dark:border-slate-700 text-green-700 dark:text-slate-300 hover:bg-green-50 dark:hover:bg-slate-800">
            <FileText className="h-4 w-4 mr-1.5" /> PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="rounded-2xl border-green-100 dark:border-slate-700 dark:bg-slate-900 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-medium text-green-800 dark:text-green-300">
              <Filter className="h-4 w-4" /> Filters
            </div>
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-400 dark:text-slate-500" />
              <Input
                placeholder="Search user, action, entity…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9 h-9 border-green-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500"
              />
            </div>
            <Select value={module} onValueChange={(v) => { setModule(v); setPage(1); }}>
              <SelectTrigger className="w-[140px] h-9 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                <SelectValue placeholder="Module" />
              </SelectTrigger>
              <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                <SelectItem value="all" className="dark:text-slate-300">All Modules</SelectItem>
                {MODULES.map((m) => (
                  <SelectItem key={m} value={m} className="dark:text-slate-300 capitalize">{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={action} onValueChange={(v) => { setAction(v); setPage(1); }}>
              <SelectTrigger className="w-[170px] h-9 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                <SelectItem value="all" className="dark:text-slate-300">All Actions</SelectItem>
                {Object.entries(ACTIONS).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="dark:text-slate-300">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={from}
                onChange={(e) => { setFrom(e.target.value); setPage(1); }}
                className="h-9 w-36 border-green-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 text-sm"
                placeholder="From date"
              />
              <span className="text-green-600 dark:text-slate-400 text-sm">–</span>
              <Input
                type="date"
                value={to}
                onChange={(e) => { setTo(e.target.value); setPage(1); }}
                className="h-9 w-36 border-green-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 text-sm"
                placeholder="To date"
              />
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 h-9">
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Table */}
      <Card className="rounded-2xl border-green-100 dark:border-slate-700 dark:bg-slate-900 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base text-green-950 dark:text-green-100">Activity Log</CardTitle>
              <CardDescription className="dark:text-slate-400">
                {isLoading ? "Loading…" : `${total.toLocaleString()} entries`}
              </CardDescription>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2 text-sm text-green-700 dark:text-slate-300">
                <Button
                  variant="outline" size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="h-8 border-green-200 dark:border-slate-700"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs tabular-nums">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline" size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-8 border-green-200 dark:border-slate-700"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-green-50/50 dark:bg-slate-800/60">
                <TableRow className="dark:border-slate-700">
                  <TableHead className="font-semibold text-green-900 dark:text-slate-300 w-44">Date & Time</TableHead>
                  <TableHead className="font-semibold text-green-900 dark:text-slate-300 w-36">User</TableHead>
                  <TableHead className="font-semibold text-green-900 dark:text-slate-300">Action</TableHead>
                  <TableHead className="font-semibold text-green-900 dark:text-slate-300 w-24">Module</TableHead>
                  <TableHead className="font-semibold text-green-900 dark:text-slate-300">Entity</TableHead>
                  <TableHead className="font-semibold text-green-900 dark:text-slate-300">Details</TableHead>
                  <TableHead className="font-semibold text-green-900 dark:text-slate-300 w-32">IP Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i} className="dark:border-slate-800">
                      <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-28 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-44" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    </TableRow>
                  ))
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-green-600 dark:text-slate-500">
                      <div className="flex flex-col items-center gap-3">
                        <ScrollText className="h-8 w-8 text-green-200 dark:text-slate-700" />
                        <p className="text-sm">No activity logs found.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((log) => {
                    const Icon = ACTION_ICON[log.action] ?? ScrollText;
                    const color = ACTION_COLOR[log.action] ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
                    const modColor = MODULE_COLOR[log.module] ?? "text-green-600 dark:text-green-400";
                    return (
                      <TableRow key={log.id} className="hover:bg-green-50/30 dark:hover:bg-slate-800/40 dark:border-slate-800 transition-colors">
                        <TableCell className="text-xs text-green-700 dark:text-slate-400 font-mono whitespace-nowrap">
                          {formatTimestamp(log.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-slate-700 flex items-center justify-center text-[10px] font-bold text-green-800 dark:text-green-300 shrink-0">
                              {log.userName.slice(0, 2).toUpperCase()}
                            </div>
                            <span className="text-sm font-medium text-green-950 dark:text-slate-200 truncate max-w-[80px]">{log.userName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("text-xs font-semibold gap-1.5 py-0.5", color)}>
                            <Icon className="h-3 w-3 shrink-0" />
                            {actionLabel(log.action)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={cn("text-xs font-semibold capitalize", modColor)}>
                            {log.module}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-green-800 dark:text-slate-300 max-w-[140px]">
                          <div className="truncate" title={log.entityName ?? log.entityId ?? ""}>
                            {log.entityName ?? log.entityId ?? <span className="text-slate-400">—</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-green-700/80 dark:text-slate-400 max-w-[220px]">
                          <div className="truncate" title={log.details ?? ""}>
                            {log.details ?? <span className="text-slate-400">—</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                          {log.ipAddress ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
