import { Link } from "wouter";
import { useGetMemberFrfSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HeartHandshake, Users, ShieldCheck, ShieldAlert, ShieldX, Clock } from "lucide-react";
import { cn, formatSAR, formatDate } from "@/lib/utils";

const CLAIM_TYPE_LABEL: Record<string, string> = {
  death_benefit: "Death Benefit",
  emergency: "Emergency Assistance",
  air_ticket: "Air Ticket Support",
  other: "Other",
};

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-300",
  pending: "bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300",
  overdue: "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300",
  cancelled: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
  none: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-500",
};

const ELIGIBILITY_META: Record<string, { label: string; cls: string; icon: typeof ShieldCheck }> = {
  eligible: { label: "Eligible", cls: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300", icon: ShieldCheck },
  pending_activation: { label: "Pending Activation", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300", icon: Clock },
  suspended: { label: "Suspended", cls: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300", icon: ShieldAlert },
  not_eligible: { label: "Not Eligible", cls: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300", icon: ShieldX },
};

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export function MemberFrfSection({ memberId }: { memberId: string }) {
  const { data, isLoading } = useGetMemberFrfSummary(memberId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }
  if (!data) {
    return (
      <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardContent className="py-10 text-center text-slate-500">Failed to load FRF summary.</CardContent>
      </Card>
    );
  }

  const elig = ELIGIBILITY_META[data.eligibility.status] ?? ELIGIBILITY_META.not_eligible;
  const EligIcon = elig.icon;
  const rate = data.totalDue > 0 ? Math.round((data.totalPaid / data.totalDue) * 100) : 100;
  const ref = data.referenceCollection;

  return (
    <div className="space-y-4">
      {/* Eligibility + totals */}
      <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
              <HeartHandshake className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> FRF Contribution Summary
            </CardTitle>
            <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold", elig.cls)}>
              <EligIcon className="h-3.5 w-3.5" /> {elig.label}
            </span>
          </div>
          <CardDescription className="dark:text-slate-400">{data.eligibility.reason}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Claims Owed", value: String(data.totalClaims) },
              { label: "Total Due", value: formatSAR(data.totalDue) },
              { label: "Paid", value: formatSAR(data.totalPaid), cls: "text-green-700 dark:text-green-300" },
              { label: "Outstanding", value: formatSAR(data.totalOutstanding), cls: data.totalOutstanding > 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-300" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-emerald-100 dark:border-slate-800 p-3 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
                <p className={cn("text-lg font-bold text-emerald-950 dark:text-white", s.cls)}>{s.value}</p>
              </div>
            ))}
          </div>
          {data.totalDue > 0 && (
            <div>
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                <span>Contribution progress</span>
                <span>{rate}%{data.lastContributionAt ? ` · last paid ${formatDate(data.lastContributionAt)}` : ""}</span>
              </div>
              <Progress value={rate} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-emerald-900 dark:text-emerald-200">Contribution History</CardTitle>
          <CardDescription className="dark:text-slate-400">Per-claim FRF contributions for this member</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="dark:border-slate-800">
                <TableHead>Claim</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Approved</TableHead>
                <TableHead>Paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-20 text-center text-slate-500">No FRF contributions recorded yet.</TableCell>
                </TableRow>
              ) : (
                data.history.map((h) => (
                  <TableRow key={h.contributionId} className="dark:border-slate-800">
                    <TableCell>
                      <Link href={`/frf/${h.claimId}`} className="font-medium text-emerald-800 dark:text-emerald-300 hover:underline">
                        {h.claimantName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{CLAIM_TYPE_LABEL[h.claimType] ?? h.claimType}</TableCell>
                    <TableCell className="text-right font-medium">{formatSAR(h.amount)}</TableCell>
                    <TableCell><Badge className={cn("text-[11px] capitalize", STATUS_STYLE[h.status] ?? "")}>{h.status}</Badge></TableCell>
                    <TableCell className="text-sm text-slate-500">{h.approvedDate ? formatDate(h.approvedDate) : "—"}</TableCell>
                    <TableCell className="text-sm text-slate-500">{h.paidAt ? formatDate(h.paidAt) : "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Reference collection performance */}
      <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
            <Users className="h-4 w-4 text-emerald-600" /> Reference Collection Performance
          </CardTitle>
          <CardDescription className="dark:text-slate-400">
            FRF collection status of the {ref.totalReferences} member{ref.totalReferences === 1 ? "" : "s"} this member referenced
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ref.totalReferences === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">No referenced members.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: "References", value: String(ref.totalReferences) },
                  { label: "Fully Paid", value: String(ref.fullyPaidCount), cls: "text-green-700 dark:text-green-300" },
                  { label: "Pending", value: String(ref.pendingCount), cls: "text-orange-600 dark:text-orange-400" },
                  { label: "Overdue", value: String(ref.overdueCount), cls: ref.overdueCount > 0 ? "text-red-600 dark:text-red-400" : undefined },
                  { label: "Collection Rate", value: `${ref.collectionRate}%` },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-emerald-100 dark:border-slate-800 p-3 text-center">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
                    <p className={cn("text-lg font-bold text-emerald-950 dark:text-white", s.cls)}>{s.value}</p>
                  </div>
                ))}
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="dark:border-slate-800">
                    <TableHead>Member</TableHead>
                    <TableHead>Eligibility</TableHead>
                    <TableHead className="text-right">Paid / Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ref.members.map((m) => (
                    <TableRow key={m.id} className="dark:border-slate-800">
                      <TableCell>
                        <Link href={`/members/${m.id}`} className="flex items-center gap-2 hover:underline">
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={m.photoUrl ?? undefined} />
                            <AvatarFallback className="text-[10px] bg-emerald-100 text-emerald-800">{initials(m.fullName)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium text-emerald-950 dark:text-slate-200">{m.fullName}</div>
                            <div className="text-xs text-slate-500">{m.membershipId}</div>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold", (ELIGIBILITY_META[m.frfEligibility] ?? ELIGIBILITY_META.not_eligible).cls)}>
                          {(ELIGIBILITY_META[m.frfEligibility] ?? ELIGIBILITY_META.not_eligible).label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {formatSAR(m.frfPaid)} / {formatSAR(m.frfDue)}
                        {m.frfOutstanding > 0 && <div className="text-xs text-red-600 dark:text-red-400">{formatSAR(m.frfOutstanding)} due</div>}
                      </TableCell>
                      <TableCell><Badge className={cn("text-[11px] capitalize", STATUS_STYLE[m.collectionStatus] ?? "")}>{m.collectionStatus === "none" ? "no claims" : m.collectionStatus}</Badge></TableCell>
                      <TableCell className="text-sm text-slate-500">{m.lastFrfPaymentAt ? formatDate(m.lastFrfPaymentAt) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
