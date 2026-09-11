import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSAR, formatDate } from "@/lib/utils";
import {
  UserPlus, CreditCard, HeartHandshake, Banknote, Award, HandHelping, History,
  Plus, Pencil, Trash2,
} from "lucide-react";

type Payment = {
  id: string;
  paymentType: string;
  amountPaid: number;
  paidAt?: string | null;
  createdAt?: string | null;
  receiptNumber?: string | null;
};

type AssistanceItem = {
  id: string;
  category: string;
  status: string;
  amountApproved: number;
  referenceNumber?: string | null;
  date?: string | null;
};

type TimelineEvent = {
  key: string;
  date: string | null;
  title: string;
  detail: string;
  icon: typeof UserPlus;
  colorClass: string;
  customId?: string;
};

const PAYMENT_LABEL: Record<string, string> = {
  membership_fee: "Membership fee paid",
  frf_contribution: "FRF contribution paid",
};

export function MemberTimeline({
  memberId,
  member,
  payments,
  assistance,
  isLoading,
}: {
  memberId: string;
  member: { createdAt?: string; designation?: string | null; fullName: string };
  payments: Payment[] | undefined;
  assistance: AssistanceItem[] | undefined;
  isLoading?: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<{ id?: string; title: string; detail: string; eventDate: string }>({
    title: "", detail: "", eventDate: "",
  });
  const [saving, setSaving] = useState(false);
  const timelineQuery = useQuery({
    queryKey: ["member-timeline", memberId],
    enabled: Boolean(memberId),
    queryFn: () => customFetch<Array<{ id: string; title: string; detail: string; eventDate: string | null }>>(`/api/members/${memberId}/timeline`),
  });

  const events: TimelineEvent[] = useMemo(() => {
    const out: TimelineEvent[] = [];
    if (member.createdAt) {
      out.push({
        key: "joined", date: member.createdAt, title: "Joined DKMO", detail: "Membership created",
        icon: UserPlus, colorClass: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
      });
    }
    for (const p of payments ?? []) {
      out.push({
        key: `pay-${p.id}`, date: p.paidAt || p.createdAt || null,
        title: PAYMENT_LABEL[p.paymentType] ?? "Payment recorded",
        detail: `${formatSAR(Number(p.amountPaid || 0))}${p.receiptNumber ? ` · Receipt ${p.receiptNumber}` : ""}`,
        icon: CreditCard, colorClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
      });
    }
    for (const a of assistance ?? []) {
      const cat = a.category.toLowerCase();
      const isLoan = cat.includes("loan");
      const isFrf = cat.includes("frf") || cat.includes("relief");
      out.push({
        key: `as-${a.category}-${a.id}`, date: a.date ?? null,
        title: `${a.category} — ${a.status.replace(/_/g, " ")}`,
        detail: `${formatSAR(a.amountApproved)}${a.referenceNumber ? ` · ${a.referenceNumber}` : ""}`,
        icon: isLoan ? Banknote : isFrf ? HeartHandshake : HandHelping,
        colorClass: isLoan
          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400"
          : isFrf
            ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400"
            : "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400",
      });
    }
    if (member.designation) {
      out.push({
        key: "committee", date: null, title: `Committee — ${member.designation}`,
        detail: "Currently serving on the committee", icon: Award,
        colorClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
      });
    }
    for (const item of timelineQuery.data ?? []) {
      out.push({
        key: `custom-${item.id}`, customId: item.id, date: item.eventDate,
        title: item.title, detail: item.detail || "Member activity", icon: History,
        colorClass: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400",
      });
    }
    return out.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [member, payments, assistance, timelineQuery.data]);

  const saveEntry = async () => {
    if (!editing.title.trim()) return;
    setSaving(true);
    try {
      await customFetch(`/api/members/${memberId}/timeline${editing.id ? `/${editing.id}` : ""}`, {
        method: editing.id ? "PUT" : "POST",
        body: JSON.stringify({
          title: editing.title.trim(),
          detail: editing.detail.trim(),
          eventDate: editing.eventDate ? new Date(`${editing.eventDate}T12:00:00`).toISOString() : null,
        }),
      });
      await timelineQuery.refetch();
      setDialogOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (entryId: string) => {
    if (!window.confirm("Delete this timeline entry? This action will be recorded in the audit log.")) return;
    await customFetch(`/api/members/${memberId}/timeline/${entryId}`, { method: "DELETE" });
    await timelineQuery.refetch();
  };

  return (
    <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg text-emerald-900 dark:text-slate-100 flex items-center gap-2">
              <History className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> Activity Timeline
            </CardTitle>
            <CardDescription className="dark:text-slate-400 mt-1">
              {member.fullName}'s journey with DKMO — membership, payments, assistance and roles.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => {
            setEditing({ title: "", detail: "", eventDate: new Date().toISOString().slice(0, 10) });
            setDialogOpen(true);
          }}>
            <Plus className="mr-1.5 h-4 w-4" /> Add event
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading || timelineQuery.isLoading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : events.length === 0 ? (
          <p className="text-sm text-emerald-700 dark:text-slate-400 py-6 text-center">No activity recorded yet.</p>
        ) : (
          <ol className="relative ml-4 border-l border-emerald-200 dark:border-slate-700 space-y-5">
            {events.map((e) => {
              const Icon = e.icon;
              return (
                <li key={e.key} className="relative pl-8" data-testid={`timeline-${e.key}`}>
                  <span className={`absolute -left-[15px] top-0 flex h-[30px] w-[30px] items-center justify-center rounded-full ring-4 ring-white dark:ring-slate-900 ${e.colorClass}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <p className="text-sm font-semibold text-emerald-950 dark:text-slate-100">{e.title}</p>
                  <p className="text-xs text-emerald-700/80 dark:text-slate-400">{e.detail}</p>
                  <p className="text-[11px] text-emerald-600/70 dark:text-slate-500 mt-0.5">{e.date ? formatDate(e.date) : "Ongoing"}</p>
                  {e.customId ? (
                    <div className="mt-1 flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                        const item = timelineQuery.data?.find((x) => x.id === e.customId);
                        if (item) {
                          setEditing({ id: item.id, title: item.title, detail: item.detail, eventDate: item.eventDate ? item.eventDate.slice(0, 10) : "" });
                          setDialogOpen(true);
                        }
                      }} title="Edit event"><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => void deleteEntry(e.customId!)} title="Delete event"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[440px] dark:bg-slate-900 dark:border-slate-800">
          <DialogHeader><DialogTitle>{editing.id ? "Edit timeline event" : "Add timeline event"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input value={editing.title} onChange={(e) => setEditing((v) => ({ ...v, title: e.target.value }))} placeholder="Event title" />
            <Input value={editing.detail} onChange={(e) => setEditing((v) => ({ ...v, detail: e.target.value }))} placeholder="Details (optional)" />
            <Input type="date" value={editing.eventDate} onChange={(e) => setEditing((v) => ({ ...v, eventDate: e.target.value }))} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => void saveEntry()} disabled={saving || !editing.title.trim()}>{saving ? "Saving…" : "Save event"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}