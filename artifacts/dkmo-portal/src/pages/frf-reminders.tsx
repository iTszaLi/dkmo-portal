import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useListMembers } from "@workspace/api-client-react";
import type { Member } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn, formatSAR } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, HandCoins, MessageSquareWarning, Phone, Send, UserCircle } from "lucide-react";

type FrfMember = Member & {
  frfOutstanding?: number;
  frfOverdueCount?: number;
  frfPendingCount?: number;
};

function formatMobileForWa(mobileNumber: string): string {
  return mobileNumber.replace(/\D/g, "");
}

function buildFrfReminderMessage(member: FrfMember): string {
  const total = member.frfOutstanding ?? 0;
  return `Dear ${member.fullName},\n\nThis is a reminder that your Family Relief Fund (FRF) contribution is pending.\n\nOutstanding FRF Amount: SAR ${total.toFixed(2)}\n\nThis amount includes any previous unpaid FRF contributions.\n\nKindly make the payment at your earliest convenience.\n\nThank you.\nDKMO (Dakshina Karnataka Muslim Ookota)`;
}

function sendFrfReminders(
  members: FrfMember[],
  onDone: (opened: number) => void,
  setBulkSending: (v: boolean) => void,
) {
  const valid = members.filter((m) => formatMobileForWa(m.mobileNumber));
  if (valid.length === 0) {
    onDone(0);
    return;
  }
  setBulkSending(true);
  let opened = 0;
  valid.forEach((member, idx) => {
    setTimeout(() => {
      const message = encodeURIComponent(buildFrfReminderMessage(member));
      window.open(`https://wa.me/${formatMobileForWa(member.mobileNumber)}?text=${message}`, "_blank");
      opened += 1;
      if (idx === valid.length - 1) {
        setBulkSending(false);
        onDone(opened);
      }
    }, idx * 350);
  });
}

export default function FrfReminders() {
  const { toast } = useToast();
  const [bulkSending, setBulkSending] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: members, isLoading } = useListMembers({});

  const dueMembers = useMemo(() => {
    const list = ((members ?? []) as FrfMember[]).filter((m) => (m.frfOutstanding ?? 0) > 0);
    return list.sort((a, b) => (b.frfOutstanding ?? 0) - (a.frfOutstanding ?? 0));
  }, [members]);

  const totalOutstanding = dueMembers.reduce((sum, m) => sum + (m.frfOutstanding ?? 0), 0);
  const selectedMembers = dueMembers.filter((m) => selectedIds.has(m.id));

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = dueMembers.length > 0 && dueMembers.every((m) => selectedIds.has(m.id));

  const startBulkSend = (targets: FrfMember[], label: string) => {
    const sendable = targets.filter((m) => formatMobileForWa(m.mobileNumber));
    if (sendable.length === 0) {
      toast({ title: "No valid mobile numbers", description: "None of the selected members have a WhatsApp-capable number.", variant: "destructive" });
      return;
    }
    const ok = window.confirm(
      `This will open ${sendable.length} WhatsApp tab${sendable.length === 1 ? "" : "s"} (${label}). Your browser may ask to allow pop-ups. Continue?`,
    );
    if (!ok) return;
    sendFrfReminders(targets, (opened) => {
      toast({
        title: "FRF reminders prepared",
        description: `Opened WhatsApp for ${opened} member${opened === 1 ? "" : "s"}.`,
      });
    }, setBulkSending);
  };

  const sendSingle = (member: FrfMember) => {
    const wa = formatMobileForWa(member.mobileNumber);
    if (!wa) {
      toast({ title: "No mobile number", description: `${member.fullName} has no valid WhatsApp number.`, variant: "destructive" });
      return;
    }
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(buildFrfReminderMessage(member))}`, "_blank");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <Link href="/frf" className="inline-flex items-center gap-1 text-sm text-green-700 dark:text-green-400 hover:underline mb-1" data-testid="link-back-frf">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to FRF
          </Link>
          <h1 className="text-2xl font-bold text-green-950 dark:text-white flex items-center gap-2">
            <MessageSquareWarning className="h-6 w-6 text-orange-500" /> FRF Reminders
          </h1>
          <p className="text-green-800/70 dark:text-slate-400 mt-1">
            Members with unpaid FRF contributions (SAR 50 per case). Reminders always show the member's <strong>total</strong> outstanding across all cases.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedMembers.length > 0 && (
            <Button
              variant="outline"
              disabled={bulkSending}
              onClick={() => startBulkSend(selectedMembers, "selected members")}
              className="border-green-300 text-green-800 dark:border-slate-700 dark:text-green-300"
              data-testid="button-remind-selected"
            >
              <Send className="h-4 w-4 mr-1" /> Remind Selected ({selectedMembers.length})
            </Button>
          )}
          <Button
            disabled={bulkSending || dueMembers.length === 0}
            onClick={() => startBulkSend(dueMembers, "all members with FRF dues")}
            className="bg-green-700 hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700 text-white"
            data-testid="button-remind-all"
          >
            <Send className="h-4 w-4 mr-1" /> {bulkSending ? "Opening WhatsApp…" : `Send FRF Reminder — All (${dueMembers.length})`}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-green-700/70 dark:text-slate-500">Members with FRF Due</p>
            <p className="text-2xl font-bold text-green-950 dark:text-white">{dueMembers.length}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-green-700/70 dark:text-slate-500">Total Outstanding</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatSAR(totalOutstanding)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-green-700/70 dark:text-slate-500">Members Overdue (&gt;30 days)</p>
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{dueMembers.filter((m) => (m.frfOverdueCount ?? 0) > 0).length}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
            <HandCoins className="h-4 w-4 text-green-600" /> Members with Pending FRF Dues
          </CardTitle>
          <CardDescription className="dark:text-slate-400">
            Outstanding = sum of all unpaid / partially paid FRF cases. Updates automatically when payments are recorded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : dueMembers.length === 0 ? (
            <p className="py-10 text-center text-sm text-green-700/70 dark:text-slate-500">No members have outstanding FRF contributions. 🎉</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="dark:border-slate-800">
                  <TableHead className="w-8">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(v) => setSelectedIds(v ? new Set(dueMembers.map((m) => m.id)) : new Set())}
                      aria-label="Select all"
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Member</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 hidden sm:table-cell">Mobile</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-center">Unpaid Cases</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Outstanding</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {dueMembers.map((member) => {
                  const overdue = member.frfOverdueCount ?? 0;
                  const pending = member.frfPendingCount ?? 0;
                  return (
                    <TableRow key={member.id} className="dark:border-slate-800">
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(member.id)}
                          onCheckedChange={() => toggleSelected(member.id)}
                          aria-label={`Select ${member.fullName}`}
                          data-testid={`checkbox-member-${member.membershipId}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Link href={`/members/${member.id}`} className="group block">
                          <div className="flex items-center gap-2">
                            <UserCircle className="h-5 w-5 text-green-300 dark:text-slate-600 shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-emerald-900 dark:text-slate-200 group-hover:underline">{member.fullName}</p>
                              <p className="text-xs text-emerald-600 dark:text-slate-500">{member.membershipId}</p>
                            </div>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="inline-flex items-center gap-1 text-sm text-emerald-800 dark:text-slate-300">
                          <Phone className="h-3.5 w-3.5 text-green-400 dark:text-slate-500" /> {member.mobileNumber || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm font-semibold text-emerald-900 dark:text-slate-200">{overdue + pending}</span>
                        {overdue > 0 && (
                          <Badge className="ml-2 bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 text-[11px]">{overdue} overdue</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-semibold" data-testid={`badge-outstanding-${member.membershipId}`}>
                          Outstanding: {formatSAR(member.frfOutstanding ?? 0)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => sendSingle(member)}
                          className={cn("border-green-300 text-green-800 dark:border-slate-700 dark:text-green-300", !formatMobileForWa(member.mobileNumber) && "opacity-50")}
                          data-testid={`button-remind-${member.membershipId}`}
                        >
                          <Send className="h-3.5 w-3.5 mr-1" /> Remind
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
