import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useListPayments, useListMembers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Search, Users, ArrowLeft, Award, Medal } from "lucide-react";
import { formatSAR, formatDate } from "@/lib/utils";

function getMonthOptions(monthsBack = 24): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    options.push({ value, label });
  }
  return options;
}

function rankBadgeClass(rank: number): string {
  if (rank === 1) return "bg-yellow-100 text-yellow-800 ring-2 ring-yellow-300";
  if (rank === 2) return "bg-slate-100 text-slate-700 ring-2 ring-slate-300";
  if (rank === 3) return "bg-amber-100 text-amber-800 ring-2 ring-amber-400";
  return "bg-stone-100 text-stone-700";
}

function rankRowClass(rank: number): string {
  if (rank === 1)
    return "bg-gradient-to-r from-yellow-50 via-amber-50/60 to-transparent hover:from-yellow-100/80";
  if (rank === 2)
    return "bg-gradient-to-r from-slate-50 via-slate-50/60 to-transparent hover:from-slate-100/80";
  if (rank === 3)
    return "bg-gradient-to-r from-amber-50 via-orange-50/40 to-transparent hover:from-amber-100/80";
  return "hover:bg-green-50/40";
}

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy className="h-4 w-4 text-yellow-500" />;
  if (rank === 2) return <Medal className="h-4 w-4 text-slate-400" />;
  if (rank === 3) return <Award className="h-4 w-4 text-amber-700" />;
  return null;
}

export default function TopContributors() {
  const [search, setSearch] = useState("");
  const monthOptions = useMemo(() => getMonthOptions(24), []);

  const earliest = monthOptions[monthOptions.length - 1]?.value ?? "";
  const latest = monthOptions[0]?.value ?? "";

  const [fromMonth, setFromMonth] = useState<string>(earliest);
  const [toMonth, setToMonth] = useState<string>(latest);

  const { data: allPayments, isLoading: paymentsLoading } = useListPayments();
  const { data: members, isLoading: membersLoading } = useListMembers();

  const isLoading = paymentsLoading || membersLoading;

  const inRange = (m: string) => {
    if (fromMonth && m < fromMonth) return false;
    if (toMonth && m > toMonth) return false;
    return true;
  };

  const filteredPayments = useMemo(() => {
    if (!allPayments) return [];
    return allPayments.filter((p) => inRange(p.month));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPayments, fromMonth, toMonth]);

  const memberMap = useMemo(() => {
    const m = new Map<string, { city?: string; country?: string }>();
    (members || []).forEach((mem) =>
      m.set(mem.id, { city: mem.city, country: mem.country }),
    );
    return m;
  }, [members]);

  const leaderboard = useMemo(() => {
    const totals = new Map<
      string,
      {
        memberId: string;
        name: string;
        membershipId: string;
        total: number;
        count: number;
        lastPaid: string;
      }
    >();
    for (const p of filteredPayments) {
      const prev = totals.get(p.memberId) ?? {
        memberId: p.memberId,
        name: p.memberName,
        membershipId: p.membershipId,
        total: 0,
        count: 0,
        lastPaid: p.paidAt,
      };
      prev.total += Number(p.amountPaid);
      prev.count += 1;
      if (new Date(p.paidAt) > new Date(prev.lastPaid)) prev.lastPaid = p.paidAt;
      totals.set(p.memberId, prev);
    }
    return Array.from(totals.values()).sort((a, b) => b.total - a.total);
  }, [filteredPayments]);

  const grandTotal = useMemo(
    () => leaderboard.reduce((acc, l) => acc + l.total, 0),
    [leaderboard],
  );

  const topOne = leaderboard[0];

  const visible = leaderboard.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const loc = memberMap.get(l.memberId);
    return (
      l.name.toLowerCase().includes(q) ||
      l.membershipId.toLowerCase().includes(q) ||
      (loc?.city ?? "").toLowerCase().includes(q) ||
      (loc?.country ?? "").toLowerCase().includes(q)
    );
  });

  const maxTotal = leaderboard[0]?.total || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-green-700 hover:text-green-900 font-medium"
          data-testid="link-back-dashboard"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mt-3">
          <div>
            <div className="flex items-center gap-3">
              <Trophy className="h-8 w-8 text-orange-500" />
              <h1 className="text-3xl font-bold tracking-tight text-green-950">
                Top Contributors
              </h1>
            </div>
            <p className="text-sm text-green-800/70 mt-1">
              Members ranked by total amount contributed across selected months.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-green-200 rounded-lg px-3 py-1.5 shadow-sm w-full sm:w-72">
            <Search className="h-4 w-4 text-green-500" />
            <Input
              placeholder="Search name, ID, city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-0 focus-visible:ring-0 shadow-none px-1 h-8 text-sm"
              data-testid="input-search"
            />
          </div>
        </div>
      </div>

      {/* Month Range Filter */}
      <Card className="rounded-2xl border-green-100 shadow-sm">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs font-medium text-green-900 mb-1 block">
                From month
              </label>
              <select
                value={fromMonth}
                onChange={(e) => setFromMonth(e.target.value)}
                className="w-full border border-green-200 rounded-md px-3 py-2 text-sm bg-white text-green-950 focus:outline-none focus:ring-2 focus:ring-green-300"
                data-testid="select-from-month"
              >
                {monthOptions
                  .slice()
                  .reverse()
                  .map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs font-medium text-green-900 mb-1 block">
                To month
              </label>
              <select
                value={toMonth}
                onChange={(e) => setToMonth(e.target.value)}
                className="w-full border border-green-200 rounded-md px-3 py-2 text-sm bg-white text-green-950 focus:outline-none focus:ring-2 focus:ring-green-300"
                data-testid="select-to-month"
              >
                {monthOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              className="border-green-200 text-green-800 hover:bg-green-50"
              onClick={() => {
                setFromMonth(earliest);
                setToMonth(latest);
              }}
              data-testid="button-reset-range"
            >
              Reset range
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl border-green-100 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-900">
              Total Contributors
            </CardTitle>
            <Users className="h-4 w-4 text-green-700" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold text-green-950">
                {leaderboard.length}
              </div>
            )}
            <p className="text-xs text-green-700/80 mt-1">
              Members with at least one payment
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-green-100 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-900">
              Grand Total
            </CardTitle>
            <Trophy className="h-4 w-4 text-green-700" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-3xl font-bold text-green-950">
                {formatSAR(grandTotal)}
              </div>
            )}
            <p className="text-xs text-green-700/80 mt-1">
              Across all members in range
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-yellow-300 shadow-sm bg-gradient-to-br from-yellow-100 via-amber-50 to-yellow-50 ring-1 ring-yellow-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-yellow-900">
              #1 Contributor
            </CardTitle>
            <Trophy className="h-5 w-5 text-yellow-500 drop-shadow" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-40" />
            ) : topOne ? (
              <>
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  <Link
                    href={`/members/${topOne.memberId}`}
                    className="text-xl font-bold text-yellow-900 hover:underline"
                  >
                    {topOne.name}
                  </Link>
                </div>
                <p className="text-xs text-yellow-800/80 mt-1">
                  {formatSAR(topOne.total)} · {topOne.count} payments
                </p>
              </>
            ) : (
              <div className="text-sm text-yellow-800/70">No contributions yet.</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard */}
      <Card className="rounded-2xl border-green-100 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-green-950">Leaderboard</CardTitle>
          <CardDescription>
            {visible.length} of {leaderboard.length} contributors shown
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-green-100 overflow-hidden">
            <Table>
              <TableHeader className="bg-green-50/60">
                <TableRow>
                  <TableHead className="font-medium text-green-900 w-16">
                    Rank
                  </TableHead>
                  <TableHead className="font-medium text-green-900">
                    Member
                  </TableHead>
                  <TableHead className="font-medium text-green-900">
                    Location
                  </TableHead>
                  <TableHead className="font-medium text-green-900 text-center">
                    Payments
                  </TableHead>
                  <TableHead className="font-medium text-green-900">
                    Last Paid
                  </TableHead>
                  <TableHead className="font-medium text-green-900 text-right">
                    Total
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-7 w-7 rounded-full" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-8 mx-auto" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-24" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="h-5 w-20 ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : visible.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-green-700/70 py-8"
                    >
                      No contributors found for this range.
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((row) => {
                    const rank = leaderboard.findIndex((l) => l.memberId === row.memberId) + 1;
                    const loc = memberMap.get(row.memberId);
                    const pct = Math.round((row.total / maxTotal) * 100);
                    return (
                      <TableRow
                        key={row.memberId}
                        className={rankRowClass(rank)}
                        data-testid={`row-contributor-${row.memberId}`}
                      >
                        <TableCell>
                          <div
                            className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${rankBadgeClass(rank)}`}
                          >
                            {rank}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/members/${row.memberId}`}
                            className="block group"
                          >
                            <div className="flex items-center gap-2">
                              <RankIcon rank={rank} />
                              <span className="font-semibold text-green-950 group-hover:underline">
                                {row.name}
                              </span>
                            </div>
                            <div className="text-xs text-orange-600 font-medium mt-0.5">
                              {row.membershipId}
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell className="text-green-800 text-sm">
                          {[loc?.city, loc?.country].filter(Boolean).join(", ") || "—"}
                        </TableCell>
                        <TableCell className="text-center text-green-900 font-medium">
                          {row.count}
                        </TableCell>
                        <TableCell className="text-green-800 text-sm">
                          {formatDate(row.lastPaid)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="font-bold text-green-900">
                            {formatSAR(row.total)}
                          </div>
                          <div className="h-1.5 mt-1 bg-green-50 rounded-full overflow-hidden ml-auto w-32">
                            <div
                              className="h-full bg-gradient-to-r from-green-700 to-orange-400"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
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
