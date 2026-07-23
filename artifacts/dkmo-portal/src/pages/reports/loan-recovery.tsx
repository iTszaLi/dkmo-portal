import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useListLoans, useListMembers } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSAR, formatDate, cn } from "@/lib/utils";
import { initialsOf } from "@/lib/committee";
import { ArrowLeft, Search, FileDown, FileSpreadsheet, Printer, X, HandCoins, Coins, Trophy, Percent } from "lucide-react";
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

type SortKey = "score" | "amount" | "rate" | "recovered" | "name";

const SORT_LABEL: Record<SortKey, string> = {
  score: "Activity score (high → low)",
  amount: "Recovery amount",
  rate: "Recovery rate %",
  recovered: "Loans recovered",
  name: "Name (A → Z)",
};

type RecoveryRow = {
  name: string;
  designation: string;
  assigned: number;
  recovered: number;
  recoveryAmount: number;
  recoveryRate: number; // 0-100
  lastRecovery: string | null; // ISO
  score: number;
};

// Row/podium accents for the automatic Top-3 ranking (subtle DKMO tints).
const ROW_RANK = {
  1: { icon: "🏆", row: "bg-amber-50/60 hover:bg-amber-50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30" },
  2: { icon: "🥈", row: "bg-slate-50/70 hover:bg-slate-100/70 dark:bg-slate-800/30 dark:hover:bg-slate-800/40" },
  3: { icon: "🥉", row: "bg-orange-50/60 hover:bg-orange-50 dark:bg-orange-950/20 dark:hover:bg-orange-950/30" },
} as const;

export default function LoanRecoveryReport() {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("score");

  const { data, isLoading } = useListLoans({ pageSize: 200 });
  const { data: members } = useListMembers();

  const designationByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const mem of members ?? []) {
      const d = (mem as any).designation as string | undefined;
      if (d) m.set(mem.fullName.trim().toLowerCase(), d);
    }
    return m;
  }, [members]);

  // Aggregate loan recovery per convenor — derived live from the loans book.
  const rows = useMemo<RecoveryRow[]>(() => {
    const map = new Map<string, RecoveryRow>();
    for (const l of data?.items ?? []) {
      const name = (l.convenorName ?? "").trim();
      if (!name) continue;
      let r = map.get(name.toLowerCase());
      if (!r) {
        r = {
          name,
          designation: designationByName.get(name.toLowerCase()) ?? "Committee Member",
          assigned: 0,
          recovered: 0,
          recoveryAmount: 0,
          recoveryRate: 0,
          lastRecovery: null,
          score: 0,
        };
        map.set(name.toLowerCase(), r);
      }
      r.assigned += 1;
      // Money actually recovered so far (EMIs paid) on every assigned loan.
      r.recoveryAmount += Number(l.paidEmis ?? 0) * Number(l.emiAmount ?? 0);
      if (l.status === "closed") {
        r.recovered += 1;
        const ts = l.updatedAt ?? null;
        if (ts && (!r.lastRecovery || ts > r.lastRecovery)) r.lastRecovery = ts;
      }
    }
    for (const r of map.values()) {
      r.recoveryRate = r.assigned > 0 ? Math.round((r.recovered / r.assigned) * 100) : 0;
      // Score: fully recovered loans weigh most, then money recovered and rate.
      r.score = r.recovered * 20 + Math.round(r.recoveryAmount / 1000) + Math.round(r.recoveryRate / 5);
    }
    return [...map.values()];
  }, [data, designationByName]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;
    if (q) list = list.filter((r) => r.name.toLowerCase().includes(q) || r.designation.toLowerCase().includes(q));
    const sorters: Record<SortKey, (a: RecoveryRow, b: RecoveryRow) => number> = {
      score: (a, b) => b.score - a.score || a.name.localeCompare(b.name),
      amount: (a, b) => b.recoveryAmount - a.recoveryAmount || a.name.localeCompare(b.name),
      rate: (a, b) => b.recoveryRate - a.recoveryRate || a.name.localeCompare(b.name),
      recovered: (a, b) => b.recovered - a.recovered || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return [...list].sort(sorters[sortKey]);
  }, [rows, search, sortKey]);

  // Tie-aware competition ranking by score (1, 1, 3 …), independent of the
  // current sort so medals stay consistent.
  const rankByName = useMemo(() => {
    const sorted = [...rows]
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    const map = new Map<string, number>();
    let rank = 0;
    let prev: number | null = null;
    sorted.forEach((r, i) => {
      if (r.score !== prev) {
        rank = i + 1;
        prev = r.score;
      }
      if (rank <= 3) map.set(r.name.toLowerCase(), rank);
    });
    return map;
  }, [rows]);

  const stats = useMemo(() => {
    const totalRecovered = filtered.reduce((a, r) => a + r.recovered, 0);
    const totalAmount = filtered.reduce((a, r) => a + r.recoveryAmount, 0);
    const rated = filtered.filter((r) => r.assigned > 0);
    const avgRate = rated.length > 0 ? Math.round(rated.reduce((a, r) => a + r.recoveryRate, 0) / rated.length) : 0;
    let top: RecoveryRow | null = null;
    for (const r of filtered) if (!top || r.score > top.score) top = r;
    return { totalRecovered, totalAmount, avgRate, top: top && top.score > 0 ? top : null };
  }, [filtered]);

  const hasFilters = search.trim() !== "";

  const generatedOn = () =>
    new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  const exportPDF = async () => {
    if (filtered.length === 0) return;
    const doc = new jsPDF({ orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();
    const green: [number, number, number] = [5, 150, 105];
    const logoDataUrl = await loadImageAsBase64(`${basePath}/logo-circle.png`);

    doc.setFillColor(...green);
    doc.rect(0, 0, pageW, 28, "F");
    if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", 6, 4, 20, 20);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Dakshina Karnataka Muslim Ookota", pageW / 2, 11, { align: "center" });
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("Top Loan Conveyors — Loan Recovery Report", pageW / 2, 19, { align: "center" });

    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.text(
      `Generated: ${generatedOn()}   |   Loans Recovered: ${stats.totalRecovered}   |   Recovery Amount: ${formatSAR(stats.totalAmount)}   |   Avg Recovery Rate: ${stats.avgRate}%`,
      pageW / 2,
      35,
      { align: "center" },
    );

    autoTable(doc, {
      startY: 42,
      head: [["Rank", "Member", "Designation", "Loans Assigned", "Loans Recovered", "Recovery Amount (SAR)", "Recovery Rate %", "Last Recovery", "Activity Score"]],
      body: filtered.map((r, i) => {
        const rank = rankByName.get(r.name.toLowerCase());
        return [
          rank ? `#${rank}` : String(i + 1),
          r.name,
          r.designation,
          String(r.assigned),
          String(r.recovered),
          r.recoveryAmount.toFixed(2),
          `${r.recoveryRate}%`,
          r.lastRecovery ? formatDate(r.lastRecovery) : "—",
          String(r.score),
        ];
      }),
      theme: "grid",
      headStyles: { fillColor: green, fontStyle: "bold", fontSize: 8, halign: "center" },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { halign: "center", cellWidth: 14 },
        3: { halign: "center" },
        4: { halign: "center" },
        5: { halign: "right" },
        6: { halign: "center" },
        8: { halign: "center" },
      },
      didParseCell: (d) => {
        if (d.section === "body") {
          const rank = rankByName.get(filtered[d.row.index]?.name.toLowerCase() ?? "");
          if (rank === 1) d.cell.styles.fillColor = [254, 249, 231];
          if (rank === 2) d.cell.styles.fillColor = [245, 245, 245];
          if (rank === 3) d.cell.styles.fillColor = [255, 244, 230];
        }
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(7.5);
    doc.setTextColor(130, 130, 130);
    doc.text("Committed to the Community", pageW / 2, finalY, { align: "center" });
    doc.text("Confidential — For internal use only", pageW / 2, finalY + 5, { align: "center" });
    doc.save(`DKMO_Loan_Recovery_Report_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const exportExcel = async () => {
    if (filtered.length === 0) return;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "DKMO Portal";
    const sheet = workbook.addWorksheet("Loan Recovery");

    sheet.mergeCells("A1:I1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "Dakshina Karnataka Muslim Ookota (DKMO)";
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: "center" };

    sheet.mergeCells("A2:I2");
    const subtitleCell = sheet.getCell("A2");
    subtitleCell.value = "Top Loan Conveyors — Loan Recovery Report";
    subtitleCell.font = { bold: true, size: 11, color: { argb: "FF059669" } };
    subtitleCell.alignment = { horizontal: "center" };

    sheet.mergeCells("A3:I3");
    const metaCell = sheet.getCell("A3");
    metaCell.value = `Generated: ${generatedOn()}  |  Loans Recovered: ${stats.totalRecovered}  |  Recovery Amount: ${formatSAR(stats.totalAmount)}  |  Avg Rate: ${stats.avgRate}%`;
    metaCell.font = { size: 9, color: { argb: "FF6B7280" } };
    metaCell.alignment = { horizontal: "center" };

    sheet.addRow([]);
    const headerRow = sheet.addRow([
      "Rank", "Member", "Designation", "Loans Assigned", "Loans Recovered",
      "Recovery Amount (SAR)", "Recovery Rate %", "Last Recovery", "Activity Score",
    ]);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } };
      cell.alignment = { horizontal: "center" };
      cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    });

    filtered.forEach((r, i) => {
      const rank = rankByName.get(r.name.toLowerCase());
      const row = sheet.addRow([
        rank ? `#${rank}` : i + 1,
        r.name,
        r.designation,
        r.assigned,
        r.recovered,
        Number(r.recoveryAmount.toFixed(2)),
        r.recoveryRate / 100,
        r.lastRecovery ? formatDate(r.lastRecovery) : "—",
        r.score,
      ]);
      row.getCell(7).numFmt = "0%";
      if (rank && rank <= 3) {
        const fills = { 1: "FFFEF9E7", 2: "FFF5F5F5", 3: "FFFFF4E6" } as const;
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fills[rank as 1 | 2 | 3] } };
        });
      }
      row.eachCell((cell) => {
        cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
      });
    });

    sheet.columns = [
      { width: 7 }, { width: 26 }, { width: 22 }, { width: 14 }, { width: 15 },
      { width: 20 }, { width: 14 }, { width: 16 }, { width: 13 },
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DKMO_Loan_Recovery_Report_${new Date().toISOString().split("T")[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 print:space-y-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Link
            href="/reports"
            className="inline-flex items-center gap-1 text-sm text-emerald-700/80 dark:text-slate-400 hover:text-emerald-900 dark:hover:text-emerald-200 print:hidden"
            data-testid="link-all-reports"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All Reports
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-950 dark:text-emerald-100 mt-1">Top Loan Conveyors</h1>
          <p className="text-emerald-700/80 dark:text-slate-400">
            Loan recovery ranking — loans assigned, recovered, amounts, and recovery rates
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={exportPDF} disabled={isLoading || filtered.length === 0} className="border-emerald-300 text-emerald-800 dark:border-slate-700 dark:text-emerald-300" data-testid="button-export-pdf">
            <FileDown className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={isLoading || filtered.length === 0} className="border-emerald-300 text-emerald-800 dark:border-slate-700 dark:text-emerald-300" data-testid="button-export-excel">
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="border-emerald-300 text-emerald-800 dark:border-slate-700 dark:text-emerald-300" data-testid="button-print-report">
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm print:hidden">
        <CardContent className="pt-6 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500 dark:text-slate-500" />
            <Input
              placeholder="Search by member or designation…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 dark:bg-slate-800 dark:border-slate-700"
              data-testid="input-search-recovery"
            />
          </div>
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="w-[220px] dark:bg-slate-800 dark:border-slate-700" data-testid="select-sort-recovery">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <SelectItem key={k} value={k}>{SORT_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => setSearch("")} className="text-emerald-700 dark:text-emerald-400" data-testid="button-clear-recovery-filters">
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Statistics */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 print:grid-cols-4">
        <StatCard icon={HandCoins} label="Total Loans Recovered" accent="text-green-700 dark:text-green-400" loading={isLoading} value={String(stats.totalRecovered)} />
        <StatCard icon={Coins} label="Total Recovery Amount" accent="text-emerald-700 dark:text-emerald-400" loading={isLoading} value={formatSAR(stats.totalAmount)} />
        <StatCard icon={Trophy} label="Top Recovery Performer" accent="text-amber-600 dark:text-amber-400" loading={isLoading} value={stats.top ? String(stats.top.score) : "—"} sub={stats.top?.name} />
        <StatCard icon={Percent} label="Average Recovery Rate" accent="text-teal-700 dark:text-teal-400" loading={isLoading} value={`${stats.avgRate}%`} />
      </div>

      {/* Ranking table */}
      <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-emerald-700/70 dark:text-slate-500 py-12 text-center">
              {hasFilters ? "No loan conveyors match the current search." : "No loan recovery activity has been recorded yet."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-emerald-700/70 dark:text-slate-500 border-b border-emerald-100 dark:border-slate-800">
                    <th className="py-2 pr-3 font-medium">Member</th>
                    <th className="py-2 px-2 font-medium text-right">Loans Assigned</th>
                    <th className="py-2 px-2 font-medium text-right">Loans Recovered</th>
                    <th className="py-2 px-2 font-medium text-right">Recovery Amount</th>
                    <th className="py-2 px-2 font-medium text-right">Recovery Rate</th>
                    <th className="py-2 px-2 font-medium text-right">Last Recovery</th>
                    <th className="py-2 pl-2 font-medium text-right">Activity Score</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const rank = rankByName.get(r.name.toLowerCase());
                    const rankMeta = rank ? ROW_RANK[rank as 1 | 2 | 3] : undefined;
                    return (
                      <tr
                        key={r.name}
                        data-testid={`row-recovery-${i}`}
                        className={cn(
                          "border-b border-emerald-50 dark:border-slate-800/60 transition-colors",
                          rankMeta ? rankMeta.row : "hover:bg-emerald-50/40 dark:hover:bg-slate-800/40",
                        )}
                      >
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-slate-800 border border-emerald-100 dark:border-slate-700 flex items-center justify-center text-xs font-bold text-emerald-800 dark:text-emerald-300 shrink-0">
                              {initialsOf(r.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-emerald-950 dark:text-slate-100 truncate">
                                {rankMeta && <span className="mr-1" aria-label={`Rank ${rank}`}>{rankMeta.icon}</span>}
                                {r.name}
                              </p>
                              <Badge className="mt-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-300 text-[10px] px-1.5 py-0">
                                {r.designation}
                              </Badge>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-right tabular-nums text-emerald-900 dark:text-slate-200">{r.assigned}</td>
                        <td className="py-3 px-2 text-right">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-300">
                            {r.recovered} recovered
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">
                          {formatSAR(r.recoveryAmount)}
                        </td>
                        <td className="py-3 px-2 text-right tabular-nums font-medium text-emerald-900 dark:text-slate-200">{r.recoveryRate}%</td>
                        <td className="py-3 px-2 text-right text-xs text-emerald-800/80 dark:text-slate-400">
                          {r.lastRecovery ? formatDate(r.lastRecovery) : "—"}
                        </td>
                        <td className="py-3 pl-2 text-right">
                          <span className={cn(
                            "inline-flex items-center px-2.5 py-1 rounded-full text-sm font-bold tabular-nums ring-1",
                            r.score > 0
                              ? "bg-emerald-100 text-emerald-900 ring-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-800"
                              : "bg-slate-100 text-slate-400 ring-slate-200 dark:bg-slate-800 dark:text-slate-600 dark:ring-slate-700",
                          )}>
                            {r.score}
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

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  loading,
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
  sub?: string;
  accent: string;
  loading: boolean;
}) {
  return (
    <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 shrink-0 ${accent}`} />
          <span className="text-[11px] font-medium text-emerald-900 dark:text-slate-300 leading-tight">{label}</span>
        </div>
        {loading ? (
          <Skeleton className="h-6 w-16 mt-2" />
        ) : (
          <>
            <div className="text-lg font-bold text-emerald-950 dark:text-white mt-2 tabular-nums truncate">{value}</div>
            {sub ? (
              <p className="text-[11px] text-emerald-700/70 dark:text-slate-400 mt-0.5 truncate">{sub}</p>
            ) : (
              <p className="text-[11px] text-transparent mt-0.5 select-none" aria-hidden>—</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
