import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  Search, Plus, Check, X, Eye, Clock, Filter, Download, ChevronDown,
  Users, CheckCircle, XCircle, AlertCircle, FileText, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { generateDkmoPdf, generateFrfApplicationPdf } from "@/lib/dkmo-pdf";
import { generateMembershipCertificatePdf } from "@/lib/dkmo-certificate-pdf";
import { Award } from "lucide-react";

const bp = import.meta.env.BASE_URL.replace(/\/$/, "");

type AppStatus = "submitted" | "under_review" | "approved" | "rejected" | "completed";

interface DkmoMembership {
  id: string;
  dkmoNumber: string;
  fullName: string;
  mobileSaudi: string;
  mobileIndia: string;
  email: string;
  occupation: string;
  district: string;
  nearestJamaath: string;
  status: AppStatus;
  refMemberName: string;
  refMemberId: string;
  createdAt: string;
  approvedBy: string;
  approvedAt: string | null;
  rejectedBy: string;
  rejectedAt: string | null;
  reviewedBy: string;
  reviewedAt: string | null;
  remarks: string;
  declineReason: string | null;
  passportNumber: string;
  iqamaNumber: string;
  bloodGroup: string;
  maritalStatus: string;
  familyInSaudi: string;
  dateOfBirth: string | null;
  areaSaudi: string;
  poBox: string;
  houseName: string;
  postalAddress: string;
  notes: string;
  numDependents: number;
}

interface Stats { total: number; pending: number; approved: number; rejected: number; newThisMonth: number; }

const STATUS_CONFIG: Record<AppStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
  submitted:    { label: "Pending",     variant: "secondary",    color: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/20 dark:border-amber-800/40" },
  under_review: { label: "Under Review", variant: "secondary",  color: "text-yellow-700 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-950/20 dark:border-yellow-800/40" },
  approved:     { label: "Approved",    variant: "default",      color: "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/30 dark:border-green-800/40" },
  completed:    { label: "Completed",   variant: "default",      color: "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/30 dark:border-green-800/40" },
  rejected:     { label: "Rejected",    variant: "destructive",  color: "text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/20 dark:border-red-800/40" },
};

function StatusBadge({ status }: { status: AppStatus }) {
  const c = STATUS_CONFIG[status] ?? STATUS_CONFIG.submitted;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${c.color}`}>{c.label}</span>;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function DkmoMemberships() {
  const [memberships, setMemberships] = useState<DkmoMembership[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<DkmoMembership | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [statusChangeOpen, setStatusChangeOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<AppStatus>("under_review");
  const [declineReason, setDeclineReason] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  async function fetchData() {
    setLoading(true);
    try {
      const [membRes, statsRes] = await Promise.all([
        fetch(`${bp}/api/dkmo/memberships`, { credentials: "include" }),
        fetch(`${bp}/api/dkmo/memberships/stats`, { credentials: "include" }),
      ]);
      if (membRes.ok) setMemberships(await membRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchData(); }, []);

  const filtered = memberships.filter((m) => {
    if (statusFilter !== "all" && m.status !== statusFilter) return false;
    if (q) {
      const lq = q.toLowerCase();
      return (
        m.fullName.toLowerCase().includes(lq) ||
        m.dkmoNumber.toLowerCase().includes(lq) ||
        m.mobileSaudi.includes(lq) ||
        m.email.toLowerCase().includes(lq)
      );
    }
    return true;
  });

  async function updateStatus(id: string, status: AppStatus, reason?: string) {
    setSaving(true);
    try {
      const res = await fetch(`${bp}/api/dkmo/memberships/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status, declineReason: reason ?? null }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast({ title: "Status updated", description: `Application marked as ${status}.` });
      setStatusChangeOpen(false);
      setDetailOpen(false);
      void fetchData();
    } catch {
      toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function openDetail(m: DkmoMembership) {
    setSelected(m);
    setNewStatus(m.status);
    setDeclineReason(m.declineReason ?? "");
    setDetailOpen(true);
  }

  function openStatusChange(m: DkmoMembership) {
    setSelected(m);
    setNewStatus(m.status);
    setDeclineReason(m.declineReason ?? "");
    setStatusChangeOpen(true);
  }

  function pdfFormData(m: DkmoMembership) {
    return {
      fullName: m.fullName, dateOfBirth: m.dateOfBirth, passportNumber: m.passportNumber,
      iqamaNumber: m.iqamaNumber, occupation: m.occupation, bloodGroup: m.bloodGroup,
      maritalStatus: m.maritalStatus, familyInSaudi: m.familyInSaudi,
      areaSaudi: m.areaSaudi, poBox: m.poBox, mobileSaudi: m.mobileSaudi, email: m.email,
      houseName: m.houseName, postalAddress: m.postalAddress,
      district: m.district, nearestJamaath: m.nearestJamaath,
      notes: m.notes,
      refMemberName: m.refMemberName, refMemberId: m.refMemberId,
    };
  }

  function handleDownloadPdf(m: DkmoMembership) {
    void generateDkmoPdf(pdfFormData(m), [], m.dkmoNumber, fmtDate(m.createdAt));
  }

  function handleDownloadFrfPdf(m: DkmoMembership) {
    void generateFrfApplicationPdf(pdfFormData(m), [], m.dkmoNumber, fmtDate(m.createdAt));
  }

  function handleDownloadCertificate(m: DkmoMembership) {
    void generateMembershipCertificatePdf({
      dkmoNumber: m.dkmoNumber,
      fullName: m.fullName,
      mobile: m.mobileSaudi || m.mobileIndia,
      photoUrl: null,
      approvedAt: m.approvedAt,
      createdAt: m.createdAt,
    });
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-green-950 dark:text-white">DKMO Memberships</h1>
          <p className="text-sm text-green-700/70 dark:text-slate-400">Manage DKMO membership applications</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}
            className="border-green-200 dark:border-slate-700 text-green-800 dark:text-green-300 gap-1">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <a href={`${bp}/dkmo-apply`} target="_blank" rel="noopener noreferrer">
            <Button size="sm" className="bg-green-800 hover:bg-green-900 dark:bg-green-700 dark:hover:bg-green-600 text-white gap-1">
              <Plus className="h-3.5 w-3.5" /> New Application
            </Button>
          </a>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total",    value: stats.total,    icon: Users,         color: "text-blue-700 dark:text-blue-400",   bg: "bg-blue-50 dark:bg-blue-950/20" },
            { label: "Pending",  value: stats.pending,  icon: AlertCircle,   color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/20" },
            { label: "Approved", value: stats.approved, icon: CheckCircle,   color: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/20" },
            { label: "Rejected", value: stats.rejected, icon: XCircle,       color: "text-red-700 dark:text-red-400",     bg: "bg-red-50 dark:bg-red-950/20" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <Card key={label} className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
              <CardContent className="pt-4 pb-4">
                <div className={`inline-flex h-9 w-9 rounded-lg items-center justify-center ${bg} mb-2`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                <p className="text-2xl font-bold text-green-950 dark:text-white">{value}</p>
                <p className="text-xs text-green-700/70 dark:text-slate-400">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardContent className="pt-4 pb-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by name, DKMO#, mobile…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 border-green-200 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44 border-green-200 dark:border-slate-700 dark:bg-slate-800/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="submitted">Pending</SelectItem>
              <SelectItem value="under_review">Under Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-green-50/80 dark:bg-slate-800/60 border-b border-green-100 dark:border-slate-700">
                <th className="text-left text-xs font-semibold text-green-800 dark:text-green-400 px-4 py-3">DKMO #</th>
                <th className="text-left text-xs font-semibold text-green-800 dark:text-green-400 px-4 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-green-800 dark:text-green-400 px-4 py-3 hidden md:table-cell">Mobile</th>
                <th className="text-left text-xs font-semibold text-green-800 dark:text-green-400 px-4 py-3 hidden lg:table-cell">Reference</th>
                <th className="text-left text-xs font-semibold text-green-800 dark:text-green-400 px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-green-800 dark:text-green-400 px-4 py-3 hidden sm:table-cell">Applied</th>
                <th className="text-right text-xs font-semibold text-green-800 dark:text-green-400 px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-green-50 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400 dark:text-slate-500">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400 dark:text-slate-500">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    No applications found
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-green-50/30 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-green-700 dark:text-green-400 font-semibold">{m.dkmoNumber}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-green-950 dark:text-white">{m.fullName}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{m.occupation}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="text-green-900 dark:text-slate-300 text-xs">
                        {m.mobileSaudi && <p>SA: {m.mobileSaudi}</p>}
                        {m.mobileIndia && <p>IN: {m.mobileIndia}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        {m.refMemberName ? (
                          <>
                            <p className="font-medium text-green-800 dark:text-green-400">{m.refMemberName}</p>
                            <p className="text-slate-400">{m.refMemberId}</p>
                          </>
                        ) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-xs text-slate-500 dark:text-slate-400">
                      {fmtDate(m.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" title="View details" onClick={() => openDetail(m)}
                          className="rounded-lg p-1.5 hover:bg-green-100 dark:hover:bg-slate-700 text-green-700 dark:text-green-400 transition-colors">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button type="button" title="Download Membership Form" onClick={() => handleDownloadPdf(m)}
                          className="rounded-lg p-1.5 hover:bg-green-100 dark:hover:bg-slate-700 text-green-700 dark:text-green-400 transition-colors">
                          <Download className="h-4 w-4" />
                        </button>
                        <button type="button" title="Download FRF Application Form" onClick={() => handleDownloadFrfPdf(m)}
                          className="rounded-lg p-1.5 hover:bg-green-100 dark:hover:bg-slate-700 text-green-700 dark:text-green-400 transition-colors">
                          <FileText className="h-4 w-4" />
                        </button>
                        {(m.status === "submitted" || m.status === "under_review") && (
                          <>
                            <button type="button" title="Approve" onClick={() => updateStatus(m.id, "approved")}
                              className="rounded-lg p-1.5 hover:bg-green-100 dark:hover:bg-green-900/40 text-green-600 dark:text-green-400 transition-colors">
                              <Check className="h-4 w-4" />
                            </button>
                            <button type="button" title="Change status" onClick={() => openStatusChange(m)}
                              className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors">
                              <ChevronDown className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-green-50 dark:border-slate-800">
            <p className="text-xs text-slate-400 dark:text-slate-500">{filtered.length} application{filtered.length !== 1 ? "s" : ""}</p>
          </div>
        )}
      </Card>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-green-950 dark:text-white">
              {selected?.fullName} — {selected?.dkmoNumber}
            </DialogTitle>
            <DialogDescription>
              Applied on {fmtDate(selected?.createdAt ?? null)}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-3">
                <StatusBadge status={selected.status} />
                {selected.refMemberName && (
                  <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 px-2 py-1 rounded-full">
                    Referred by: {selected.refMemberName} ({selected.refMemberId})
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Date of Birth", value: selected.dateOfBirth },
                  { label: "Blood Group", value: selected.bloodGroup },
                  { label: "Marital Status", value: selected.maritalStatus },
                  { label: "Family in Saudi", value: selected.familyInSaudi },
                  { label: "Passport", value: selected.passportNumber },
                  { label: "Iqama", value: selected.iqamaNumber },
                  { label: "Occupation", value: selected.occupation },
                  { label: "Mobile (Saudi)", value: selected.mobileSaudi },
                  { label: "Mobile (India)", value: selected.mobileIndia },
                  { label: "Email", value: selected.email },
                  { label: "Area (Saudi)", value: selected.areaSaudi },
                  { label: "House Name", value: selected.houseName },
                  { label: "District", value: selected.district },
                  { label: "Nearest Jama'at", value: selected.nearestJamaath },
                ].map(({ label, value }) => (
                  <div key={label} className="space-y-0.5">
                    <p className="text-xs text-slate-400 dark:text-slate-500">{label}</p>
                    <p className="font-medium text-green-900 dark:text-slate-200">{value || "—"}</p>
                  </div>
                ))}
              </div>

              {selected.notes && (
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                  <p className="text-xs text-slate-400 mb-1">Notes</p>
                  <p className="text-slate-700 dark:text-slate-300">{selected.notes}</p>
                </div>
              )}

              {selected.declineReason && (
                <div className="rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40 p-3">
                  <p className="text-xs text-red-500 mb-1">Decline Reason</p>
                  <p className="text-red-700 dark:text-red-300">{selected.declineReason}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 flex-wrap">
            {selected && (
              <>
                <Button variant="outline" onClick={() => handleDownloadPdf(selected)}
                  className="border-green-300 dark:border-green-800 text-green-800 dark:text-green-300 gap-1">
                  <Download className="h-3.5 w-3.5" /> Membership Form
                </Button>
                <Button variant="outline" onClick={() => handleDownloadFrfPdf(selected)}
                  className="border-green-300 dark:border-green-800 text-green-800 dark:text-green-300 gap-1">
                  <FileText className="h-3.5 w-3.5" /> FRF Application Form
                </Button>
                {(selected.status === "approved" || selected.status === "completed") && (
                  <Button variant="outline" onClick={() => handleDownloadCertificate(selected)}
                    className="border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 gap-1">
                    <Award className="h-3.5 w-3.5" /> Membership Certificate
                  </Button>
                )}
                {selected.status !== "approved" && selected.status !== "completed" && (
                  <Button onClick={() => updateStatus(selected.id, "approved")} disabled={saving}
                    className="bg-green-700 hover:bg-green-800 text-white gap-1">
                    <Check className="h-3.5 w-3.5" /> Approve
                  </Button>
                )}
                {selected.status !== "rejected" && (
                  <Button variant="destructive" onClick={() => { setStatusChangeOpen(true); setNewStatus("rejected"); setDetailOpen(false); }} className="gap-1">
                    <X className="h-3.5 w-3.5" /> Reject
                  </Button>
                )}
                {selected.status === "submitted" && (
                  <Button variant="outline" onClick={() => updateStatus(selected.id, "under_review")} disabled={saving}
                    className="border-yellow-300 dark:border-yellow-800 text-yellow-700 dark:text-yellow-400 gap-1">
                    <Clock className="h-3.5 w-3.5" /> Mark Under Review
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Change Dialog */}
      <Dialog open={statusChangeOpen} onOpenChange={setStatusChangeOpen}>
        <DialogContent className="max-w-md dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-green-950 dark:text-white">Update Status</DialogTitle>
            <DialogDescription>{selected?.fullName} — {selected?.dkmoNumber}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-green-900 dark:text-green-300">New Status</label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as AppStatus)}>
                <SelectTrigger className="border-green-200 dark:border-slate-700 dark:bg-slate-800/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="submitted">Pending</SelectItem>
                  <SelectItem value="under_review">Under Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newStatus === "rejected" && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-red-700 dark:text-red-400">Reason for declining</label>
                <Textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Explain why the application is being rejected…"
                  rows={3}
                  className="border-red-200 dark:border-red-800/50 dark:bg-slate-800/60 dark:text-slate-100"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusChangeOpen(false)}>Cancel</Button>
            <Button
              onClick={() => selected && updateStatus(selected.id, newStatus, newStatus === "rejected" ? declineReason : undefined)}
              disabled={saving}
              className="bg-green-800 hover:bg-green-900 dark:bg-green-700 dark:hover:bg-green-600 text-white"
            >
              {saving ? "Saving…" : "Save Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
