import { useMemo, useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import {
  UserPlus, Users, Trophy, TrendingUp, Search, ChevronDown, ChevronRight,
  FileDown, FileSpreadsheet, Medal, CalendarDays, Crown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useListMembers, type Member } from "@workspace/api-client-react";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

async function loadImageAsBase64(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

interface ReferrerRow {
  member: Member;
  referred: Member[];
}

const isActive = (m: Member) => m.frfStatus === "active";

export default function MembershipDrivePage() {
  const { toast } = useToast();
  const { data: members, isLoading } = useListMembers();

  const [search, setSearch]         = useState("");
  const [fromDate, setFromDate]     = useState("");
  const [toDate, setToDate]         = useState("");
  const [minReferrals, setMinRef]   = useState("all");
  const [statusFilter, setStatus]   = useState("all");
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());
  const [exporting, setExporting]   = useState(false);

  const all = useMemo(() => members ?? [], [members]);

  /** Referrer rows after all filters, sorted by referral count desc. */
  const referrers = useMemo<ReferrerRow[]>(() => {
    const byId = new Map(all.map((m) => [m.id, m]));
    const map = new Map<string, Member[]>();
    for (const m of all) {
      if (!m.refMemberId || !byId.has(m.refMemberId)) continue;
      // Date-range filter applies to the referred member's join date.
      if (fromDate && new Date(m.createdAt) < new Date(`${fromDate}T00:00:00`)) continue;
      if (toDate && new Date(m.createdAt) > new Date(`${toDate}T23:59:59`)) continue;
      // Status filter applies to the referred member.
      if (statusFilter === "active" && !isActive(m)) continue;
      if (statusFilter === "inactive" && isActive(m)) continue;
      const list = map.get(m.refMemberId) ?? [];
      list.push(m);
      map.set(m.refMemberId, list);
    }
    let rows: ReferrerRow[] = Array.from(map.entries()).map(([id, referred]) => ({
      member: byId.get(id)!,
      referred: referred.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    }));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) => r.member.fullName.toLowerCase().includes(q) || r.member.membershipId.toLowerCase().includes(q),
      );
    }
    if (minReferrals !== "all") {
      const min = parseInt(minReferrals, 10);
      rows = rows.filter((r) => r.referred.length >= min);
    }
    return rows.sort((a, b) => b.referred.length - a.referred.length || a.member.fullName.localeCompare(b.member.fullName));
  }, [all, search, fromDate, toDate, minReferrals, statusFilter]);

  const filteredReferred = useMemo(() => referrers.flatMap((r) => r.referred), [referrers]);

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = filteredReferred.filter((m) => {
      const d = new Date(m.createdAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    return {
      totalReferred: filteredReferred.length,
      activeReferred: filteredReferred.filter(isActive).length,
      referrerCount: referrers.length,
      thisMonth,
    };
  }, [filteredReferred, referrers]);

  /** Last 12 months growth from filtered referred members. */
  const monthly = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; label: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: format(d, "MMM yy"), count: 0 });
    }
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    for (const m of filteredReferred) {
      const d = new Date(m.createdAt);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      const i = idx.get(k);
      if (i !== undefined) buckets[i]!.count += 1;
    }
    return buckets;
  }, [filteredReferred]);

  const leaderboard = referrers.slice(0, 10);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const filterSummary = () => {
    const parts: string[] = [];
    if (fromDate) parts.push(`from ${fromDate}`);
    if (toDate) parts.push(`to ${toDate}`);
    if (statusFilter !== "all") parts.push(`${statusFilter} referred members`);
    if (minReferrals !== "all") parts.push(`min ${minReferrals} referrals`);
    if (search.trim()) parts.push(`search "${search.trim()}"`);
    return parts.length ? parts.join(", ") : "All referrals";
  };

  const exportPdf = async (monthlyReport: boolean) => {
    setExporting(true);
    try {
      const doc = new jsPDF();
      const logo = await loadImageAsBase64(`${basePath}/logo-circle.png`);
      if (logo) doc.addImage(logo, "PNG", 6, 4, 20, 20);
      doc.setFontSize(16);
      doc.setTextColor(20, 83, 45);
      doc.text(monthlyReport ? "DKMO Membership Drive — Monthly Report" : "DKMO Membership Drive — Referral Report", 30, 12);
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`Generated ${format(new Date(), "dd MMM yyyy HH:mm")} · ${filterSummary()}`, 30, 18);
      doc.text(
        `Referred members: ${stats.totalReferred}   Active: ${stats.activeReferred}   Referrers: ${stats.referrerCount}   This month: ${stats.thisMonth}`,
        30, 23,
      );

      if (monthlyReport) {
        autoTable(doc, {
          startY: 30,
          head: [["Month", "New Members via Referral"]],
          body: monthly.map((b) => [b.label, String(b.count)]),
          headStyles: { fillColor: [22, 101, 52] },
          styles: { fontSize: 9 },
        });
        autoTable(doc, {
          startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8,
          head: [["Rank", "Member", "Member ID", "Referrals"]],
          body: leaderboard.map((r, i) => [String(i + 1), r.member.fullName, r.member.membershipId, String(r.referred.length)]),
          headStyles: { fillColor: [22, 101, 52] },
          styles: { fontSize: 9 },
        });
        doc.save(`dkmo-membership-drive-monthly-${format(new Date(), "yyyyMMdd")}.pdf`);
      } else {
        const body: string[][] = [];
        for (const r of referrers) {
          for (const m of r.referred) {
            body.push([
              r.member.fullName,
              r.member.membershipId,
              String(r.referred.length),
              m.fullName,
              m.membershipId,
              format(new Date(m.createdAt), "dd MMM yyyy"),
              isActive(m) ? "Active" : "Inactive",
            ]);
          }
        }
        autoTable(doc, {
          startY: 30,
          head: [["Referrer", "Referrer ID", "Total", "Referred Member", "Member ID", "Joined", "Status"]],
          body,
          headStyles: { fillColor: [22, 101, 52] },
          styles: { fontSize: 8 },
        });
        doc.save(`dkmo-referral-report-${format(new Date(), "yyyyMMdd")}.pdf`);
      }
      toast({ title: "PDF downloaded" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Referrals");
      ws.columns = [
        { header: "Referrer", key: "ref", width: 28 },
        { header: "Referrer ID", key: "refId", width: 14 },
        { header: "Total Referred", key: "total", width: 14 },
        { header: "Referred Member", key: "mem", width: 28 },
        { header: "Member ID", key: "memId", width: 14 },
        { header: "Joined", key: "joined", width: 14 },
        { header: "Status", key: "status", width: 10 },
      ];
      ws.getRow(1).font = { bold: true };
      for (const r of referrers) {
        for (const m of r.referred) {
          ws.addRow({
            ref: r.member.fullName, refId: r.member.membershipId, total: r.referred.length,
            mem: m.fullName, memId: m.membershipId,
            joined: format(new Date(m.createdAt), "dd MMM yyyy"),
            status: isActive(m) ? "Active" : "Inactive",
          });
        }
      }
      const ws2 = wb.addWorksheet("Monthly Growth");
      ws2.columns = [
        { header: "Month", key: "m", width: 12 },
        { header: "New Members via Referral", key: "c", width: 24 },
      ];
      ws2.getRow(1).font = { bold: true };
      monthly.forEach((b) => ws2.addRow({ m: b.label, c: b.count }));
      const ws3 = wb.addWorksheet("Leaderboard");
      ws3.columns = [
        { header: "Rank", key: "r", width: 8 },
        { header: "Member", key: "n", width: 28 },
        { header: "Member ID", key: "i", width: 14 },
        { header: "Referrals", key: "c", width: 12 },
      ];
      ws3.getRow(1).font = { bold: true };
      leaderboard.forEach((r, i) => ws3.addRow({ r: i + 1, n: r.member.fullName, i: r.member.membershipId, c: r.referred.length }));

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dkmo-referral-report-${format(new Date(), "yyyyMMdd")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Excel downloaded" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const rankBadge = (i: number) => {
    if (i === 0) return <Crown className="h-4 w-4 text-yellow-500" />;
    if (i === 1) return <Medal className="h-4 w-4 text-slate-400" />;
    if (i === 2) return <Medal className="h-4 w-4 text-amber-600" />;
    return <span className="text-xs font-bold text-slate-500 w-4 text-center">{i + 1}</span>;
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const statCards = [
    {
      label: "Total Referred Members", value: stats.totalReferred, icon: UserPlus,
      color: "text-green-700 dark:text-green-400", hint: "View all referrers",
      onClick: () => { setStatus("all"); setFromDate(""); setToDate(""); scrollToSection("referrer-list"); },
    },
    {
      label: "Active Referred", value: stats.activeReferred, icon: Users,
      color: "text-emerald-600 dark:text-emerald-400", hint: "Filter active members",
      onClick: () => { setStatus("active"); scrollToSection("referrer-list"); },
    },
    {
      label: "Members Referring", value: stats.referrerCount, icon: Trophy,
      color: "text-amber-600 dark:text-amber-400", hint: "View leaderboard",
      onClick: () => scrollToSection("leaderboard"),
    },
    {
      label: "This Month", value: stats.thisMonth, icon: TrendingUp,
      color: "text-blue-600 dark:text-blue-400", hint: "Filter this month",
      onClick: () => {
        const now = new Date();
        const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        setFromDate(first);
        setToDate(now.toISOString().slice(0, 10));
        scrollToSection("referrer-list");
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-green-950 dark:text-green-100">Membership Drive</h1>
          <p className="text-sm text-green-800/70 dark:text-slate-400 mt-1">
            Track and celebrate members who grow the DKMO family through referrals
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Button variant="outline" onClick={() => exportPdf(true)} disabled={exporting || isLoading}
            className="min-h-9 flex-1 gap-2 border-green-200 text-green-800 active:scale-[0.98] dark:border-slate-700 dark:text-green-300 sm:flex-none" data-testid="button-monthly-report">
            <CalendarDays className="h-4 w-4" /> Monthly Report
          </Button>
          <Button variant="outline" onClick={() => exportPdf(false)} disabled={exporting || isLoading}
            className="min-h-9 flex-1 gap-2 border-green-200 text-green-800 active:scale-[0.98] dark:border-slate-700 dark:text-green-300 sm:flex-none" data-testid="button-export-pdf">
            <FileDown className="h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" onClick={exportExcel} disabled={exporting || isLoading}
            className="min-h-9 flex-1 gap-2 border-green-200 text-green-800 active:scale-[0.98] dark:border-slate-700 dark:text-green-300 sm:flex-none" data-testid="button-export-excel">
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(({ label, value, icon: Icon, color, hint, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            title={hint}
            className="group w-full rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            data-testid={`stat-card-${label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <Card className="rounded-2xl border-green-100 shadow-sm transition-all duration-150 group-hover:-translate-y-0.5 group-hover:border-green-300 group-hover:shadow-md group-active:translate-y-0 group-active:scale-[0.99] dark:border-slate-800 dark:bg-slate-900 dark:group-hover:border-green-700">
              <CardContent className="pb-4 pt-4">
                <div className="flex items-center gap-3">
                  <Icon className={`h-5 w-5 shrink-0 ${color}`} />
                  <div className="min-w-0">
                    <p className="text-2xl font-bold text-green-950 dark:text-white">{isLoading ? "…" : value}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{label}</p>
                    <p className="text-[11px] text-green-700/0 transition-colors group-hover:text-green-700 dark:group-hover:text-green-400">{hint}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Monthly growth */}
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-green-900 dark:text-green-100 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Monthly Referral Growth
            </CardTitle>
            <CardDescription>New members joined through referrals — last 12 months</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {isLoading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [v as number, "New members"]} />
                  <Bar dataKey="count" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Leaderboard */}
        <Card id="leaderboard" className="scroll-mt-20 rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-green-900 dark:text-green-100 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" /> Top Referral Members
            </CardTitle>
            <CardDescription>Leaderboard by successful referrals</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
              : leaderboard.length === 0
              ? <p className="text-sm text-slate-400 py-6 text-center">No referrals recorded yet.</p>
              : leaderboard.map((r, i) => (
                  <Link key={r.member.id} href={`/members/${r.member.id}`}>
                    <div className={cn(
                      "flex items-center justify-between gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors",
                      i === 0 ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
                              : "hover:bg-green-50/50 dark:hover:bg-slate-800/50 border border-transparent",
                    )} data-testid={`leaderboard-row-${i + 1}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-5 flex justify-center shrink-0">{rankBadge(i)}</div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-green-950 dark:text-slate-100 truncate">{r.member.fullName}</p>
                          <p className="text-xs text-slate-400">{r.member.membershipId}</p>
                        </div>
                      </div>
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 shrink-0">
                        {r.referred.length} referral{r.referred.length !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </Link>
                ))}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardContent className="pt-4 pb-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="sm:col-span-2 lg:col-span-2">
              <Label className="text-xs font-medium">Search referrer</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-700/60" />
                <Input placeholder="Name or membership ID…" value={search} onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 border-green-200 dark:border-slate-700 dark:bg-slate-800/60" data-testid="input-drive-search" />
              </div>
            </div>
            <div>
              <Label className="text-xs font-medium">Joined from</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="mt-1 border-green-200 dark:border-slate-700 dark:bg-slate-800/60" />
            </div>
            <div>
              <Label className="text-xs font-medium">Joined to</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                className="mt-1 border-green-200 dark:border-slate-700 dark:bg-slate-800/60" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-medium">Min referrals</Label>
                <Select value={minReferrals} onValueChange={setMinRef}>
                  <SelectTrigger className="mt-1 border-green-200 dark:border-slate-700 dark:bg-slate-800/60"><SelectValue /></SelectTrigger>
                  <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                    <SelectItem value="all">Any</SelectItem>
                    <SelectItem value="2">2+</SelectItem>
                    <SelectItem value="3">3+</SelectItem>
                    <SelectItem value="5">5+</SelectItem>
                    <SelectItem value="10">10+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-medium">Status</Label>
                <Select value={statusFilter} onValueChange={setStatus}>
                  <SelectTrigger className="mt-1 border-green-200 dark:border-slate-700 dark:bg-slate-800/60"><SelectValue /></SelectTrigger>
                  <SelectContent className="dark:bg-slate-900 dark:border-slate-800">
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Referral list */}
      <Card id="referrer-list" className="scroll-mt-20 rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm overflow-hidden">
        <CardHeader className="pb-0">
          <CardTitle className="text-base text-green-900 dark:text-green-100 flex items-center gap-2">
            <Users className="h-4 w-4" /> Member Referral List
          </CardTitle>
          <CardDescription>Click a row to see who each member has referred</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow className="border-green-100 dark:border-slate-800 bg-green-50/50 dark:bg-slate-800/50">
                <TableHead className="w-8" />
                <TableHead className="font-semibold text-green-900 dark:text-green-300">Member</TableHead>
                <TableHead className="font-semibold text-green-900 dark:text-green-300">Member ID</TableHead>
                <TableHead className="font-semibold text-green-900 dark:text-green-300 text-center">Total Referred</TableHead>
                <TableHead className="font-semibold text-green-900 dark:text-green-300 hidden md:table-cell">Latest Referral</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}</TableRow>
                  ))
                : referrers.length === 0
                ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-16">
                      <UserPlus className="h-12 w-12 mx-auto mb-3 text-slate-300 dark:text-slate-700" />
                      <p className="text-slate-500 dark:text-slate-400 font-medium">No referrals match the selected filters</p>
                      <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">Set "Referred By" when adding a new member to track referrals.</p>
                    </TableCell>
                  </TableRow>
                )
                : referrers.map((r) => {
                    const open = expanded.has(r.member.id);
                    return [
                      <TableRow key={r.member.id}
                        className="cursor-pointer border-green-50 dark:border-slate-800 hover:bg-green-50/40 dark:hover:bg-slate-800/40"
                        onClick={() => toggleExpand(r.member.id)}
                        data-testid={`referrer-row-${r.member.membershipId}`}>
                        <TableCell className="pl-4 pr-0">
                          {open ? <ChevronDown className="h-4 w-4 text-green-700" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                        </TableCell>
                        <TableCell className="font-medium text-green-950 dark:text-slate-100">{r.member.fullName}</TableCell>
                        <TableCell className="text-slate-500">{r.member.membershipId}</TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">{r.referred.length}</Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-slate-500">
                          {r.referred[0] ? format(new Date(r.referred[0].createdAt), "dd MMM yyyy") : "—"}
                        </TableCell>
                      </TableRow>,
                      open && (
                        <TableRow key={`${r.member.id}-detail`} className="border-green-50 dark:border-slate-800 bg-green-50/30 dark:bg-slate-800/20 hover:bg-green-50/30">
                          <TableCell colSpan={5} className="py-3 px-6">
                            <div className="space-y-1.5">
                              {r.referred.map((m) => (
                                <Link key={m.id} href={`/members/${m.id}`}>
                                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white dark:bg-slate-900 border border-green-100 dark:border-slate-800 px-3 py-2 cursor-pointer hover:border-green-300 dark:hover:border-green-700 transition-colors">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <UserPlus className="h-3.5 w-3.5 text-green-600 shrink-0" />
                                      <span className="text-sm font-medium text-green-950 dark:text-slate-100 truncate">{m.fullName}</span>
                                      <span className="text-xs text-slate-400">{m.membershipId}</span>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                      <span className="text-xs text-slate-500">Joined {format(new Date(m.createdAt), "dd MMM yyyy")}</span>
                                      <Badge className={cn("text-xs", isActive(m)
                                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400")}>
                                        {isActive(m) ? "Active" : "Inactive"}
                                      </Badge>
                                    </div>
                                  </div>
                                </Link>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ),
                    ];
                  })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
