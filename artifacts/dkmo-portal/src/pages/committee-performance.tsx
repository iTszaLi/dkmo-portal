import { useMemo, useState } from "react";
import { Link } from "wouter";
import type { CommitteePerformanceEntry } from "@workspace/api-client-react";
import { useGetCommitteePerformance, useListMembers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatSAR, cn } from "@/lib/utils";
import { initialsOf } from "@/lib/committee";
import { Trophy, Users, Coins, HeartHandshake, Landmark, Activity, Search, FileDown, FileSpreadsheet, Printer, X } from "lucide-react";

type SortKey = "activity" | "name" | "recruited" | "fees" | "frf" | "loans";

const SORT_LABEL: Record<SortKey, string> = {
  activity: "Activity score (high → low)",
  name: "Name (A → Z)",
  recruited: "Members recruited",
  fees: "Fees collected",
  frf: "FRF referred",
  loans: "Loans processed",
};

export default function CommitteeActivityReport() {
  const [search, setSearch] = useState("");
  const [designation, setDesignation] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("activity");

  // undefined (not {}) when no dates — keeps the same react-query cache key
  // as other unfiltered consumers of this endpoint.
  const dateParams = useMemo(() => {
    if (!fromDate && !toDate) return undefined;
    const p: { from?: string; to?: string } = {};
    if (fromDate) p.from = fromDate;
    if (toDate) p.to = toDate;
    return p;
  }, [fromDate, toDate]);

  const { data, isLoading } = useGetCommitteePerformance(dateParams);
  const { data: allMembers } = useListMembers();

  // Live committee roster derived from the single DB source of truth.
  const roster = useMemo(
    () =>
      (allMembers ?? []).filter(
        (m) =>
          (m as any).isExecutiveCommittee === true ||
          (m as any).isCoreCommittee === true,
      ),
    [allMembers],
  );

  const roleByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of roster) m.set(c.fullName.trim().toLowerCase(), (c as any).designation || "Committee Member");
    return m;
  }, [roster]);

  const designations = useMemo(() => {
    const set = new Set<string>();
    for (const role of roleByName.values()) set.add(role);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [roleByName]);

  const entries = useMemo(() => {
    const apiEntries = data?.entries ?? [];
    const byName = new Map<string, CommitteePerformanceEntry>();
    for (const e of apiEntries) byName.set(e.name.trim().toLowerCase(), e);

    const emptyEntry = (name: string): CommitteePerformanceEntry => ({
      name,
      membersRecruited: 0,
      feesCollected: 0,
      frfCount: 0,
      frfAmount: 0,
      welfareHandled: 0,
      loansProcessed: 0,
      medicalAidProcessed: 0,
      emergencyResolved: 0,
      frfReferred: 0,
      totalContributionScore: 0,
      totalActions: 0,
    });

    // Every committee member appears, even with zero activity.
    const merged: CommitteePerformanceEntry[] = roster.map(
      (c) => byName.get(c.fullName.trim().toLowerCase()) ?? emptyEntry(c.fullName),
    );

    // Plus any active non-committee contributors (staff) not on the roster.
    const rosterNames = new Set(roster.map((c) => c.fullName.trim().toLowerCase()));
    for (const e of apiEntries) {
      if (!rosterNames.has(e.name.trim().toLowerCase())) merged.push(e);
    }
    return merged;
  }, [data, roster]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = entries;
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q));
    if (designation !== "all") {
      list = list.filter((e) => (roleByName.get(e.name.trim().toLowerCase()) ?? "__staff") === designation);
    }
    const sorters: Record<SortKey, (a: CommitteePerformanceEntry, b: CommitteePerformanceEntry) => number> = {
      activity: (a, b) => b.totalContributionScore - a.totalContributionScore || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      recruited: (a, b) => b.membersRecruited - a.membersRecruited || a.name.localeCompare(b.name),
      fees: (a, b) => b.feesCollected - a.feesCollected || a.name.localeCompare(b.name),
      frf: (a, b) => b.frfReferred - a.frfReferred || a.name.localeCompare(b.name),
      loans: (a, b) => b.loansProcessed - a.loansProcessed || a.name.localeCompare(b.name),
    };
    return [...list].sort(sorters[sortKey]);
  }, [entries, search, designation, sortKey, roleByName]);

  const activeCount = (data?.entries ?? []).length;
  const hasFilters = search.trim() !== "" || designation !== "all" || fromDate !== "" || toDate !== "";

  // Compact highlights derived from the current filtered set.
  const highlights = useMemo(() => {
    const activeMembers = filtered.filter((e) => e.totalActions > 0).length;

    const pickMax = (
      selector: (e: CommitteePerformanceEntry) => number,
    ): { name: string; value: number } | null => {
      let best: CommitteePerformanceEntry | null = null;
      for (const e of filtered) {
        if (best === null || selector(e) > selector(best)) best = e;
      }
      if (!best) return null;
      const value = selector(best);
      return { name: best.name, value };
    };

    return {
      activeMembers,
      topPerformer: pickMax((e) => e.totalContributionScore),
      topFees: pickMax((e) => e.feesCollected),
      topFrf: pickMax((e) => e.frfReferred),
      topLoans: pickMax((e) => e.loansProcessed),
    };
  }, [filtered]);

  const rangeLabel =
    fromDate || toDate
      ? `${fromDate || "beginning"} → ${toDate || "today"}`
      : "All time";

  const exportRows = () =>
    filtered.map((e) => ({
      name: e.name,
      designation: roleByName.get(e.name.trim().toLowerCase()) ?? "Staff / non-committee",
      recruited: e.membersRecruited,
      fees: e.feesCollected,
      frfReferred: e.frfReferred,
      loans: e.loansProcessed,
      score: e.totalContributionScore,
    }));

  const exportPdf = async () => {
    const { default: JsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new JsPDF({ orientation: "landscape" });
    // DKMO logo, top-right corner
    try {
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
      const resp = await fetch(`${basePath}/logo-circle.png`);
      if (resp.ok) {
        const blob = await resp.blob();
        const logoDataUrl = await new Promise<string>((res, rej) => {
          const fr = new FileReader();
          fr.onloadend = () => res(fr.result as string);
          fr.onerror = rej;
          fr.readAsDataURL(blob);
        });
        const pageW = doc.internal.pageSize.getWidth();
        doc.addImage(logoDataUrl, "PNG", pageW - 14 - 18, 6, 18, 18);
      }
    } catch {
      // Logo is decorative — continue without it if it can't be loaded.
    }
    doc.setFontSize(16);
    doc.setTextColor(6, 78, 59);
    doc.text("DKMO — Committee Performance Report", 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(70);
    doc.text(`Period: ${rangeLabel}   •   Generated: ${new Date().toLocaleDateString()}   •   ${filtered.length} member(s)`, 14, 23);
    autoTable(doc, {
      startY: 28,
      head: [["#", "Committee Member", "Designation", "Members Recruited", "Fees Collected (SAR)", "FRF Referred", "Loans", "Activity Score"]],
      body: exportRows().map((r, i) => [i + 1, r.name, r.designation, r.recruited, r.fees.toFixed(2), r.frfReferred, r.loans, r.score]),
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [21, 128, 61] },
      alternateRowStyles: { fillColor: [240, 253, 244] },
    });
    doc.save(`committee-performance-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const exportExcel = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Committee Performance");
    ws.columns = [
      { header: "Committee Member", key: "name", width: 30 },
      { header: "Designation", key: "designation", width: 24 },
      { header: "Members Recruited", key: "recruited", width: 18 },
      { header: "Fees Collected (SAR)", key: "fees", width: 20 },
      { header: "FRF Referred", key: "frfReferred", width: 14 },
      { header: "Loans Processed", key: "loans", width: 16 },
      { header: "Activity Score", key: "score", width: 14 },
    ];
    ws.getRow(1).font = { bold: true };
    exportRows().forEach((r) => ws.addRow(r));
    ws.addRow({});
    ws.addRow({ name: `Period: ${rangeLabel}`, designation: `Generated ${new Date().toLocaleString()}` });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `committee-performance-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 print:space-y-3">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <Link
            href="/reports"
            className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline print:hidden"
            data-testid="link-all-reports"
          >
            ← All Reports
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-green-950 dark:text-green-100 print:text-xl mt-1">Committee Performance Report</h1>
          <p className="text-sm text-green-800/70 dark:text-slate-400 mt-1">
            Full per-member activity across all programs — {rangeLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <span className="text-sm text-green-900 dark:text-green-300 bg-green-50 dark:bg-slate-800 border border-green-100 dark:border-slate-700 px-3.5 py-1.5 rounded-full font-medium inline-flex items-center gap-2">
            <Activity className="h-4 w-4 text-green-700 dark:text-green-400" />
            {activeCount} active contributor{activeCount === 1 ? "" : "s"}
          </span>
          <Button variant="outline" size="sm" onClick={exportPdf} className="border-green-300 text-green-800 dark:border-slate-700 dark:text-green-300" data-testid="button-export-pdf">
            <FileDown className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} className="border-green-300 text-green-800 dark:border-slate-700 dark:text-green-300" data-testid="button-export-excel">
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="border-green-300 text-green-800 dark:border-slate-700 dark:text-green-300" data-testid="button-print-report">
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm print:hidden">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500 dark:text-slate-500" />
            <Input
              placeholder="Search by member name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 dark:bg-slate-800 dark:border-slate-700"
              data-testid="input-search-committee"
            />
          </div>
          <Select value={designation} onValueChange={setDesignation}>
            <SelectTrigger className="w-[190px] dark:bg-slate-800 dark:border-slate-700" data-testid="select-designation">
              <SelectValue placeholder="Designation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All designations</SelectItem>
              {designations.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
              <SelectItem value="__staff">Staff / non-committee</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <div>
              <label className="text-[11px] text-green-700/70 dark:text-slate-500 block mb-1">From</label>
              <Input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className="w-[150px] dark:bg-slate-800 dark:border-slate-700" data-testid="input-date-from" />
            </div>
            <div>
              <label className="text-[11px] text-green-700/70 dark:text-slate-500 block mb-1">To</label>
              <Input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className="w-[150px] dark:bg-slate-800 dark:border-slate-700" data-testid="input-date-to" />
            </div>
          </div>
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="w-[220px] dark:bg-slate-800 dark:border-slate-700" data-testid="select-sort">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <SelectItem key={k} value={k}>{SORT_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(""); setDesignation("all"); setFromDate(""); setToDate(""); }}
              className="text-emerald-700 dark:text-emerald-400"
              data-testid="button-clear-committee-filters"
            >
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Highlights strip (reflects current filters) */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 print:grid-cols-5">
        <HighlightCard
          icon={Users}
          label="Active Committee Members"
          accent="text-green-700 dark:text-green-400"
          loading={isLoading}
          value={highlights.activeMembers}
        />
        <HighlightCard
          icon={Trophy}
          label="Top Performer"
          accent="text-amber-600 dark:text-amber-400"
          loading={isLoading}
          value={highlights.topPerformer && highlights.topPerformer.value > 0 ? highlights.topPerformer.value : "—"}
          name={highlights.topPerformer && highlights.topPerformer.value > 0 ? highlights.topPerformer.name : undefined}
        />
        <HighlightCard
          icon={Coins}
          label="Top Membership Collector"
          accent="text-emerald-700 dark:text-emerald-400"
          loading={isLoading}
          value={highlights.topFees && highlights.topFees.value > 0 ? formatSAR(highlights.topFees.value) : "—"}
          name={highlights.topFees && highlights.topFees.value > 0 ? highlights.topFees.name : undefined}
        />
        <HighlightCard
          icon={HeartHandshake}
          label="Top FRF Referrer"
          accent="text-rose-600 dark:text-rose-400"
          loading={isLoading}
          value={highlights.topFrf && highlights.topFrf.value > 0 ? highlights.topFrf.value : "—"}
          name={highlights.topFrf && highlights.topFrf.value > 0 ? highlights.topFrf.name : undefined}
        />
        <HighlightCard
          icon={Landmark}
          label="Top Loan Processor"
          accent="text-purple-600 dark:text-purple-400"
          loading={isLoading}
          value={highlights.topLoans && highlights.topLoans.value > 0 ? highlights.topLoans.value : "—"}
          name={highlights.topLoans && highlights.topLoans.value > 0 ? highlights.topLoans.name : undefined}
        />
      </div>

      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
            <Activity className="h-4 w-4 text-green-600" />
            Activity by Member
          </CardTitle>
          <CardDescription className="dark:text-slate-400">
            Recorded actions per committee member — fee collection, recruitment, and case handling.
            {hasFilters ? ` Showing ${filtered.length} of ${entries.length}.` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-green-700/70 dark:text-slate-500 py-12 text-center">
              {hasFilters ? "No members match the current filters." : "No committee activity has been recorded yet."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-green-700/70 dark:text-slate-500 border-b border-green-100 dark:border-slate-800">
                    <th className="py-2 pr-3 font-medium">Committee Member</th>
                    <th className="py-2 px-2 font-medium text-right">Members Recruited</th>
                    <th className="py-2 px-2 font-medium text-right">Fees Collected</th>
                    <th className="py-2 px-2 font-medium text-right">FRF Referred</th>
                    <th className="py-2 px-2 font-medium text-right">Loans</th>
                    <th className="py-2 pl-2 font-medium text-right">Activity Score</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e, i) => {
                    const role = roleByName.get(e.name.trim().toLowerCase());
                    return (
                      <tr
                        key={e.name}
                        data-testid={`row-perf-${i}`}
                        className="border-b border-green-50 dark:border-slate-800/60 hover:bg-green-50/40 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-green-100 dark:bg-slate-800 border border-green-100 dark:border-slate-700 flex items-center justify-center text-xs font-bold text-green-800 dark:text-green-300 shrink-0">
                              {initialsOf(e.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-green-950 dark:text-slate-100 truncate">{e.name}</p>
                              {role ? (
                                <Badge className="mt-0.5 bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-300 text-[10px] px-1.5 py-0">
                                  {role}
                                </Badge>
                              ) : (
                                <span className="text-[11px] text-green-600/60 dark:text-slate-500">Staff / non-committee</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <NumCell value={e.membersRecruited} />
                        <td className="py-3 px-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">
                          {e.feesCollected > 0 ? formatSAR(e.feesCollected) : "—"}
                        </td>
                        <NumCell value={e.frfReferred} />
                        <NumCell value={e.loansProcessed} />
                        <td className="py-3 pl-2 text-right">
                          <span className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tabular-nums",
                            e.totalContributionScore > 0
                              ? "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-300"
                              : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600",
                          )}>
                            {e.totalContributionScore}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NumCell({ value }: { value: number }) {
  return (
    <td className={cn("py-3 px-2 text-right tabular-nums", value > 0 ? "text-green-900 dark:text-slate-200 font-medium" : "text-green-400/50 dark:text-slate-600")}>
      {value > 0 ? value : "—"}
    </td>
  );
}

function HighlightCard({
  icon: Icon,
  label,
  value,
  name,
  accent,
  loading,
}: {
  icon: typeof Trophy;
  label: string;
  value: number | string;
  name?: string;
  accent: string;
  loading: boolean;
}) {
  return (
    <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 shrink-0 ${accent}`} />
          <span className="text-[11px] font-medium text-green-900 dark:text-slate-300 leading-tight">{label}</span>
        </div>
        {loading ? (
          <Skeleton className="h-6 w-16 mt-2" />
        ) : (
          <>
            <div className="text-lg font-bold text-green-950 dark:text-white mt-2 tabular-nums truncate">{value}</div>
            {name ? (
              <p className="text-[11px] text-green-700/70 dark:text-slate-400 mt-0.5 truncate">{name}</p>
            ) : (
              <p className="text-[11px] text-transparent mt-0.5 select-none" aria-hidden>—</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
