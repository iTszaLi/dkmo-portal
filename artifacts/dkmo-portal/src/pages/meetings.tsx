import { useMemo, useState, useEffect } from "react";
import {
  useListMeetings,
  useGetMeeting,
  useCreateMeeting,
  useUpdateMeeting,
  useDeleteMeeting,
  useSetMeetingAttendance,
  useListMembers,
} from "@workspace/api-client-react";
import type { AttendanceRow, Member } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
  ClipboardCheck,
  CalendarDays,
  MapPin,
  Plus,
  Users,
  Crown,
  ShieldCheck,
  Search,
  Pencil,
  Trash2,
  Save,
  FileText,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Percent,
} from "lucide-react";
import { formatDate, cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { MemberAvatar } from "@/components/MemberAvatar";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

async function loadImageAsBase64(url: string): Promise<string> {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

// Committee membership derives from two fully independent DB flags:
// isExecutiveCommittee and isCoreCommittee. A member may be on either, both,
// or neither — there is no implied link between them.
function isExecutiveMember(m: { isExecutiveCommittee?: boolean | null }): boolean {
  return (m as any).isExecutiveCommittee === true;
}

function isCoreMember(m: { isCoreCommittee?: boolean | null }): boolean {
  return (m as any).isCoreCommittee === true;
}

type TypeFilter = "all" | "executive" | "core";
type MemberView = "total" | "executive" | "core" | null;

export default function Meetings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: meetings, isLoading: meetingsLoading } = useListMeetings();
  const { data: members } = useListMembers();

  const photoByMemberId = useMemo(() => {
    const map: Record<string, string | null | undefined> = {};
    for (const m of members ?? []) map[m.id] = m.photoUrl;
    return map;
  }, [members]);

  const [selectedId, setSelectedId] = useState<string>("");

  // Auto-select most recent meeting once meetings load.
  useEffect(() => {
    if (!selectedId && meetings && meetings.length > 0) {
      const sorted = [...meetings].sort(
        (a, b) => new Date(b.meetingDate).getTime() - new Date(a.meetingDate).getTime(),
      );
      setSelectedId(sorted[0]!.id);
    }
  }, [meetings, selectedId]);

  const sortedMeetings = useMemo(() => {
    if (!meetings) return [];
    return [...meetings].sort(
      (a, b) => new Date(b.meetingDate).getTime() - new Date(a.meetingDate).getTime(),
    );
  }, [meetings]);

  // ── header stats ──────────────────────────────────────────────────────────
  // Executive Committee and Core Committee are fully independent flags. A member
  // is counted in a card only if that specific flag is set; the two cards do not
  // imply one another.
  const memberStats = useMemo(() => {
    const list: Member[] = members ?? [];
    let executive = 0;
    let core = 0;
    for (const m of list) {
      if (isExecutiveMember(m)) executive += 1;
      if (isCoreMember(m)) core += 1;
    }
    return { total: list.length, executive, core };
  }, [members]);

  const executiveIds = useMemo(() => {
    const s = new Set<string>();
    for (const m of members ?? []) if (isExecutiveMember(m)) s.add(m.id);
    return s;
  }, [members]);

  const coreIds = useMemo(() => {
    const s = new Set<string>();
    for (const m of members ?? []) if (isCoreMember(m)) s.add(m.id);
    return s;
  }, [members]);

  // ── clickable summary cards → member list ───────────────────────────────────
  const [memberView, setMemberView] = useState<MemberView>(null);
  const toggleMemberView = (v: Exclude<MemberView, null>) =>
    setMemberView((prev) => (prev === v ? null : v));

  const viewMembers = useMemo(() => {
    const list: Member[] = members ?? [];
    if (memberView === "executive") return list.filter(isExecutiveMember);
    if (memberView === "core") return list.filter(isCoreMember);
    if (memberView === "total") return list;
    return [];
  }, [members, memberView]);

  // ── create / edit dialog ────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", meetingDate: "", location: "", notes: "" });

  const createMeeting = useCreateMeeting();
  const updateMeeting = useUpdateMeeting();
  const deleteMeeting = useDeleteMeeting();
  const setAttendance = useSetMeetingAttendance();

  const openNewDialog = () => {
    setEditingId(null);
    setForm({ title: "", meetingDate: new Date().toISOString().split("T")[0]!, location: "", notes: "" });
    setDialogOpen(true);
  };

  const openEditDialog = () => {
    if (!detail) return;
    setEditingId(detail.id);
    setForm({
      title: detail.title,
      meetingDate: detail.meetingDate ? detail.meetingDate.split("T")[0]! : "",
      location: detail.location ?? "",
      notes: detail.notes ?? "",
    });
    setDialogOpen(true);
  };

  const invalidateMeetings = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.meetingDate.trim()) {
      toast({ title: "Missing fields", description: "Title and date are required.", variant: "destructive" });
      return;
    }
    const data = {
      title: form.title.trim(),
      meetingDate: form.meetingDate,
      location: form.location.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };
    if (editingId) {
      updateMeeting.mutate(
        { id: editingId, data },
        {
          onSuccess: (res) => {
            invalidateMeetings();
            queryClient.invalidateQueries({ queryKey: [`/api/meetings/${editingId}`] });
            setDialogOpen(false);
            toast({ title: "Meeting updated", description: res.title });
          },
          onError: (err) =>
            toast({ title: "Update failed", description: String(err), variant: "destructive" }),
        },
      );
    } else {
      createMeeting.mutate(
        { data },
        {
          onSuccess: (res) => {
            invalidateMeetings();
            setSelectedId(res.id);
            setDialogOpen(false);
            toast({ title: "Meeting created", description: res.title });
          },
          onError: (err) =>
            toast({ title: "Create failed", description: String(err), variant: "destructive" }),
        },
      );
    }
  };

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const handleDelete = () => {
    if (!detail) return;
    setConfirmDeleteOpen(false);
    deleteMeeting.mutate(
      { id: detail.id },
      {
        onSuccess: () => {
          invalidateMeetings();
          setSelectedId("");
          toast({ title: "Meeting deleted" });
        },
        onError: (err) =>
          toast({ title: "Delete failed", description: String(err), variant: "destructive" }),
      },
    );
  };

  // ── selected meeting register ───────────────────────────────────────────────
  const { data: detail, isLoading: detailLoading } = useGetMeeting(selectedId);

  const [localStatus, setLocalStatus] = useState<Record<string, AttendanceRow["status"]>>({});
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  // Sync local attendance state whenever the detail changes.
  useEffect(() => {
    if (detail) {
      const map: Record<string, AttendanceRow["status"]> = {};
      for (const row of detail.attendance) map[row.memberId] = row.status;
      setLocalStatus(map);
    }
  }, [detail]);

  const toggleStatus = (memberId: string) => {
    setLocalStatus((prev) => ({
      ...prev,
      [memberId]: prev[memberId] === "present" ? "absent" : "present",
    }));
  };

  const filteredRows = useMemo(() => {
    const rows = detail?.attendance ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesSearch =
        !q ||
        r.fullName.toLowerCase().includes(q) ||
        r.membershipId.toLowerCase().includes(q) ||
        r.mobileNumber.toLowerCase().includes(q);
      const matchesType =
        typeFilter === "all" ||
        (typeFilter === "executive" && executiveIds.has(r.memberId)) ||
        (typeFilter === "core" && coreIds.has(r.memberId));
      return matchesSearch && matchesType;
    });
  }, [detail, search, typeFilter, executiveIds, coreIds]);

  const liveTotals = useMemo(() => {
    const rows = detail?.attendance ?? [];
    let present = 0;
    for (const r of rows) {
      if ((localStatus[r.memberId] ?? r.status) === "present") present += 1;
    }
    const total = rows.length;
    const absent = total - present;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
    return { total, present, absent, percentage };
  }, [detail, localStatus]);

  const handleSaveAttendance = () => {
    if (!detail) return;
    const records = detail.attendance.map((r) => ({
      memberId: r.memberId,
      status: localStatus[r.memberId] ?? r.status,
    }));
    setAttendance.mutate(
      { id: detail.id, data: { records } },
      {
        onSuccess: () => {
          invalidateMeetings();
          queryClient.invalidateQueries({ queryKey: [`/api/meetings/${detail.id}`] });
          toast({ title: "Attendance saved", description: detail.title });
        },
        onError: (err) =>
          toast({ title: "Save failed", description: String(err), variant: "destructive" }),
      },
    );
  };

  // ── exports ─────────────────────────────────────────────────────────────────
  const exportPDF = async () => {
    if (!detail) return;
    const doc = new jsPDF();
    const green: [number, number, number] = [5, 150, 105];
    const logoDataUrl = await loadImageAsBase64(`${basePath}/logo-circle.png`);

    doc.setFillColor(...green);
    doc.rect(0, 0, 210, 32, "F");

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", 5, 4, 22, 22);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text("DKMO", 32, 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Dakshina Karnataka Muslim Ookota", 32, 20);
    doc.setFontSize(8);
    doc.text("Meeting Attendance Register", 32, 26);

    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(detail.title, 14, 42);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    let infoY = 49;
    doc.text(`Date: ${formatDate(detail.meetingDate)}`, 14, infoY);
    if (detail.location) {
      infoY += 5;
      doc.text(`Location: ${detail.location}`, 14, infoY);
    }
    infoY += 5;
    doc.text(
      `Present: ${liveTotals.present}   |   Absent: ${liveTotals.absent}   |   Attendance: ${liveTotals.percentage}%`,
      14,
      infoY,
    );

    autoTable(doc, {
      startY: infoY + 6,
      head: [["DKMO ID", "Full Name", "Location", "Mobile", "Status"]],
      body: detail.attendance.map((r) => [
        r.membershipId,
        r.fullName,
        r.location ?? "—",
        r.mobileNumber,
        (localStatus[r.memberId] ?? r.status) === "present" ? "Present" : "Absent",
      ]),
      theme: "grid",
      headStyles: { fillColor: green },
    });

    const safeTitle = detail.title.replace(/[^a-z0-9]+/gi, "_");
    const safeDate = (detail.meetingDate || "").split("T")[0] || new Date().toISOString().split("T")[0];
    doc.save(`DKMO_Attendance_${safeTitle}_${safeDate}.pdf`);
  };

  const exportExcel = async () => {
    if (!detail) return;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "DKMO Portal";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Attendance");
    sheet.columns = [
      { header: "DKMO ID", key: "membershipId", width: 16 },
      { header: "Full Name", key: "fullName", width: 26 },
      { header: "Location", key: "location", width: 18 },
      { header: "Mobile Number", key: "mobileNumber", width: 18 },
      { header: "Attendance Status", key: "status", width: 18 },
      { header: "Meeting Date", key: "meetingDate", width: 16 },
    ];
    sheet.getRow(1).font = { bold: true };
    detail.attendance.forEach((r) => {
      sheet.addRow({
        membershipId: r.membershipId,
        fullName: r.fullName,
        location: r.location ?? "",
        mobileNumber: r.mobileNumber,
        status: (localStatus[r.memberId] ?? r.status) === "present" ? "Present" : "Absent",
        meetingDate: formatDate(detail.meetingDate),
      });
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeDate = (detail.meetingDate || "").split("T")[0] || new Date().toISOString().split("T")[0];
    a.download = `DKMO_Attendance_${safeDate}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-green-950 dark:text-green-100">
            Meeting Attendance
          </h1>
          <p className="text-sm text-green-800/70 dark:text-slate-400 mt-1">
            Record and track committee meeting attendance across all sessions
          </p>
        </div>
        <Button
          onClick={openNewDialog}
          className="bg-green-700 hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700 text-white"
          data-testid="button-new-meeting"
        >
          <Plus className="mr-2 h-4 w-4" /> New Meeting
        </Button>
      </div>

      {/* Header summary cards — click to view that group's members */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <StatCard
          icon={Users}
          label="Total Members"
          value={memberStats.total}
          accent="text-green-700 dark:text-green-400"
          active={memberView === "total"}
          onClick={() => toggleMemberView("total")}
        />
        <StatCard
          icon={Crown}
          label="Executive Members"
          value={memberStats.executive}
          accent="text-amber-600 dark:text-amber-400"
          active={memberView === "executive"}
          onClick={() => toggleMemberView("executive")}
        />
        <StatCard
          icon={ShieldCheck}
          label="Core Committee Members"
          value={memberStats.core}
          accent="text-emerald-700 dark:text-emerald-400"
          active={memberView === "core"}
          onClick={() => toggleMemberView("core")}
        />
      </div>

      {/* Member list for the selected card */}
      {memberView ? (
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
                  {memberView === "total" ? (
                    <Users className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : memberView === "executive" ? (
                    <Crown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                  )}
                  {memberView === "total"
                    ? "All Members"
                    : memberView === "executive"
                      ? "Executive Members"
                      : "Core Committee Members"}
                  <span className="text-green-700/60 dark:text-slate-500 font-normal">
                    ({viewMembers.length})
                  </span>
                </CardTitle>
                <CardDescription className="dark:text-slate-400">
                  {memberView === "executive"
                    ? "Office bearers and key convenors of DKMO."
                    : memberView === "core"
                      ? "All committee members holding a designated role."
                      : "Every registered DKMO member."}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMemberView(null)}
                className="border-green-200 dark:border-slate-700 text-green-700 dark:text-slate-300 hover:bg-green-50 dark:hover:bg-slate-800"
                data-testid="button-close-member-list"
              >
                <XCircle className="mr-1.5 h-3.5 w-3.5" /> Close
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {viewMembers.length === 0 ? (
              <p className="py-8 text-center text-sm text-green-700/70 dark:text-slate-500">
                No members in this group.
              </p>
            ) : (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {viewMembers.map((m) => (
                  <div
                    key={m.id}
                    data-testid={`member-card-${m.id}`}
                    className="rounded-xl border border-green-100 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <MemberAvatar photoUrl={m.photoUrl} name={m.fullName} size="sm" />
                        <p className="font-semibold text-green-950 dark:text-slate-100 leading-snug">
                          {m.fullName}
                        </p>
                      </div>
                      {isExecutiveMember(m) ? (
                        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[10px] font-medium">
                          <Crown className="h-3 w-3" /> Exec
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-green-700/80 dark:text-slate-400 mt-0.5">
                      {m.designation?.trim() ? m.designation : "Member"}
                    </p>
                    <div className="mt-2 space-y-1 text-xs text-green-700/70 dark:text-slate-500">
                      <p className="font-medium text-green-800 dark:text-slate-400">{m.membershipId}</p>
                      <p className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3" />
                        {[m.city, m.country].filter(Boolean).join(", ") || "—"}
                      </p>
                      <p>{m.mobileNumber}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Attendance History */}
      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-green-600 dark:text-green-400" />
            Attendance History
          </CardTitle>
          <CardDescription className="dark:text-slate-400">
            Select a meeting to view and update its attendance register
          </CardDescription>
        </CardHeader>
        <CardContent>
          {meetingsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : sortedMeetings.length === 0 ? (
            <div className="py-12 text-center">
              <CalendarDays className="h-10 w-10 mx-auto text-green-300 dark:text-slate-600 mb-3" />
              <p className="text-sm text-green-700/70 dark:text-slate-500">
                No meetings recorded yet. Create your first meeting to start tracking attendance.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sortedMeetings.map((m) => {
                const isActive = m.id === selectedId;
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    data-testid={`card-meeting-${m.id}`}
                    className={cn(
                      "text-left rounded-xl border p-4 transition-all hover:shadow-md",
                      isActive
                        ? "border-green-500 dark:border-green-600 bg-green-50/70 dark:bg-green-900/20 ring-1 ring-green-400/40"
                        : "border-green-100 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-green-200",
                    )}
                  >
                    <p className="font-semibold text-green-950 dark:text-slate-100 leading-snug truncate">
                      {m.title}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-green-700/70 dark:text-slate-400">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDate(m.meetingDate)}
                    </div>
                    {m.location ? (
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-green-700/70 dark:text-slate-400">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="truncate">{m.location}</span>
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-medium">
                        <CheckCircle2 className="h-3 w-3" /> {m.presentCount}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-2 py-0.5 text-[11px] font-medium">
                        <XCircle className="h-3 w-3" /> {m.absentCount}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-slate-800 text-green-800 dark:text-slate-300 px-2 py-0.5 text-[11px] font-medium">
                        <Percent className="h-3 w-3" /> {m.attendancePercentage}%
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attendance Register */}
      {selectedId ? (
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          {detailLoading || !detail ? (
            <CardContent className="py-12">
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg text-green-950 dark:text-green-100 flex items-center gap-2">
                      <ClipboardCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
                      {detail.title}
                    </CardTitle>
                    <CardDescription className="dark:text-slate-400 mt-1 space-y-0.5">
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" /> {formatDate(detail.meetingDate)}
                      </span>
                      {detail.location ? (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" /> {detail.location}
                        </span>
                      ) : null}
                      {detail.notes ? (
                        <span className="block text-green-700/70 dark:text-slate-500">{detail.notes}</span>
                      ) : null}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2 h-fit">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={openEditDialog}
                      className="border-green-200 dark:border-slate-700 text-green-700 dark:text-slate-300 hover:bg-green-50 dark:hover:bg-slate-800"
                      data-testid="button-edit-meeting"
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDeleteOpen(true)}
                      className="border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      data-testid="button-delete-meeting"
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                </div>

                {/* Totals */}
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="rounded-xl border border-emerald-100 dark:border-slate-800 bg-emerald-50/60 dark:bg-slate-800/40 p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{liveTotals.present}</p>
                    <p className="text-[11px] uppercase tracking-wider text-emerald-700/70 dark:text-slate-400">Total Present</p>
                  </div>
                  <div className="rounded-xl border border-red-100 dark:border-slate-800 bg-red-50/60 dark:bg-slate-800/40 p-3 text-center">
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{liveTotals.absent}</p>
                    <p className="text-[11px] uppercase tracking-wider text-red-600/70 dark:text-slate-400">Total Absent</p>
                  </div>
                  <div className="rounded-xl border border-green-100 dark:border-slate-800 bg-green-50/60 dark:bg-slate-800/40 p-3 text-center">
                    <p className="text-2xl font-bold text-green-700 dark:text-green-400">{liveTotals.percentage}%</p>
                    <p className="text-[11px] uppercase tracking-wider text-green-700/70 dark:text-slate-400">Attendance</p>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-400 dark:text-slate-500" />
                    <Input
                      placeholder="Search name, DKMO ID, or mobile…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9 border-green-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500"
                      data-testid="input-attendance-search"
                    />
                  </div>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                    className="h-10 rounded-md border border-green-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-green-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-green-500/30"
                    data-testid="select-member-type"
                  >
                    <option value="all">All Member Types</option>
                    <option value="executive">Executive</option>
                    <option value="core">Core Committee</option>
                  </select>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={exportPDF}
                      className="border-green-200 dark:border-slate-700 text-green-700 dark:text-slate-300 hover:bg-green-50 dark:hover:bg-slate-800"
                      data-testid="button-export-pdf"
                    >
                      <FileText className="mr-2 h-4 w-4" /> PDF
                    </Button>
                    <Button
                      variant="outline"
                      onClick={exportExcel}
                      className="border-green-200 dark:border-slate-700 text-green-700 dark:text-slate-300 hover:bg-green-50 dark:hover:bg-slate-800"
                      data-testid="button-export-excel"
                    >
                      <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
                    </Button>
                  </div>
                </div>

                {/* Table */}
                {filteredRows.length === 0 ? (
                  <p className="py-10 text-center text-sm text-green-700/70 dark:text-slate-500">
                    {detail.attendance.length === 0
                      ? "No members available for this meeting."
                      : "No members match your search."}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wider text-green-700/70 dark:text-slate-500 border-b border-green-100 dark:border-slate-800">
                          <th className="py-2 pr-3 font-medium">DKMO ID</th>
                          <th className="py-2 px-2 font-medium">Full Name</th>
                          <th className="py-2 px-2 font-medium">Location</th>
                          <th className="py-2 px-2 font-medium">Mobile Number</th>
                          <th className="py-2 pl-2 font-medium text-right">Attendance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((r) => {
                          const status = localStatus[r.memberId] ?? r.status;
                          const present = status === "present";
                          return (
                            <tr
                              key={r.memberId}
                              data-testid={`row-attendance-${r.memberId}`}
                              className="border-b border-green-50 dark:border-slate-800/60 hover:bg-green-50/40 dark:hover:bg-slate-800/40 transition-colors"
                            >
                              <td className="py-3 pr-3 font-medium text-green-900 dark:text-slate-200 whitespace-nowrap">{r.membershipId}</td>
                              <td className="py-3 px-2 text-green-950 dark:text-slate-100">
                                <span className="flex items-center gap-2">
                                  <MemberAvatar photoUrl={photoByMemberId[r.memberId]} name={r.fullName} size="sm" />
                                  {r.fullName}
                                </span>
                              </td>
                              <td className="py-3 px-2 text-green-700/80 dark:text-slate-400 whitespace-nowrap">{r.location || "—"}</td>
                              <td className="py-3 px-2 text-green-700/80 dark:text-slate-400 whitespace-nowrap">{r.mobileNumber}</td>
                              <td className="py-3 pl-2 text-right">
                                <button
                                  onClick={() => toggleStatus(r.memberId)}
                                  data-testid={`toggle-attendance-${r.memberId}`}
                                  className={cn(
                                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                                    present
                                      ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-200"
                                      : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200",
                                  )}
                                >
                                  {present ? (
                                    <>
                                      <CheckCircle2 className="h-3.5 w-3.5" /> Present
                                    </>
                                  ) : (
                                    <>
                                      <XCircle className="h-3.5 w-3.5" /> Absent
                                    </>
                                  )}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <Button
                    onClick={handleSaveAttendance}
                    disabled={setAttendance.isPending || detail.attendance.length === 0}
                    className="bg-green-700 hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700 text-white"
                    data-testid="button-save-attendance"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {setAttendance.isPending ? "Saving…" : "Save Attendance"}
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      ) : (
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardContent className="py-12 text-center">
            <ClipboardCheck className="h-10 w-10 mx-auto text-green-300 dark:text-slate-600 mb-3" />
            <p className="text-sm text-green-700/70 dark:text-slate-500">
              Select a meeting above to view its attendance register.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent className="dark:bg-slate-900 dark:border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-slate-100">Delete this meeting?</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-slate-400">
              This will permanently delete "{detail?.title}" and its attendance records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="dark:bg-slate-900 dark:border-slate-800">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="text-green-950 dark:text-green-100">
                {editingId ? "Edit Meeting" : "New Meeting"}
              </DialogTitle>
              <DialogDescription className="dark:text-slate-400">
                {editingId ? "Update the meeting details." : "Create a new meeting session to track attendance."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="meeting-title">Title *</Label>
                <Input
                  id="meeting-title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Monthly Committee Meeting"
                  className="dark:bg-slate-800 dark:border-slate-700"
                  data-testid="input-meeting-title"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meeting-date">Date *</Label>
                <Input
                  id="meeting-date"
                  type="date"
                  value={form.meetingDate}
                  onChange={(e) => setForm((f) => ({ ...f, meetingDate: e.target.value }))}
                  className="dark:bg-slate-800 dark:border-slate-700"
                  data-testid="input-meeting-date"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meeting-location">Location</Label>
                <Input
                  id="meeting-location"
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. DKMO Hall, Riyadh"
                  className="dark:bg-slate-800 dark:border-slate-700"
                  data-testid="input-meeting-location"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meeting-notes">Notes</Label>
                <Textarea
                  id="meeting-notes"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes about this meeting"
                  className="dark:bg-slate-800 dark:border-slate-700"
                  data-testid="input-meeting-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="border-green-200 dark:border-slate-700"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMeeting.isPending || updateMeeting.isPending}
                className="bg-green-700 hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700 text-white"
                data-testid="button-submit-meeting"
              >
                {createMeeting.isPending || updateMeeting.isPending
                  ? "Saving…"
                  : editingId
                    ? "Save Changes"
                    : "Create Meeting"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
  active = false,
  onClick,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  accent: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const clickable = typeof onClick === "function";
  return (
    <Card
      role={clickable ? "button" : undefined}
      aria-pressed={clickable ? active : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      data-testid={`card-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className={cn(
        "rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm",
        clickable &&
          "cursor-pointer transition-all hover:shadow-md hover:border-green-300 dark:hover:border-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/40",
        active &&
          "border-green-400 dark:border-green-600 ring-2 ring-green-500/40 bg-green-50/60 dark:bg-green-900/20",
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-green-900 dark:text-slate-300">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${accent}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-green-950 dark:text-white">{value}</div>
        {clickable ? (
          <p className="mt-1 text-[11px] text-green-700/60 dark:text-slate-500">
            {active ? "Showing list below" : "Click to view list"}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
