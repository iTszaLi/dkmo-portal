import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Trophy, Medal, Award, TrendingUp, TrendingDown, Minus, Star,
  Crown, FileText, Download, Plus, Trash2, Edit, Users, ArrowRight,
  ChevronDown,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type AmbassadorEntry = {
  rank: number;
  referrerMemberName: string;
  referrerDkmoId: string;
  referrerFrfNumber: string;
  approvedReferrals: number;
  points: number;
  awardStatus: string;
};

type AmbassadorHistory = {
  id: string;
  year: number;
  periodType: string;
  rank: number;
  referrerMemberName: string;
  referrerDkmoId: string;
  referrerFrfNumber: string;
  approvedReferrals: number;
  points: number;
  awardStatus: string;
  notes: string;
  createdBy: string;
  createdAt: string;
};

type Period = "all-time" | "yearly" | "quarterly" | "monthly";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${basePath}${path}`, { credentials: "include", ...init });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

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

const AWARD_STATUS_MAP: Record<string, { label: string; color: string }> = {
  eligible_for_momento: { label: "Eligible for Momento", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  awarded:              { label: "Awarded",               color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  pending_review:       { label: "Pending Review",        color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400" },
};

const PERIOD_LABEL: Record<Period, string> = {
  "all-time": "All-Time",
  yearly: "Yearly",
  quarterly: "Quarterly",
  monthly: "Monthly",
};

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-2xl">🥇</span>;
  if (rank === 2) return <span className="text-2xl">🥈</span>;
  if (rank === 3) return <span className="text-2xl">🥉</span>;
  return <span className="text-sm font-bold text-slate-600 dark:text-slate-400">#{rank}</span>;
}

function MovementIcon({ movement }: { movement: "up" | "down" | "same" | "new" }) {
  if (movement === "up") return <TrendingUp className="h-4 w-4 text-green-600" />;
  if (movement === "down") return <TrendingDown className="h-4 w-4 text-red-500" />;
  if (movement === "new") return <Star className="h-4 w-4 text-blue-500" />;
  return <Minus className="h-4 w-4 text-slate-400" />;
}

const EMPTY_HISTORY = {
  year: new Date().getFullYear(),
  periodType: "annual",
  rank: 1,
  referrerMemberName: "",
  referrerDkmoId: "",
  referrerFrfNumber: "",
  approvedReferrals: 0,
  points: 0,
  awardStatus: "awarded" as const,
  notes: "",
};

export default function FrfAmbassadors() {
  const today = new Date();
  const [period, setPeriod] = useState<Period>("all-time");
  const [year, setYear] = useState(today.getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(today.getMonth() / 3) + 1);
  const [month, setMonth] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`,
  );
  const [historyDialog, setHistoryDialog] = useState(false);
  const [editingHistory, setEditingHistory] = useState<AmbassadorHistory | null>(null);
  const [deleteHistoryId, setDeleteHistoryId] = useState<string | null>(null);
  const [historyForm, setHistoryForm] = useState({ ...EMPTY_HISTORY });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const queryParams = useMemo(() => {
    const p = new URLSearchParams({ period });
    if (period === "yearly") p.set("year", String(year));
    if (period === "quarterly") { p.set("year", String(year)); p.set("quarter", String(quarter)); }
    if (period === "monthly") p.set("month", month);
    return p.toString();
  }, [period, year, quarter, month]);

  const { data: allTimeRankings } = useQuery<AmbassadorEntry[]>({
    queryKey: ["frf-ambassadors", "all-time"],
    queryFn: () => apiFetch(`/api/frf/ambassadors?period=all-time`),
  });

  const { data: ambassadors = [], isLoading } = useQuery<AmbassadorEntry[]>({
    queryKey: ["frf-ambassadors", period, year, quarter, month],
    queryFn: () => apiFetch(`/api/frf/ambassadors?${queryParams}`),
  });

  const { data: history = [], isLoading: isHistoryLoading } = useQuery<AmbassadorHistory[]>({
    queryKey: ["frf-ambassador-history"],
    queryFn: () => apiFetch(`/api/frf/ambassador-history`),
  });

  const movementMap = useMemo(() => {
    if (!allTimeRankings || period === "all-time") {
      return new Map<string, "up" | "down" | "same" | "new">();
    }
    const atMap = new Map(allTimeRankings.map((a) => [a.referrerDkmoId, a.rank]));
    return new Map<string, "up" | "down" | "same" | "new">(
      ambassadors.map((a) => {
        const atRank = atMap.get(a.referrerDkmoId);
        if (!atRank) return [a.referrerDkmoId, "new"];
        if (a.rank < atRank) return [a.referrerDkmoId, "up"];
        if (a.rank > atRank) return [a.referrerDkmoId, "down"];
        return [a.referrerDkmoId, "same"];
      }),
    );
  }, [ambassadors, allTimeRankings, period]);

  const top3 = ambassadors.slice(0, 3);

  const createHistory = useMutation({
    mutationFn: (data: typeof EMPTY_HISTORY) =>
      apiFetch("/api/frf/ambassador-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["frf-ambassador-history"] });
      setHistoryDialog(false);
      toast({ title: "History record saved" });
    },
    onError: () => toast({ title: "Failed to save record", variant: "destructive" }),
  });

  const updateHistory = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof EMPTY_HISTORY> }) =>
      apiFetch(`/api/frf/ambassador-history/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["frf-ambassador-history"] });
      setHistoryDialog(false);
      setEditingHistory(null);
      toast({ title: "Record updated" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const deleteHistory = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/frf/ambassador-history/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["frf-ambassador-history"] });
      setDeleteHistoryId(null);
      toast({ title: "Record deleted" });
    },
  });

  function openAddHistory() {
    setEditingHistory(null);
    setHistoryForm({ ...EMPTY_HISTORY });
    setHistoryDialog(true);
  }

  function openEditHistory(rec: AmbassadorHistory) {
    setEditingHistory(rec);
    setHistoryForm({
      year: rec.year,
      periodType: rec.periodType,
      rank: rec.rank,
      referrerMemberName: rec.referrerMemberName,
      referrerDkmoId: rec.referrerDkmoId,
      referrerFrfNumber: rec.referrerFrfNumber,
      approvedReferrals: rec.approvedReferrals,
      points: rec.points,
      awardStatus: rec.awardStatus as "eligible_for_momento" | "awarded" | "pending_review",
      notes: rec.notes,
    });
    setHistoryDialog(true);
  }

  function handleHistorySubmit() {
    if (!historyForm.referrerMemberName.trim()) return;
    if (editingHistory) {
      updateHistory.mutate({ id: editingHistory.id, data: historyForm });
    } else {
      createHistory.mutate(historyForm);
    }
  }

  const periodLabel = useMemo(() => {
    if (period === "all-time") return "All-Time";
    if (period === "yearly") return `Year ${year}`;
    if (period === "quarterly") return `Q${quarter} ${year}`;
    if (period === "monthly") return month;
    return PERIOD_LABEL[period];
  }, [period, year, quarter, month]);

  async function exportMomentoRecommendation() {
    const doc = new jsPDF();
    const logoDataUrl = await loadImageAsBase64(`${basePath}/logo-circle.png`);
    const green: [number, number, number] = [5, 150, 105];
    const gold: [number, number, number] = [180, 140, 0];

    doc.setFillColor(...green);
    doc.rect(0, 0, 210, 32, "F");
    if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", 5, 4, 22, 22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(255, 255, 255);
    doc.text("FRF Momento Award — Recommendation List", 32, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Dakshina Karnataka Muslim Ookota — Committed to the Community", 32, 23);

    doc.setTextColor(80, 80, 80);
    doc.setFontSize(9);
    doc.text(
      `Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}   |   Period: ${periodLabel}   |   Top 3 Eligible Recruiters`,
      14, 39,
    );

    autoTable(doc, {
      startY: 44,
      head: [["Rank", "Member Name", "DKMO ID", "FRF Number", "Approved Referrals", "Points", "Award Status"]],
      body: top3.map((a) => [
        `#${a.rank}`,
        a.referrerMemberName || "—",
        a.referrerDkmoId || "—",
        a.referrerFrfNumber || "—",
        String(a.approvedReferrals),
        String(a.points),
        "Eligible for Momento",
      ]),
      theme: "grid",
      headStyles: { fillColor: gold, fontStyle: "bold" },
      bodyStyles: { fontSize: 9 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.text("Dakshina Karnataka Muslim Ookota — This document is for internal recognition purposes.", 105, finalY, { align: "center" });

    doc.save(`DKMO_Momento_Recommendation_${new Date().toISOString().split("T")[0]}.pdf`);
  }

  async function exportRecognitionReport() {
    const doc = new jsPDF({ orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();
    const logoDataUrl = await loadImageAsBase64(`${basePath}/logo-circle.png`);
    const green: [number, number, number] = [5, 150, 105];

    doc.setFillColor(...green);
    doc.rect(0, 0, pageW, 28, "F");
    if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", 6, 4, 20, 20);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("FRF Ambassador Recognition Report", pageW / 2, 12, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Period: ${periodLabel}   |   Total Ranked: ${ambassadors.length}`, pageW / 2, 21, { align: "center" });

    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.text(
      `Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}`,
      pageW / 2, 33, { align: "center" },
    );

    autoTable(doc, {
      startY: 38,
      head: [["Rank", "Movement", "Member Name", "DKMO ID", "FRF Number", "Approved Referrals", "Points", "Award Status"]],
      body: ambassadors.map((a) => {
        const mv = movementMap.get(a.referrerDkmoId) ?? "same";
        const mvLabel = mv === "up" ? "▲ Up" : mv === "down" ? "▼ Down" : mv === "new" ? "★ New" : "— Same";
        return [
          `#${a.rank}`,
          mvLabel,
          a.referrerMemberName || "—",
          a.referrerDkmoId || "—",
          a.referrerFrfNumber || "—",
          String(a.approvedReferrals),
          String(a.points),
          AWARD_STATUS_MAP[a.awardStatus]?.label ?? a.awardStatus,
        ];
      }),
      theme: "grid",
      headStyles: { fillColor: green, fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 7.5 },
    });

    doc.save(`DKMO_Ambassador_Recognition_${new Date().toISOString().split("T")[0]}.pdf`);
  }

  async function exportAwardCertificate(entry: AmbassadorEntry) {
    const doc = new jsPDF({ orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const logoDataUrl = await loadImageAsBase64(`${basePath}/logo-circle.png`);
    const green: [number, number, number] = [5, 150, 105];
    const gold: [number, number, number] = [180, 140, 0];

    // Border
    doc.setDrawColor(...gold);
    doc.setLineWidth(3);
    doc.rect(8, 8, pageW - 16, pageH - 16);
    doc.setLineWidth(1);
    doc.setDrawColor(...green);
    doc.rect(12, 12, pageW - 24, pageH - 24);

    // Logo
    if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", pageW / 2 - 18, 18, 36, 36);

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.setTextColor(...gold);
    doc.text("Certificate of Recognition", pageW / 2, 68, { align: "center" });

    doc.setFontSize(12);
    doc.setTextColor(...green);
    doc.text("Dakshina Karnataka Muslim Ookota (DKMO)", pageW / 2, 78, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text("This is to proudly certify that", pageW / 2, 94, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(30, 30, 30);
    doc.text(entry.referrerMemberName || "—", pageW / 2, 108, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(`DKMO ID: ${entry.referrerDkmoId || "—"}   |   FRF Number: ${entry.referrerFrfNumber || "—"}`, pageW / 2, 117, { align: "center" });

    doc.setFontSize(11);
    doc.text("has been recognized as an", pageW / 2, 128, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...gold);
    doc.text(`FRF Ambassador — Rank #${entry.rank}`, pageW / 2, 140, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(
      `For recruiting ${entry.approvedReferrals} approved FRF Member${entry.approvedReferrals !== 1 ? "s" : ""} · Period: ${periodLabel}`,
      pageW / 2, 150, { align: "center" },
    );

    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(130, 130, 130);
    doc.text(
      `Issued on: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}`,
      pageW / 2, 160, { align: "center" },
    );

    doc.save(`DKMO_Certificate_${entry.referrerDkmoId || "Ambassador"}_${new Date().toISOString().split("T")[0]}.pdf`);
  }

  const topContributorCardColors = [
    "from-yellow-50 to-amber-50 border-yellow-200 dark:from-yellow-950/30 dark:to-amber-950/20 dark:border-yellow-800/40",
    "from-slate-50 to-zinc-50 border-slate-200 dark:from-slate-800/60 dark:to-zinc-800/40 dark:border-slate-700",
    "from-orange-50 to-amber-50 border-orange-200 dark:from-orange-950/30 dark:to-amber-950/20 dark:border-orange-800/40",
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-green-950 dark:text-green-100 flex items-center gap-3">
            <Trophy className="h-8 w-8 text-yellow-500" />
            FRF Ambassadors
          </h1>
          <p className="text-green-700/80 dark:text-slate-400 mt-1">
            Rankings based exclusively on approved FRF Membership referrals
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportMomentoRecommendation}
            className="border-yellow-300 text-yellow-800 hover:bg-yellow-50 dark:border-yellow-700 dark:text-yellow-300 dark:hover:bg-yellow-950/30"
            disabled={top3.length === 0}
          >
            <Award className="h-4 w-4 mr-1.5" /> Momento List PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportRecognitionReport}
            className="border-green-300 text-green-800 hover:bg-green-50 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-950/30"
            disabled={ambassadors.length === 0}
          >
            <FileText className="h-4 w-4 mr-1.5" /> Recognition Report
          </Button>
        </div>
      </div>

      {/* Period Selector */}
      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-green-900 dark:text-slate-300">Period:</span>
            <div className="flex flex-wrap gap-2">
              {(["all-time", "yearly", "quarterly", "monthly"] as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    period === p
                      ? "bg-green-800 text-white dark:bg-green-700"
                      : "bg-green-50 text-green-800 hover:bg-green-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  {PERIOD_LABEL[p]}
                </button>
              ))}
            </div>

            {(period === "yearly" || period === "quarterly") && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Year:</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setYear((y) => y - 1)}
                    className="w-6 h-6 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm flex items-center justify-center">‹</button>
                  <span className="text-sm font-semibold text-green-900 dark:text-slate-200 w-12 text-center">{year}</span>
                  <button type="button" onClick={() => setYear((y) => y + 1)}
                    className="w-6 h-6 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm flex items-center justify-center">›</button>
                </div>
              </div>
            )}

            {period === "quarterly" && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500">Quarter:</span>
                {[1, 2, 3, 4].map((q) => (
                  <button key={q} type="button" onClick={() => setQuarter(q)}
                    className={`w-8 h-7 rounded text-xs font-semibold transition-colors ${
                      quarter === q ? "bg-green-800 text-white dark:bg-green-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                    }`}>Q{q}</button>
                ))}
              </div>
            )}

            {period === "monthly" && (
              <Input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-40 h-8 text-sm border-green-200 dark:border-slate-700 dark:bg-slate-800"
              />
            )}

            <span className="ml-auto text-xs text-slate-500 dark:text-slate-500 italic">{periodLabel}</span>
          </div>
        </CardContent>
      </Card>

      {/* Top 3 Podium */}
      <div>
        <h2 className="text-lg font-semibold text-green-950 dark:text-green-100 mb-3 flex items-center gap-2">
          <Crown className="h-5 w-5 text-yellow-500" /> Top Recruiters
        </h2>
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
          </div>
        ) : top3.length === 0 ? (
          <Card className="rounded-2xl border-dashed border-green-200 dark:border-slate-700">
            <CardContent className="py-12 text-center">
              <Trophy className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400 font-medium">No referral data for this period</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Referrals are tracked when FRF Membership applications include a referrer DKMO ID
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {top3.map((entry, i) => (
              <Card key={entry.referrerDkmoId}
                className={`rounded-2xl shadow-sm border bg-gradient-to-br ${topContributorCardColors[i] ?? ""}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <RankBadge rank={entry.rank} />
                    <div className="flex items-center gap-1.5">
                      {period !== "all-time" && (
                        <MovementIcon movement={movementMap.get(entry.referrerDkmoId) ?? "same"} />
                      )}
                      <Badge className={`text-[10px] ${AWARD_STATUS_MAP[entry.awardStatus]?.color ?? ""}`}>
                        {AWARD_STATUS_MAP[entry.awardStatus]?.label ?? entry.awardStatus}
                      </Badge>
                    </div>
                  </div>
                  <p className="font-bold text-green-950 dark:text-white text-base leading-tight">
                    {entry.referrerMemberName || "—"}
                  </p>
                  <p className="text-xs text-green-700/70 dark:text-slate-400 mt-0.5">{entry.referrerDkmoId}</p>
                  {entry.referrerFrfNumber && (
                    <p className="text-xs text-slate-500 dark:text-slate-500">{entry.referrerFrfNumber}</p>
                  )}
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-extrabold text-green-800 dark:text-green-300">
                        {entry.approvedReferrals}
                      </p>
                      <p className="text-xs text-green-700/70 dark:text-slate-400">Approved Referrals</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-green-700 dark:text-green-400">{entry.points}</p>
                      <p className="text-xs text-green-700/70 dark:text-slate-400">Points</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-3 text-xs border-green-300 dark:border-slate-600 hover:bg-green-50 dark:hover:bg-slate-800"
                    onClick={() => exportAwardCertificate(entry)}
                  >
                    <Download className="h-3 w-3 mr-1.5" /> Award Certificate
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Full Leaderboard Table */}
      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
            <Users className="h-5 w-5 text-green-600 dark:text-green-400" />
            Full Leaderboard — {periodLabel}
          </CardTitle>
          <CardDescription className="dark:text-slate-400">
            All recruiters ranked by approved FRF membership referrals
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : ambassadors.length === 0 ? (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500">
              No ambassador data for this period
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-green-100 dark:border-slate-800">
                  <TableHead className="w-16">Rank</TableHead>
                  {period !== "all-time" && <TableHead className="w-16">▲▼</TableHead>}
                  <TableHead>Member Name</TableHead>
                  <TableHead>DKMO ID</TableHead>
                  <TableHead className="hidden md:table-cell">FRF Number</TableHead>
                  <TableHead className="text-right">Referrals</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Points</TableHead>
                  <TableHead>Award Status</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ambassadors.map((entry) => {
                  const movement = movementMap.get(entry.referrerDkmoId) ?? "same";
                  return (
                    <TableRow key={entry.referrerDkmoId}
                      className={`border-green-50 dark:border-slate-800/50 ${entry.rank <= 3 ? "bg-yellow-50/30 dark:bg-yellow-950/10" : ""}`}>
                      <TableCell className="font-bold">
                        <RankBadge rank={entry.rank} />
                      </TableCell>
                      {period !== "all-time" && (
                        <TableCell>
                          <MovementIcon movement={movement} />
                        </TableCell>
                      )}
                      <TableCell className="font-medium text-green-950 dark:text-slate-200">
                        {entry.referrerMemberName || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                        {entry.referrerDkmoId || "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-slate-500 dark:text-slate-500">
                        {entry.referrerFrfNumber || "—"}
                      </TableCell>
                      <TableCell className="text-right font-bold text-green-800 dark:text-green-300">
                        {entry.approvedReferrals}
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell font-semibold text-green-700 dark:text-green-400">
                        {entry.points}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${AWARD_STATUS_MAP[entry.awardStatus]?.color ?? ""}`}>
                          {AWARD_STATUS_MAP[entry.awardStatus]?.label ?? entry.awardStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => exportAwardCertificate(entry)}>
                          <Download className="h-3.5 w-3.5 text-slate-400" />
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

      {/* Historical Recognition Records */}
      <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base text-green-950 dark:text-green-100 flex items-center gap-2">
                <Medal className="h-5 w-5 text-yellow-500" />
                Historical Recognition Records
              </CardTitle>
              <CardDescription className="dark:text-slate-400">
                Preserved award history — previous winners and annual records
              </CardDescription>
            </div>
            <Button size="sm" onClick={openAddHistory}
              className="bg-green-800 hover:bg-green-900 dark:bg-green-700 dark:hover:bg-green-600 text-white">
              <Plus className="h-4 w-4 mr-1.5" /> Add Record
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isHistoryLoading ? (
            <div className="p-6 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : history.length === 0 ? (
            <div className="py-10 text-center text-slate-400 dark:text-slate-500 text-sm">
              No historical records yet. Add past award winners to preserve their recognition.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-green-100 dark:border-slate-800">
                  <TableHead>Year</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead>Member Name</TableHead>
                  <TableHead>DKMO ID</TableHead>
                  <TableHead className="text-right">Referrals</TableHead>
                  <TableHead>Award Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Notes</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((rec) => (
                  <TableRow key={rec.id} className="border-green-50 dark:border-slate-800/50">
                    <TableCell className="font-semibold text-green-900 dark:text-slate-200">{rec.year}</TableCell>
                    <TableCell className="text-sm capitalize">{rec.periodType}</TableCell>
                    <TableCell><RankBadge rank={rec.rank} /></TableCell>
                    <TableCell className="font-medium">{rec.referrerMemberName}</TableCell>
                    <TableCell className="text-sm text-slate-500">{rec.referrerDkmoId || "—"}</TableCell>
                    <TableCell className="text-right font-bold text-green-700 dark:text-green-400">{rec.approvedReferrals}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${AWARD_STATUS_MAP[rec.awardStatus]?.color ?? ""}`}>
                        {AWARD_STATUS_MAP[rec.awardStatus]?.label ?? rec.awardStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-slate-400 max-w-[120px] truncate">{rec.notes || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditHistory(rec)}>
                          <Edit className="h-3.5 w-3.5 text-slate-400" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteHistoryId(rec.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit History Dialog */}
      <Dialog open={historyDialog} onOpenChange={setHistoryDialog}>
        <DialogContent className="dark:bg-slate-900 dark:border-slate-800 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-green-950 dark:text-green-100">
              {editingHistory ? "Edit Historical Record" : "Add Historical Record"}
            </DialogTitle>
            <DialogDescription className="dark:text-slate-400">
              Preserve past award winners in the recognition history.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-green-900 dark:text-green-300 text-sm">Year *</Label>
              <Input type="number" value={historyForm.year}
                onChange={(e) => setHistoryForm((f) => ({ ...f, year: Number(e.target.value) }))}
                className="border-green-200 dark:border-slate-700 dark:bg-slate-800" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-green-900 dark:text-green-300 text-sm">Period Type</Label>
              <Select value={historyForm.periodType}
                onValueChange={(v) => setHistoryForm((f) => ({ ...f, periodType: v }))}>
                <SelectTrigger className="border-green-200 dark:border-slate-700 dark:bg-slate-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["annual", "q1", "q2", "q3", "q4", "monthly"].map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-green-900 dark:text-green-300 text-sm">Rank *</Label>
              <Input type="number" min="1" value={historyForm.rank}
                onChange={(e) => setHistoryForm((f) => ({ ...f, rank: Number(e.target.value) }))}
                className="border-green-200 dark:border-slate-700 dark:bg-slate-800" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-green-900 dark:text-green-300 text-sm">Award Status</Label>
              <Select value={historyForm.awardStatus}
                onValueChange={(v) => setHistoryForm((f) => ({ ...f, awardStatus: v as typeof EMPTY_HISTORY["awardStatus"] }))}>
                <SelectTrigger className="border-green-200 dark:border-slate-700 dark:bg-slate-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="awarded">Awarded</SelectItem>
                  <SelectItem value="eligible_for_momento">Eligible for Momento</SelectItem>
                  <SelectItem value="pending_review">Pending Review</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-green-900 dark:text-green-300 text-sm">Member Name *</Label>
              <Input value={historyForm.referrerMemberName}
                onChange={(e) => setHistoryForm((f) => ({ ...f, referrerMemberName: e.target.value }))}
                className="border-green-200 dark:border-slate-700 dark:bg-slate-800" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-green-900 dark:text-green-300 text-sm">DKMO ID</Label>
              <Input value={historyForm.referrerDkmoId}
                onChange={(e) => setHistoryForm((f) => ({ ...f, referrerDkmoId: e.target.value }))}
                className="border-green-200 dark:border-slate-700 dark:bg-slate-800" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-green-900 dark:text-green-300 text-sm">FRF Number</Label>
              <Input value={historyForm.referrerFrfNumber}
                onChange={(e) => setHistoryForm((f) => ({ ...f, referrerFrfNumber: e.target.value }))}
                className="border-green-200 dark:border-slate-700 dark:bg-slate-800" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-green-900 dark:text-green-300 text-sm">Approved Referrals</Label>
              <Input type="number" min="0" value={historyForm.approvedReferrals}
                onChange={(e) => setHistoryForm((f) => ({ ...f, approvedReferrals: Number(e.target.value), points: Number(e.target.value) }))}
                className="border-green-200 dark:border-slate-700 dark:bg-slate-800" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-green-900 dark:text-green-300 text-sm">Points</Label>
              <Input type="number" min="0" value={historyForm.points}
                onChange={(e) => setHistoryForm((f) => ({ ...f, points: Number(e.target.value) }))}
                className="border-green-200 dark:border-slate-700 dark:bg-slate-800" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-green-900 dark:text-green-300 text-sm">Notes</Label>
              <Textarea value={historyForm.notes} rows={2}
                onChange={(e) => setHistoryForm((f) => ({ ...f, notes: e.target.value }))}
                className="border-green-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryDialog(false)}
              className="border-green-200 dark:border-slate-700">Cancel</Button>
            <Button
              onClick={handleHistorySubmit}
              disabled={!historyForm.referrerMemberName.trim() || createHistory.isPending || updateHistory.isPending}
              className="bg-green-800 hover:bg-green-900 dark:bg-green-700 text-white"
            >
              {editingHistory ? "Save Changes" : "Add Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteHistoryId} onOpenChange={() => setDeleteHistoryId(null)}>
        <AlertDialogContent className="dark:bg-slate-900 dark:border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>This historical record will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteHistoryId && deleteHistory.mutate(deleteHistoryId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
