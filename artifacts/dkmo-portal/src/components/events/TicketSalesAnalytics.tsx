import { useMemo, useState } from "react";
import { useGetTicketSalesAnalytics } from "@workspace/api-client-react";
import type { TicketSalesRecord } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatSAR, cn } from "@/lib/utils";
import { Ticket, Trophy, CalendarRange, Crown, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type SortKey = "tickets" | "revenue" | "events";

interface SellerAgg {
  sellerName: string;
  membershipId: string | null;
  totalTickets: number;
  totalRevenue: number;
  eventCount: number;
  topEventName: string;
  topEventTickets: number;
  topEventDate: string | null;
  perEvent: { eventName: string; eventDate: string | null; tickets: number; revenue: number }[];
}

const MEDALS = ["🥇", "🥈", "🥉"];
const RANK_ROW = [
  "bg-yellow-50/70 dark:bg-yellow-900/15",
  "bg-slate-50 dark:bg-slate-800/40",
  "bg-orange-50/70 dark:bg-orange-900/15",
];

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function TicketSalesAnalytics() {
  const { data: records, isLoading } = useGetTicketSalesAnalytics();

  const [eventFilter, setEventFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("tickets");
  const [detailSeller, setDetailSeller] = useState<SellerAgg | null>(null);

  const events = useMemo(() => {
    const map = new Map<string, { id: string; name: string; date: string | null }>();
    (records ?? []).forEach((r) => { if (!map.has(r.eventId)) map.set(r.eventId, { id: r.eventId, name: r.eventName, date: r.eventDate ?? null }); });
    return Array.from(map.values()).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  }, [records]);

  // Filtered records (event + event date range)
  const filtered = useMemo(() => {
    return (records ?? []).filter((r) => {
      if (eventFilter !== "all" && r.eventId !== eventFilter) return false;
      if (fromDate && (!r.eventDate || r.eventDate.slice(0, 10) < fromDate)) return false;
      if (toDate && (!r.eventDate || r.eventDate.slice(0, 10) > toDate)) return false;
      return true;
    });
  }, [records, eventFilter, fromDate, toDate]);

  // Aggregate per seller within the filtered scope
  const sellers = useMemo<SellerAgg[]>(() => {
    const map = new Map<string, SellerAgg>();
    filtered.forEach((r: TicketSalesRecord) => {
      const key = r.sellerName;
      let agg = map.get(key);
      if (!agg) {
        agg = { sellerName: r.sellerName, membershipId: r.sellerMembershipId ?? null, totalTickets: 0, totalRevenue: 0, eventCount: 0, topEventName: "", topEventTickets: -1, topEventDate: null, perEvent: [] };
        map.set(key, agg);
      }
      agg.totalTickets += r.ticketsSold;
      agg.totalRevenue += r.revenue;
      agg.eventCount += 1;
      agg.perEvent.push({ eventName: r.eventName, eventDate: r.eventDate ?? null, tickets: r.ticketsSold, revenue: r.revenue });
      if (r.ticketsSold > agg.topEventTickets) {
        agg.topEventTickets = r.ticketsSold;
        agg.topEventName = r.eventName;
        agg.topEventDate = r.eventDate ?? null;
      }
    });
    const list = Array.from(map.values());
    list.forEach((s) => s.perEvent.sort((a, b) => b.tickets - a.tickets));
    list.sort((a, b) =>
      sortKey === "revenue" ? b.totalRevenue - a.totalRevenue
      : sortKey === "events" ? b.eventCount - a.eventCount || b.totalTickets - a.totalTickets
      : b.totalTickets - a.totalTickets,
    );
    return list;
  }, [filtered, sortKey]);

  // Ranking always by tickets sold (medals follow the data, not the sort)
  const rankByTickets = useMemo(() => {
    const order = [...sellers].sort((a, b) => b.totalTickets - a.totalTickets);
    const map = new Map<string, number>();
    order.forEach((s, i) => map.set(s.sellerName, i));
    return map;
  }, [sellers]);

  const totalTickets = sellers.reduce((a, s) => a + s.totalTickets, 0);
  const totalRevenue = sellers.reduce((a, s) => a + s.totalRevenue, 0);
  const maxTickets = sellers.reduce((a, s) => Math.max(a, s.totalTickets), 0);

  // Per-event totals + best event — honors ALL active filters (event dropdown + date range)
  const perEventTotals = useMemo(() => {
    const map = new Map<string, { name: string; tickets: number; revenue: number }>();
    filtered.forEach((r) => {
      const cur = map.get(r.eventId) ?? { name: r.eventName, tickets: 0, revenue: 0 };
      cur.tickets += r.ticketsSold;
      cur.revenue += r.revenue;
      map.set(r.eventId, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.tickets - a.tickets);
  }, [filtered]);

  const bestEvent = perEventTotals[0];
  const chartData = sellers.slice(0, 10).map((s) => ({ name: s.sellerName.split(" ").slice(0, 2).join(" "), Tickets: s.totalTickets }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-green-950 dark:text-green-100 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" /> Top Ticket Sales Performance
        </h2>
        <p className="text-sm text-green-800/70 dark:text-slate-400">
          Leaderboard of members by event tickets sold — rankings update automatically with sales data.
        </p>
      </div>

      {/* Filters */}
      <Card className="rounded-2xl border-green-100 dark:border-slate-700 shadow-sm dark:bg-slate-900">
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-green-800/80 dark:text-slate-400">Select Event</label>
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="w-[260px] border-green-200 dark:border-slate-600" data-testid="select-ticket-event">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events (Overall Top Performers)</SelectItem>
                {events.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-green-800/80 dark:text-slate-400">Event date from</label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-[160px] border-green-200 dark:border-slate-600" data-testid="input-ticket-from" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-green-800/80 dark:text-slate-400">Event date to</label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-[160px] border-green-200 dark:border-slate-600" data-testid="input-ticket-to" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-green-800/80 dark:text-slate-400">Sort by</label>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="w-[220px] border-green-200 dark:border-slate-600" data-testid="select-ticket-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tickets">Highest tickets sold</SelectItem>
                <SelectItem value="revenue">Highest revenue</SelectItem>
                <SelectItem value="events">Most events participated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-emerald-800 dark:text-slate-300">Tickets Sold</CardTitle>
            <Ticket className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold text-emerald-950 dark:text-white">{totalTickets}</div>}
            <p className="text-xs text-emerald-600 dark:text-slate-500 mt-1">in current view</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-emerald-800 dark:text-slate-300">Ticket Revenue</CardTitle>
            <BarChart3 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold text-emerald-950 dark:text-white">{formatSAR(totalRevenue)}</div>}
            <p className="text-xs text-emerald-600 dark:text-slate-500 mt-1">in current view</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-amber-100 dark:border-amber-900/30 dark:bg-slate-900 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-emerald-800 dark:text-slate-300">Top Seller</CardTitle>
            <Crown className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-32" /> : (
              <>
                <div className="text-lg font-bold text-emerald-950 dark:text-white truncate">{sellers[0] ? `🥇 ${sellers[0].sellerName}` : "—"}</div>
                <p className="text-xs text-emerald-600 dark:text-slate-500 mt-1">{sellers[0] ? `${sellers[0].totalTickets} tickets · ${formatSAR(sellers[0].totalRevenue)}` : "no sales yet"}</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-emerald-800 dark:text-slate-300">Best Event</CardTitle>
            <CalendarRange className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-32" /> : (
              <>
                <div className="text-lg font-bold text-emerald-950 dark:text-white truncate">{bestEvent?.name ?? "—"}</div>
                <p className="text-xs text-emerald-600 dark:text-slate-500 mt-1">{bestEvent ? `${bestEvent.tickets} tickets · ${formatSAR(bestEvent.revenue)}` : "no sales yet"}</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Bar chart */}
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-emerald-900 dark:text-slate-200">Ticket Sales by Member{eventFilter !== "all" ? " (selected event)" : ""}</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {isLoading ? <Skeleton className="h-full w-full" /> : chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-emerald-600 dark:text-slate-500">No ticket sales in this view</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 40, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d1fae5" />
                  <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="Tickets" fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Tickets per event */}
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-emerald-900 dark:text-slate-200">Total Tickets Sold per Event</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? <Skeleton className="h-40 w-full" /> : perEventTotals.map((e, i) => {
              const max = perEventTotals[0]?.tickets || 1;
              return (
                <div key={e.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className={cn("truncate pr-2 font-medium", i === 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-900 dark:text-slate-300")}>
                      {i === 0 && "🏆 "}{e.name}
                    </span>
                    <span className="text-emerald-700 dark:text-slate-400 shrink-0">{e.tickets} · {formatSAR(e.revenue)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-emerald-50 dark:bg-slate-800 overflow-hidden">
                    <div className={cn("h-full rounded-full", i === 0 ? "bg-amber-400" : "bg-emerald-500")} style={{ width: `${(e.tickets / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-emerald-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-emerald-50/50 dark:bg-slate-800/60">
            <TableRow className="dark:border-slate-700">
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 w-20">Rank</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Member</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Top Event</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Event Date</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Tickets Sold</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Revenue</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Performance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="dark:border-slate-800">
                  {Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
                </TableRow>
              ))
            ) : sellers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-28 text-center text-emerald-600 dark:text-slate-500">No ticket sales match the current filters.</TableCell>
              </TableRow>
            ) : (
              sellers.map((s) => {
                const rank = rankByTickets.get(s.sellerName) ?? 0;
                const pct = maxTickets > 0 ? Math.round((s.totalTickets / maxTickets) * 100) : 0;
                return (
                  <TableRow
                    key={s.sellerName}
                    className={cn("cursor-pointer hover:bg-emerald-50/40 dark:hover:bg-slate-800/50 dark:border-slate-800 transition-colors", rank < 3 && RANK_ROW[rank])}
                    onClick={() => setDetailSeller(s)}
                    data-testid={`row-ticket-seller-${rank + 1}`}
                  >
                    <TableCell>
                      {rank < 3 ? (
                        <span className="text-xl" title={`Rank ${rank + 1}`}>{MEDALS[rank]}</span>
                      ) : (
                        <span className="text-sm font-semibold text-emerald-700/80 dark:text-slate-400 pl-1.5">#{rank + 1}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className={cn("font-medium", rank === 0 ? "text-amber-800 dark:text-amber-300" : "text-emerald-950 dark:text-slate-200")}>{s.sellerName}</div>
                      <div className="text-xs text-emerald-600 dark:text-slate-500">{s.membershipId ? `ID: ${s.membershipId}` : `${s.eventCount} event${s.eventCount === 1 ? "" : "s"}`}</div>
                    </TableCell>
                    <TableCell className="text-sm text-emerald-800/90 dark:text-slate-300 max-w-[240px] truncate">{s.topEventName}</TableCell>
                    <TableCell className="text-sm text-emerald-800/80 dark:text-slate-400">{fmtDate(s.topEventDate)}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-950 dark:text-slate-200">{s.totalTickets}</TableCell>
                    <TableCell className="text-right text-emerald-900 dark:text-slate-300">{formatSAR(s.totalRevenue)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 h-1.5 rounded-full bg-emerald-50 dark:bg-slate-800 overflow-hidden">
                          <div className={cn("h-full rounded-full", rank === 0 ? "bg-amber-400" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-medium text-emerald-700 dark:text-slate-400 w-9 text-right">{pct}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Seller detail dialog */}
      <Dialog open={!!detailSeller} onOpenChange={(o) => { if (!o) setDetailSeller(null); }}>
        <DialogContent className="max-w-lg dark:bg-slate-900 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-emerald-950 dark:text-slate-100">
              {detailSeller && (rankByTickets.get(detailSeller.sellerName) ?? 3) < 3 ? `${MEDALS[rankByTickets.get(detailSeller.sellerName)!]} ` : ""}
              {detailSeller?.sellerName}
            </DialogTitle>
          </DialogHeader>
          {detailSeller && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="text-emerald-700 dark:text-slate-400">Member ID: <span className="font-medium text-emerald-950 dark:text-slate-200">{detailSeller.membershipId ?? "—"}</span></span>
                <span className="text-emerald-700 dark:text-slate-400">Events: <span className="font-medium text-emerald-950 dark:text-slate-200">{detailSeller.eventCount}</span></span>
                <span className="text-emerald-700 dark:text-slate-400">Total contribution: <span className="font-medium text-emerald-950 dark:text-slate-200">{detailSeller.totalTickets} tickets · {formatSAR(detailSeller.totalRevenue)}</span></span>
              </div>
              <div className="rounded-xl border border-emerald-100 dark:border-slate-800 overflow-hidden">
                <Table>
                  <TableHeader className="bg-emerald-50/50 dark:bg-slate-800/60">
                    <TableRow className="dark:border-slate-700">
                      <TableHead className="text-xs font-semibold text-emerald-900 dark:text-slate-300">Event</TableHead>
                      <TableHead className="text-xs font-semibold text-emerald-900 dark:text-slate-300">Date</TableHead>
                      <TableHead className="text-xs font-semibold text-emerald-900 dark:text-slate-300 text-right">Tickets</TableHead>
                      <TableHead className="text-xs font-semibold text-emerald-900 dark:text-slate-300 text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailSeller.perEvent.map((e) => (
                      <TableRow key={e.eventName} className="dark:border-slate-800">
                        <TableCell className="text-sm text-emerald-950 dark:text-slate-200 max-w-[200px] truncate">{e.eventName}</TableCell>
                        <TableCell className="text-xs text-emerald-800/80 dark:text-slate-400">{fmtDate(e.eventDate)}</TableCell>
                        <TableCell className="text-sm text-right font-medium text-emerald-950 dark:text-slate-200">{e.tickets}</TableCell>
                        <TableCell className="text-sm text-right text-emerald-900 dark:text-slate-300">{formatSAR(e.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
