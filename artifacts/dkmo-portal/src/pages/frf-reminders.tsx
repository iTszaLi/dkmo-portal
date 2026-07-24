import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useListPendingFrfFees } from "@workspace/api-client-react";
import type { PendingFrfFee } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn, formatSAR } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, HandCoins, MessageSquareWarning, Phone, Send, UserCircle } from "lucide-react";
import { normalizeWhatsAppNumber, buildWhatsAppLink, type WhatsAppTarget } from "@/lib/whatsapp";
import { WhatsAppBulkDialog } from "@/components/WhatsAppBulkDialog";

/** One row per member, aggregated from the same pending-FRF-fees list the Payments → FRF tab uses. */
type FrfMember = {
  id: string;
  fullName: string;
  membershipId: string;
  mobileNumber: string;
  frfOutstanding: number;
  frfOverdueCount: number;
  frfPendingCount: number;
};

function buildFrfReminderMessage(member: FrfMember): string {
  const total = member.frfOutstanding ?? 0;
  return `Dear ${member.fullName},\n\nThis is a reminder that your Family Relief Fund (FRF) contribution is pending.\n\nOutstanding FRF Amount: SAR ${total.toFixed(2)}\n\nThis amount includes any previous unpaid FRF contributions.\n\nKindly make the payment at your earliest convenience.\n\nThank you.\nDKMO (Dakshina Karnataka Muslim Ookota)`;
}

function toWhatsAppTargets(members: FrfMember[]): WhatsAppTarget[] {
  return members.flatMap((m) => {
    const number = normalizeWhatsAppNumber(m.mobileNumber);
    return number ? [{ id: m.id, name: m.fullName, number, message: buildFrfReminderMessage(m) }] : [];
  });
}

export default function FrfReminders() {
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTargets, setBulkTargets] = useState<WhatsAppTarget[]>([]);

  const { data: pendingFees, isLoading } = useListPendingFrfFees();

  // Aggregate the same per-case pending list shown on Payments → FRF Fees,
  // so both screens always show the same members with the same totals.
  const dueMembers = useMemo(() => {
    const byMember = new Map<string, FrfMember>();
    for (const fee of (pendingFees ?? []) as PendingFrfFee[]) {
      const existing = byMember.get(fee.memberId);
      const entry: FrfMember = existing ?? {
        id: fee.memberId,
        fullName: fee.fullName,
        membershipId: fee.membershipId,
        mobileNumber: fee.mobileNumber,
        frfOutstanding: 0,
        frfOverdueCount: 0,
        frfPendingCount: 0,
      };
      entry.frfOutstanding += fee.balance;
      if (fee.status === "overdue") entry.frfOverdueCount += 1;
      else entry.frfPendingCount += 1;
      byMember.set(fee.memberId, entry);
    }
    return [...byMember.values()].sort((a, b) => b.frfOutstanding - a.frfOutstanding);
  }, [pendingFees]);

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

  const startBulkSend = (members: FrfMember[]) => {
    const targets = toWhatsAppTargets(members);
    if (targets.length === 0) {
      toast({ title: "No valid mobile numbers", description: "None of the selected members have a WhatsApp-capable number.", variant: "destructive" });
      return;
    }
    setBulkTargets(targets);
    setBulkOpen(true);
  };

  const sendSingle = (member: FrfMember) => {
    const number = normalizeWhatsAppNumber(member.mobileNumber);
    if (!number) {
      toast({ title: "No mobile number", description: `${member.fullName} has no valid WhatsApp number.`, variant: "destructive" });
      return;
    }
    window.open(buildWhatsAppLink(number, buildFrfReminderMessage(member)), "_blank", "noopener");
  };

  return (
    <div className="space-y-6">
      <WhatsAppBulkDialog
        open={bulkOpen}
        onOpenChange={(o) => { setBulkOpen(o); if (!o) setSelectedIds(new Set()); }}
        targets={bulkTargets}
        title="FRF Reminders"
      />
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
              disabled={bulkOpen}
              onClick={() => startBulkSend(selectedMembers)}
              className="border-green-300 text-green-800 dark:border-slate-700 dark:text-green-300"
              data-testid="button-remind-selected"
            >
              <Send className="h-4 w-4 mr-1" /> Remind Selected ({selectedMembers.length})
            </Button>
          )}
          <Button
            disabled={bulkOpen || dueMembers.length === 0}
            onClick={() => startBulkSend(dueMembers)}
            className="bg-green-700 hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700 text-white"
            data-testid="button-remind-all"
          >
            <Send className="h-4 w-4 mr-1" /> Send FRF Reminder — All ({dueMembers.length})
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
                          className={cn("border-green-300 text-green-800 dark:border-slate-700 dark:text-green-300", !normalizeWhatsAppNumber(member.mobileNumber) && "opacity-50")}
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
