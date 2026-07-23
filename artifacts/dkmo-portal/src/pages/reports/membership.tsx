import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useListMembers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, Search, FileDown, FileSpreadsheet, Printer, Users, ShieldCheck, MapPin } from "lucide-react";
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

export default function MembershipReport() {
  const [search, setSearch] = useState("");
  const [designation, setDesignation] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data: members, isLoading } = useListMembers();

  const designations = useMemo(() => {
    const set = new Set<string>();
    for (const m of members ?? []) if (m.designation) set.add(m.designation);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [members]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (members ?? []).filter((m) => {
      if (q) {
        const hay = [m.fullName, m.membershipId, m.mobileNumber, m.city, m.designation, m.refMemberName]
          .map((v) => (v ?? "").toLowerCase())
          .join(" ");
        if (!hay.includes(q)) return false;
      }
      if (designation !== "all" && (m.designation ?? "") !== designation) return false;
      if (fromDate || toDate) {
        const d = (m.createdAt ?? "").slice(0, 10);
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
      }
      return true;
    });
  }, [members, search, designation, fromDate, toDate]);

  const summary = useMemo(() => {
    const cities = new Set<string>();
    let committee = 0;
    for (const m of filtered) {
      if (m.city) cities.add(m.city.trim().toLowerCase());
      if (m.isExecutiveCommittee || m.isCoreCommittee) committee += 1;
    }
    return { total: filtered.length, committee, cities: cities.size };
  }, [filtered]);

  const hasFilters = search.trim() !== "" || designation !== "all" || fromDate !== "" || toDate !== "";

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
    doc.text("Membership Report", pageW / 2, 19, { align: "center" });

    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.text(
      `Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}   |   Members: ${summary.total}   |   Committee: ${summary.committee}   |   Cities: ${summary.cities}`,
      pageW / 2, 34, { align: "center" },
    );

    autoTable(doc, {
      startY: 40,
      head: [["#", "Member", "Designation", "Mobile", "Country", "Reference Member", "Joined"]],
      body: filtered.map((m, i) => [
        String(i + 1),
        `${m.fullName}\n${m.membershipId} · ${m.city}`,
        m.designation || "—",
        m.mobileNumber || "—",
        m.country || "—",
        m.refMemberName || "—",
        formatDate(m.createdAt),
      ]),
      theme: "grid",
      headStyles: { fillColor: green, fontStyle: "bold", fontSize: 8, halign: "center" },
      bodyStyles: { fontSize: 7.5 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(7.5);
    doc.setTextColor(130, 130, 130);
    doc.text("Dakshina Karnataka Muslim Ookota — Committed to the Community", pageW / 2, finalY, { align: "center" });
    doc.text("Confidential — For internal use only", pageW / 2, finalY + 5, { align: "center" });

    doc.save(`DKMO_Membership_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const exportExcel = async () => {
    if (filtered.length === 0) return;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "DKMO Portal";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Membership");

    sheet.mergeCells("A1:H1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "Dakshina Karnataka Muslim Ookota (DKMO)";
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: "center" };

    sheet.mergeCells("A2:H2");
    const subtitleCell = sheet.getCell("A2");
    subtitleCell.value = "Membership Report";
    subtitleCell.font = { bold: true, size: 11, color: { argb: "FF059669" } };
    subtitleCell.alignment = { horizontal: "center" };

    sheet.mergeCells("A3:H3");
    const metaCell = sheet.getCell("A3");
    metaCell.value = `Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}`;
    metaCell.font = { size: 9, color: { argb: "FF6B7280" } };
    metaCell.alignment = { horizontal: "center" };

    sheet.addRow([]);

    const headerRow = sheet.addRow([
      "#", "Full Name", "Member ID", "City", "Designation", "Mobile", "Country", "Reference Member", "Joined Date",
    ]);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } };
      cell.alignment = { horizontal: "center" };
      cell.border = {
        top: { style: "thin" }, bottom: { style: "thin" },
        left: { style: "thin" }, right: { style: "thin" },
      };
    });

    filtered.forEach((m, i) => {
      const row = sheet.addRow([
        i + 1,
        m.fullName,
        m.membershipId,
        m.city,
        m.designation || "—",
        m.mobileNumber || "—",
        m.country || "—",
        m.refMemberName || "—",
        formatDate(m.createdAt),
      ]);
      row.eachCell((cell) => {
        cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
      });
    });

    sheet.columns = [
      { width: 5 }, { width: 26 }, { width: 14 }, { width: 16 }, { width: 24 },
      { width: 16 }, { width: 14 }, { width: 24 }, { width: 16 },
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DKMO_Membership_${new Date().toISOString().split("T")[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <Link href="/reports" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline" data-testid="link-all-reports">
          <ArrowLeft className="h-3.5 w-3.5" /> All Reports
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-950 dark:text-emerald-100">Membership Report</h1>
          <p className="text-emerald-700/80 dark:text-slate-400">Full member directory — designations, locations, references, and join dates.</p>
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
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500 dark:text-slate-500" />
            <Input
              placeholder="Search name, ID, mobile, city, reference…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 border-emerald-100 dark:bg-slate-800 dark:border-slate-700"
              data-testid="input-search-membership"
            />
          </div>
          <Select value={designation} onValueChange={setDesignation}>
            <SelectTrigger className="w-[200px] dark:bg-slate-800 dark:border-slate-700" data-testid="select-designation">
              <SelectValue placeholder="Designation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All designations</SelectItem>
              {designations.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <div>
              <label className="text-[11px] text-emerald-700/70 dark:text-slate-500 block mb-1">From</label>
              <input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className="w-[150px] h-9 rounded-md border border-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 px-3 text-sm" data-testid="input-date-from" />
            </div>
            <div>
              <label className="text-[11px] text-emerald-700/70 dark:text-slate-500 block mb-1">To</label>
              <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className="w-[150px] h-9 rounded-md border border-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 px-3 text-sm" data-testid="input-date-to" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-emerald-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
            <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Members
          </CardTitle>
          <CardDescription className="dark:text-slate-400">
            {hasFilters ? `Showing ${filtered.length} filtered member(s).` : "All registered members."}
          </CardDescription>

          {!isLoading && (
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300">
                <Users className="h-3.5 w-3.5" /> Members: {summary.total}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">
                <ShieldCheck className="h-3.5 w-3.5" /> Committee: {summary.committee}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-slate-300 border border-emerald-200 dark:border-slate-700">
                <MapPin className="h-3.5 w-3.5" /> Cities: {summary.cities}
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-emerald-100 dark:border-slate-800 overflow-hidden">
            <Table>
              <TableHeader className="bg-emerald-50/50 dark:bg-slate-800/60">
                <TableRow className="dark:border-slate-700">
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 w-10">#</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Member</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Designation</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Mobile</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Country</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Reference Member</TableHead>
                  <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="dark:border-slate-800">
                      <TableCell><Skeleton className="h-4 w-6" /></TableCell>
                      <TableCell><Skeleton className="h-10 w-44" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-emerald-600 dark:text-slate-500">
                      {hasFilters ? "No members match the current filters." : "No members yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((m, i) => (
                    <TableRow key={m.id} className="dark:border-slate-800 transition-colors hover:bg-emerald-50/40 dark:hover:bg-slate-800/40" data-testid={`row-member-${i}`}>
                      <TableCell className="text-emerald-500 dark:text-slate-500 text-sm">{i + 1}</TableCell>
                      <TableCell>
                        <div className="font-medium text-emerald-950 dark:text-slate-200">{m.fullName}</div>
                        <div className="text-xs text-emerald-600 dark:text-slate-500">{m.membershipId} · {m.city}</div>
                      </TableCell>
                      <TableCell className="text-sm text-emerald-700 dark:text-slate-400">{m.designation || "—"}</TableCell>
                      <TableCell className="text-sm text-emerald-700 dark:text-slate-400">{m.mobileNumber || "—"}</TableCell>
                      <TableCell className="text-sm text-emerald-700 dark:text-slate-400">{m.country || "—"}</TableCell>
                      <TableCell className="text-sm text-emerald-700 dark:text-slate-400">{m.refMemberName || "—"}</TableCell>
                      <TableCell className="text-sm text-emerald-700 dark:text-slate-400">{formatDate(m.createdAt)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
