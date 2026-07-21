import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  CopyCheck, RefreshCw, AlertTriangle, Trash2, ShieldCheck, Phone, Mail, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const bp = import.meta.env.BASE_URL.replace(/\/$/, "");

type AppStatus = "submitted" | "under_review" | "approved" | "rejected" | "completed";

interface DupRecord {
  id: string;
  dkmoNumber: string;
  fullName: string;
  mobileSaudi: string;
  mobileIndia: string;
  email: string;
  status: AppStatus;
  memberId: string | null;
  createdAt: string;
}

interface DupGroup {
  type: "mobile" | "email";
  value: string;
  count: number;
  records: DupRecord[];
}

const STATUS_LABEL: Record<AppStatus, { label: string; color: string }> = {
  submitted:    { label: "Pending",      color: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/20 dark:border-amber-800/40" },
  under_review: { label: "Under Review", color: "text-yellow-700 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-950/20 dark:border-yellow-800/40" },
  approved:     { label: "Approved",     color: "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/30 dark:border-green-800/40" },
  completed:    { label: "Completed",    color: "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/30 dark:border-green-800/40" },
  rejected:     { label: "Rejected",     color: "text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/20 dark:border-red-800/40" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function DkmoDuplicates() {
  const [groups, setGroups] = useState<DupGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ record: DupRecord; keep: DupRecord } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`${bp}/api/dkmo/memberships/duplicates`, { credentials: "include" });
      if (res.ok) setGroups(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchData(); }, []);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${bp}/api/dkmo/memberships/${deleteTarget.record.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast({ title: "Record removed", description: `${deleteTarget.record.dkmoNumber} was deleted.` });
      setDeleteTarget(null);
      void fetchData();
    } catch {
      toast({ title: "Error", description: "Failed to delete the record.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  const totalDuplicateRecords = groups.reduce((sum, g) => sum + g.records.length, 0);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-green-950 dark:text-white">Duplicate Detection</h1>
          <p className="text-sm text-green-700/70 dark:text-slate-400">
            Membership records that share the same mobile number or email address
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}
            className="border-green-200 dark:border-slate-700 text-green-800 dark:text-green-300 gap-1">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Link href="/dkmo-memberships">
            <Button variant="outline" size="sm"
              className="border-green-200 dark:border-slate-700 text-green-800 dark:text-green-300 gap-1">
              <ExternalLink className="h-3.5 w-3.5" /> All Memberships
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardContent className="pt-4 pb-4">
            <div className="inline-flex h-9 w-9 rounded-lg items-center justify-center bg-amber-50 dark:bg-amber-950/20 mb-2">
              <CopyCheck className="h-4 w-4 text-amber-700 dark:text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-green-950 dark:text-white">{groups.length}</p>
            <p className="text-xs text-green-700/70 dark:text-slate-400">Duplicate groups</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardContent className="pt-4 pb-4">
            <div className="inline-flex h-9 w-9 rounded-lg items-center justify-center bg-red-50 dark:bg-red-950/20 mb-2">
              <AlertTriangle className="h-4 w-4 text-red-700 dark:text-red-400" />
            </div>
            <p className="text-2xl font-bold text-green-950 dark:text-white">{totalDuplicateRecords}</p>
            <p className="text-xs text-green-700/70 dark:text-slate-400">Records involved</p>
          </CardContent>
        </Card>
      </div>

      {/* Groups */}
      {loading ? (
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardContent className="py-16 text-center text-slate-400 dark:text-slate-500">
            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
            Loading…
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardContent className="py-16 text-center">
            <div className="inline-flex h-12 w-12 rounded-full items-center justify-center bg-green-50 dark:bg-green-950/30 mb-3">
              <ShieldCheck className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <p className="font-medium text-green-950 dark:text-white">No duplicates found</p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
              Every membership record has a unique mobile number and email address.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            // The oldest active (non-rejected) record is suggested as the one to keep.
            const sorted = [...g.records].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            const keep = sorted.find((r) => r.status !== "rejected") ?? sorted[0]!;
            return (
              <Card key={`${g.type}-${g.value}`} className="rounded-2xl border-amber-200 dark:border-amber-900/40 dark:bg-slate-900 shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-amber-50/70 dark:bg-amber-950/20 border-b border-amber-100 dark:border-amber-900/40 flex items-center gap-2">
                  {g.type === "mobile"
                    ? <Phone className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                    : <Mail className="h-4 w-4 text-amber-700 dark:text-amber-400" />}
                  <span className="text-sm font-medium text-amber-900 dark:text-amber-300">
                    Same {g.type === "mobile" ? "mobile number" : "email"}:
                  </span>
                  <span className="text-sm font-mono text-amber-900 dark:text-amber-200">{g.value}</span>
                  <Badge variant="secondary" className="ml-auto bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border-0">
                    {g.count} records
                  </Badge>
                </div>
                <div className="divide-y divide-green-50 dark:divide-slate-800">
                  {sorted.map((r) => {
                    const isKeep = r.id === keep.id;
                    const st = STATUS_LABEL[r.status] ?? STATUS_LABEL.submitted;
                    return (
                      <div key={r.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                        <div className="flex-1 min-w-48">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-green-700 dark:text-green-400 font-semibold">{r.dkmoNumber}</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${st.color}`}>{st.label}</span>
                            {isKeep && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/30 dark:border-green-800/40">
                                <ShieldCheck className="h-3 w-3" /> Suggested keep
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-green-950 dark:text-white mt-1">{r.fullName}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            {r.mobileSaudi && `SA ${r.mobileSaudi}`}{r.email && ` · ${r.email}`} · applied {fmtDate(r.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Link href={`/dkmo-memberships`}>
                            <Button variant="ghost" size="sm" className="text-green-700 dark:text-green-400 gap-1">
                              <ExternalLink className="h-3.5 w-3.5" /> View
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isKeep}
                            onClick={() => setDeleteTarget({ record: r, keep })}
                            className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 gap-1 disabled:opacity-30"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-md dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-green-950 dark:text-white flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" /> Delete duplicate record?
            </DialogTitle>
            <DialogDescription>
              This permanently deletes the membership record and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-3 text-sm">
              <div className="rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40 p-3">
                <p className="text-xs text-red-500 mb-1">Deleting</p>
                <p className="font-medium text-red-800 dark:text-red-300">
                  {deleteTarget.record.dkmoNumber} — {deleteTarget.record.fullName}
                </p>
              </div>
              <div className="rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/40 p-3">
                <p className="text-xs text-green-600 mb-1">Keeping</p>
                <p className="font-medium text-green-800 dark:text-green-300">
                  {deleteTarget.keep.dkmoNumber} — {deleteTarget.keep.fullName}
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-1">
              <Trash2 className="h-3.5 w-3.5" /> {deleting ? "Deleting…" : "Delete record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
