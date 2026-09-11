import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload, FileSpreadsheet, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle,
  Users, RotateCcw, Download, History, Loader2, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Target fields & auto-detection ───────────────────────────────────────────
const TARGET_FIELDS = [
  { key: "legacyMemberId", label: "Legacy ID", patterns: [/^(id|sl|sino|si no|member ?id|id ?no)(\b|[_-])/i, /^legacy[_ -]?(?:member[_ -]?)?id$/i] },
  { key: "oldApplicationNumber", label: "Old Application Number", patterns: [/old[_ ]+app/i] },
  { key: "applicationNumber", label: "Historical Application No (raw only)", patterns: [/^app(?:lication)?[_ ]*(?:no|num|number)?\.?$/i] },
  { key: "ppName", label: "Passport / Preferred Name", patterns: [/^pp[_ ]?name|passport[_ ]?name|preferred[_ ]?name/i] },
  { key: "firstName", label: "First Name", patterns: [/^first[_ ]?name/i, /^fname/i] },
  { key: "lastName", label: "Last Name", patterns: [/^last[_ ]?name/i, /^lname/i, /^surname/i] },
  { key: "fullName", label: "Full Name", patterns: [/^(full[_ -]?)?name$/i, /^member[_ ]?name/i, /^legacy[_ ]?name$/i] },
  { key: "whatsappNumber", label: "WhatsApp Number", patterns: [/whats?[_ ]?app/i] },
  { key: "homeContactNumber", label: "Home Contact Number", patterns: [/mobile[_ ]*home|home[_ ]*(mobile|contact|phone)/i] },
  { key: "telephone", label: "Telephone", patterns: [/telephone/i] },
  { key: "email", label: "Email", patterns: [/e-?mail/i] },
  { key: "mobileNumber", label: "Mobile Number", patterns: [/mobile|phone|contact/i] },
  { key: "iqamaNumber", label: "Iqama Number", patterns: [/iqama|resident/i] },
  { key: "passportNumber", label: "Passport Number", patterns: [/passport/i] },
  { key: "jamaath", label: "Jamaath", patterns: [/jama|mahal/i] },
  { key: "nativePlace", label: "Home Place (Native)", patterns: [/home ?place|place ?home|native|place$/i] },
  { key: "city", label: "Local Place (Current)", patterns: [/local|city|location/i] },
  { key: "dateOfBirth", label: "Date of Birth", patterns: [/birth|dob/i] },
  { key: "membershipDate", label: "Membership Date (Joining)", patterns: [/join/i] },
  { key: "legacyEntryDate", label: "Record Created Date (Entry)", patterns: [/entry/i] },
  { key: "company", label: "Company", patterns: [/^company/i, /employer/i] },
  { key: "designation", label: "Occupation / Job Title", patterns: [/job[_ ]?title|occupation|^post$/i] },
  { key: "maritalStatus", label: "Marital Status", patterns: [/marital/i] },
  { key: "familyStatus", label: "Family Status", patterns: [/family ?status/i] },
  { key: "dependents", label: "Dependents", patterns: [/dependent/i] },
  { key: "bloodGroup", label: "Blood Group", patterns: [/blood/i] },
  { key: "district", label: "District", patterns: [/^dist(rict)?\b/i] },
  { key: "legacyMemberStatus", label: "Membership Status", patterns: [/member[_ ]?status|^status$/i] },
  { key: "referrerLegacyId", label: "Referrer Legacy ID", patterns: [/referrer.*legacy|legacy.*referrer/i] },
  { key: "migrationMatchStatus", label: "Legacy / Match Status", patterns: [/member.*dataset.*status|migration.*match.*status/i] },
  { key: "migrationReferralStatus", label: "Referral Migration Status", patterns: [/^referral[_ ]?status$|migration.*referral.*status/i] },
  { key: "plannedMemberDestination", label: "Planned Member Destination", patterns: [/planned.*member.*destination/i] },
  { key: "membershipPaymentRecords", label: "Historical Membership Payment Records", patterns: [/membership.*payment.*records/i] },
  { key: "membershipAmountPaid", label: "Historical Membership Amount Paid", patterns: [/membership.*amount.*paid/i] },
  { key: "frfRecords", label: "Historical FRF Records", patterns: [/^frf[_ ]?records$/i] },
  { key: "frfAmountRecorded", label: "Historical FRF Amount", patterns: [/frf.*amount.*recorded/i] },
  { key: "referredBy", label: "Referred By / Sponsor", patterns: [/member[_ ]?under|referred|sponsor/i] },
  { key: "memberGroup", label: "Legacy Group (Sponsor / Reference)", patterns: [/^group/i] },
  { key: "availContribution", label: "FRF Contribution Eligible", patterns: [/avail|contribution/i] },
  { key: "notes", label: "Remarks / Notes", patterns: [/remarks?|^notes?$/i] },
] as const;
type TargetKey = (typeof TARGET_FIELDS)[number]["key"] | "ignore";

function autoDetect(header: string): TargetKey {
  const h = header.trim();
  if (!h || /^name ?all/i.test(h)) return "ignore";
  for (const f of TARGET_FIELDS) if (f.patterns.some((p) => p.test(h))) return f.key;
  return "ignore";
}

// ── Content-based mapping validation ─────────────────────────────────────────
// Checks whether the actual values in a column look like the field they are
// mapped to (e.g. currency amounts mapped to Mobile Number are rejected).
const DATE_RE = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[-/. ][A-Za-z]{3,}[-/. ]\d{2,4})$/;

const CONTENT_VALIDATORS: Partial<Record<Exclude<TargetKey, "ignore">, { test: (v: string) => boolean; reason: string }>> = {
  dateOfBirth: {
    test: (v) => { if (!DATE_RE.test(v.trim())) return false; const y = extractYear(v); return y !== null && y >= 1900 && y <= new Date().getFullYear() - 5; },
    reason: "values do not look like dates of birth",
  },
  membershipDate: { test: (v) => DATE_RE.test(v.trim()), reason: "values do not look like dates" },
  legacyEntryDate: { test: (v) => DATE_RE.test(v.trim()), reason: "values do not look like dates" },
  mobileNumber: { test: looksLikePhone, reason: "values are not phone numbers (they look like amounts or codes)" },
  whatsappNumber: { test: looksLikePhone, reason: "values are not phone numbers" },
  homeContactNumber: { test: looksLikePhone, reason: "values are not phone numbers" },
  telephone: { test: looksLikePhone, reason: "values are not phone numbers" },
  passportNumber: { test: (v) => /^[A-Za-z0-9]{6,12}$/.test(v.trim()) && !/^\d{1,5}$/.test(v.trim()), reason: "values do not match passport number formats" },
  iqamaNumber: { test: (v) => /^\d{8,12}$/.test(v.replace(/\s/g, "")), reason: "values do not look like Iqama numbers" },
  email: { test: (v) => v.includes("@"), reason: "values are not email addresses" },
  bloodGroup: { test: (v) => /^(a|b|ab|o)\s?[+-]?(ve)?$/i.test(v.trim()), reason: "values are not blood groups" },
  dependents: { test: (v) => /^\d{1,2}$/.test(v.trim()), reason: "values are not dependent counts" },
  fullName: { test: looksLikeName, reason: "values look like payment/description text, not names" },
  firstName: { test: looksLikeName, reason: "values do not look like names" },
  lastName: { test: looksLikeName, reason: "values do not look like names" },
  ppName: { test: looksLikeName, reason: "values do not look like names" },
  referredBy: { test: looksLikeName, reason: "values do not look like names" },
  legacyMemberId: { test: (v) => /^[A-Za-z0-9/_-]{1,20}$/.test(v.trim()), reason: "values do not match legacy ID formats" },
};

function extractYear(v: string): number | null {
  const m4 = v.match(/\b(19|20)\d{2}\b/);
  if (m4) return Number(m4[0]);
  const m2 = v.match(/[-/.](\d{2})\s*$/);
  if (m2) { const y = Number(m2[1]); return y <= 30 ? 2000 + y : 1900 + y; }
  return null;
}

function looksLikePhone(v: string): boolean {
  const digits = v.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 15 && !/[.]/.test(v.trim());
}

function looksLikeName(v: string): boolean {
  const t = v.trim();
  if (!t) return false;
  if (/\d/.test(t) && (t.match(/\d/g)!.length / t.length) > 0.2) return false;
  if (/fee|payment|invoice|receipt|bill|amount|frf|membership fee/i.test(t)) return false;
  return /^[\p{L}\p{M} .,'()-]+$/u.test(t);
}

interface ColumnCheck { valid: boolean; reason: string }

/** Validate a mapped column against up to 50 sample values (≥60% must match). */
function checkColumn(target: TargetKey, samples: string[]): ColumnCheck {
  if (target === "ignore") return { valid: true, reason: "" };
  const validator = CONTENT_VALIDATORS[target];
  if (!validator) return { valid: true, reason: "" };
  const values = samples.map((s) => (s ?? "").trim()).filter(Boolean).slice(0, 50);
  if (values.length === 0) return { valid: true, reason: "" };
  const ok = values.filter(validator.test).length;
  return ok / values.length >= 0.6
    ? { valid: true, reason: "" }
    : { valid: false, reason: validator.reason };
}

// ── Saved mapping ("Legacy Access Members Mapping") ─────────────────────────
const MAPPING_STORE_KEY = "dkmo-legacy-members-mapping";

function headerSignature(headers: string[]): string {
  return headers.map((h) => h.trim().toLowerCase()).join("|");
}

function loadSavedMapping(headers: string[]): TargetKey[] | null {
  try {
    const raw = localStorage.getItem(MAPPING_STORE_KEY);
    if (!raw) return null;
    const store = JSON.parse(raw) as Record<string, string[]>;
    const m = store[headerSignature(headers)];
    if (!Array.isArray(m) || m.length !== headers.length) return null;
    const validKeys = new Set<string>(["ignore", ...TARGET_FIELDS.map((f) => f.key)]);
    if (!m.every((k) => validKeys.has(k))) return null;
    return m as TargetKey[];
  } catch { return null; }
}

function saveMapping(headers: string[], mapping: TargetKey[]) {
  try {
    const raw = localStorage.getItem(MAPPING_STORE_KEY);
    const store = (raw ? JSON.parse(raw) : {}) as Record<string, string[]>;
    store[headerSignature(headers)] = mapping;
    localStorage.setItem(MAPPING_STORE_KEY, JSON.stringify(store));
  } catch { /* non-fatal */ }
}

// ── File-type detection (members vs payments vs receipts vs FRF) ────────────
type DetectedType = "members" | "payments" | "receipts" | "frf" | "unknown";

const TYPE_SIGNATURES: Record<Exclude<DetectedType, "unknown">, Array<{ pattern: RegExp; weight: number; label: string }>> = {
  members: [
    { pattern: /^(full ?)?name$|member ?name|first ?name|last ?name/i, weight: 3, label: "Member Name" },
    { pattern: /mobile|phone|contact|whats ?app/i, weight: 2, label: "Mobile Number" },
    { pattern: /iqama/i, weight: 2, label: "Iqama Number" },
    { pattern: /passport/i, weight: 2, label: "Passport Number" },
    { pattern: /jama|mahal/i, weight: 2, label: "Jamaath" },
    { pattern: /birth|dob/i, weight: 1, label: "Date of Birth" },
    { pattern: /native|home ?place/i, weight: 1, label: "Native Place" },
    { pattern: /^group/i, weight: 1, label: "Group / Sponsor" },
  ],
  payments: [
    { pattern: /^amount|amt\b/i, weight: 3, label: "Amount" },
    { pattern: /bill[_ ]?no|bill ?num/i, weight: 3, label: "Bill Number" },
    { pattern: /entry ?date|payment ?date|paid ?date/i, weight: 2, label: "Payment Date" },
    { pattern: /^details?$/i, weight: 2, label: "Details" },
    { pattern: /remarks?/i, weight: 1, label: "Remarks" },
    { pattern: /membership ?fee|frf ?fee/i, weight: 2, label: "Fee column" },
    { pattern: /^date$/i, weight: 1, label: "Date" },
  ],
  receipts: [
    { pattern: /receipt ?(no|num|number)/i, weight: 3, label: "Receipt Number" },
    { pattern: /^amount|amt\b/i, weight: 2, label: "Amount" },
    { pattern: /received ?(from|by)/i, weight: 2, label: "Received From/By" },
  ],
  frf: [
    { pattern: /frf/i, weight: 3, label: "FRF" },
    { pattern: /contribution/i, weight: 3, label: "Contribution" },
    { pattern: /claim/i, weight: 2, label: "Claim" },
  ],
};

type Detection = {
  type: DetectedType;
  confidence: number; // 0-100
  matched: string[];  // human labels of matched signature columns
  memberMatched: string[];
};

function detectFileType(headers: string[]): Detection {
  const scores: Record<string, { score: number; max: number; matched: string[] }> = {};
  for (const [type, sigs] of Object.entries(TYPE_SIGNATURES)) {
    let score = 0; const matched: string[] = [];
    const max = sigs.reduce((s, x) => s + x.weight, 0);
    for (const sig of sigs) {
      if (headers.some((h) => sig.pattern.test(h.trim()))) { score += sig.weight; matched.push(sig.label); }
    }
    scores[type] = { score, max, matched };
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
  const [topType, top] = ranked[0]!;
  const second = ranked[1]![1];
  if (top.score === 0) return { type: "unknown", confidence: 0, matched: [], memberMatched: scores.members!.matched };
  // Confidence: how much of the signature matched, boosted by the margin over the runner-up.
  const coverage = top.score / top.max;
  const margin = top.score > 0 ? (top.score - second.score) / top.score : 0;
  const confidence = Math.round(Math.min(0.55 * coverage + 0.45 * margin, 1) * 100);
  return { type: topType as DetectedType, confidence, matched: top.matched, memberMatched: scores.members!.matched };
}

const TYPE_LABELS: Record<DetectedType, string> = {
  members: "Members",
  payments: "Payments",
  receipts: "Receipts",
  frf: "FRF Contributions",
  unknown: "Unknown",
};

// ── File parsing (TXT / CSV / XLSX with auto delimiter) ─────────────────────
function detectDelimiter(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const counts: Array<[string, number]> = [
    ["\t", (line.match(/\t/g) ?? []).length],
    [",", (line.match(/,/g) ?? []).length],
    [";", (line.match(/;/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : "\t";
}

function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let cell = "", row: string[] = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

function decodeText(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  // Detect UTF-16 (Excel "Unicode Text" export) via BOM or embedded NUL bytes
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(buf);
  let nuls = 0;
  const sample = Math.min(bytes.length, 2000);
  for (let i = 0; i < sample; i++) if (bytes[i] === 0) nuls++;
  if (nuls > sample / 10) return new TextDecoder("utf-16le").decode(buf);
  return new TextDecoder("utf-8").decode(buf);
}

async function parseFile(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const buf = await file.arrayBuffer();
    const head = new Uint8Array(buf.slice(0, 4));
    if (head[0] === 0xd0 && head[1] === 0xcf) {
      throw new Error("Legacy .xls files are not supported. Save the workbook as .xlsx and try again.");
    }
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const rows: string[][] = [];
    ws.eachRow((r) => {
      const vals: string[] = [];
      r.eachCell({ includeEmpty: true }, (cell) => {
        const v = cell.value;
        if (v == null) vals.push("");
        else if (v instanceof Date) vals.push(v.toISOString().slice(0, 10));
        else if (typeof v === "object" && "text" in v) vals.push(String((v as { text: unknown }).text));
        else if (typeof v === "object" && "result" in v) vals.push(String((v as { result: unknown }).result ?? ""));
        else vals.push(String(v));
      });
      if (vals.some((x) => x.trim())) rows.push(vals);
    });
    return rows;
  }
  const text = decodeText(await file.arrayBuffer());
  return parseDelimited(text, detectDelimiter(text));
}

// ── API types ─────────────────────────────────────────────────────────────────
interface AnalyzedRow {
  rowNumber: number;
  status: "valid" | "invalid" | "duplicate" | "blank";
  cleaned: Record<string, string | number>;
  errors: string[];
  warnings: string[];
  transforms: string[];
  duplicate: { memberId: string; membershipId: string; memberName: string; reasons: string[]; likelySame: boolean } | null;
  fileDuplicateOfRow: number | null;
}
interface AnalyzeResult {
  summary: {
    total: number; valid: number; invalid: number; duplicates: number; blank: number;
    withWarnings: number; complete: number; partial: number; needsReview: number;
    newJamaaths: string[]; newGroups: string[];
  };
  rows: AnalyzedRow[];
}
interface ImportBatch {
  id: string; fileName: string; fileSize: number; totalRows: number; imported: number;
  updated: number; skipped: number; failed: number; duplicates: number; durationMs: number;
  notes: string; rolledBack: boolean; createdByName: string; createdAt: string;
}

function downloadCsv(fileName: string, headers: string[], rows: string[][]) {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
}

const STEPS = ["Upload File", "Map Columns", "Validate", "Duplicates", "Preview", "Import"];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ImportMembersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [detection, setDetection] = useState<Detection | null>(null);
  const [overrideDetection, setOverrideDetection] = useState(false);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [grid, setGrid] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<TargetKey[]>([]);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [resolutions, setResolutions] = useState<Record<number, "skip" | "update" | "import">>({});
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [report, setReport] = useState<{ imported: number; updated: number; skipped: number; failed: number; duplicates: number; durationMs: number; failedRows: Array<{ rowNumber: number; reason: string }> } | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<ImportBatch | null>(null);

  const historyQuery = useQuery<ImportBatch[]>({
    queryKey: ["import-history"],
    queryFn: async () => {
      const r = await fetch(`${basePath}/api/members/import/history`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load history");
      return r.json();
    },
  });

  const header = grid[0] ?? [];
  const dataRows = useMemo(() => grid.slice(1), [grid]);
  const isAccessManifestFile = useMemo(() => {
    const normalizedHeaders = new Set(header.map((value) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")));
    return [
      "legacy_id",
      "member_dataset_status",
      "planned_member_destination",
      "legacy_referrer_id",
      "referral_status",
    ].every((value) => normalizedHeaders.has(value));
  }, [header]);

  // Hard lock: non-member file detected with ≥80% confidence — no override.
  const detectionLocked =
    !!detection && detection.type !== "members" && detection.type !== "unknown" && detection.confidence >= 80;

  // Content checks: do the column's values actually look like the mapped field?
  const columnChecks = useMemo<ColumnCheck[]>(
    () => mapping.map((target, col) => checkColumn(target, dataRows.slice(0, 80).map((r) => r[col] ?? ""))),
    [mapping, dataRows],
  );
  const invalidColumns = columnChecks
    .map((c, col) => ({ ...c, col }))
    .filter((c) => !c.valid);

  if (user?.role !== "admin") {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Only administrators can import members.
      </div>
    );
  }

  // ── Build mapped rows for the API ──────────────────────────────────────────
  function buildRows() {
    return dataRows.map((cells, i) => {
      const rec: Record<string, string> = {};
      mapping.forEach((target, col) => {
        if (target === "ignore") return;
        const v = cells[col] ?? "";
        if (target === "firstName" || target === "lastName") {
          rec.fullName = target === "firstName" ? `${v} ${rec.__last ?? ""}`.trim() : `${rec.__first ?? rec.fullName ?? ""} ${v}`.trim();
          if (target === "firstName") rec.__first = v; else rec.__last = v;
          rec.fullName = `${rec.__first ?? ""} ${rec.__last ?? ""}`.trim() || rec.fullName;
        } else if (v.trim() !== "" || rec[target] === undefined) {
          // Don't let a blank column erase a value another column already provided
          // (e.g. "Job Title" and "Post" both map to Occupation).
          rec[target] = v;
        }
      });
      delete rec.__first; delete rec.__last;
      return { rowNumber: i + 2, ...rec };
    });
  }

  async function handleFile(f: File) {
    if (f.size > 15 * 1024 * 1024) { toast({ title: "File too large (max 15 MB)", variant: "destructive" }); return; }
    if (!/\.(txt|csv|tsv|xlsx?)$/i.test(f.name)) { toast({ title: "Unsupported file type", description: "Upload a TXT, CSV or XLSX file.", variant: "destructive" }); return; }
    setBusy(true); setBusyLabel("Reading file…");
    try {
      const parsed = await parseFile(f);
      if (parsed.length < 2) { toast({ title: "File appears to be empty", variant: "destructive" }); return; }
      if (parsed.length > 20001) { toast({ title: "Too many rows (max 20,000)", variant: "destructive" }); return; }
      setFile(f);
      setGrid(parsed);
      // Reuse the saved "Legacy Access Members Mapping" when the file has the
      // same columns as a previous import; otherwise auto-detect each column.
      const saved = loadSavedMapping(parsed[0]!);
      setMapping(saved ?? parsed[0]!.map((h) => autoDetect(h)));
      setDetection(detectFileType(parsed[0]!));
      setOverrideDetection(false);
      setOverrideDialogOpen(false);
      setAnalysis(null); setResolutions({}); setReport(null);
      setStep(1);
    } catch (err) {
      toast({
        title: "Could not read this file",
        description: err instanceof Error && err.message ? err.message : "The file may be corrupted. Try re-saving it as CSV or XLSX and upload again.",
        variant: "destructive",
      });
    } finally { setBusy(false); }
  }

  async function runAnalyze(nextStep: number) {
    setBusy(true); setBusyLabel("Cleaning and validating records…");
    try {
      const r = await fetch(`${basePath}/api/members/import/analyze`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: buildRows() }),
      });
      if (!r.ok) throw new Error();
      setAnalysis(await r.json());
      setStep(nextStep);
    } catch {
      toast({ title: "Validation failed", description: "Please check the column mapping and try again.", variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function runImport() {
    setConfirmOpen(false);
    setBusy(true); setBusyLabel("Importing members… please keep this page open");
    const t0 = Date.now();
    try {
      const r = await fetch(`${basePath}/api/members/import/commit`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file?.name ?? "", fileSize: file?.size ?? 0,
          importMode: isAccessManifestFile ? "dkmo_access_2022" : "generic",
          rows: buildRows(),
          resolutions: Object.fromEntries(Object.entries(resolutions).map(([k, v]) => [String(k), v])),
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Import failed — nothing was saved");
      }
      const result = await r.json();
      setReport(result);
      setStep(5);
      queryClient.invalidateQueries({ queryKey: ["import-history"] });
      queryClient.invalidateQueries(); // refresh members, dashboard, search
      toast({ title: "Import complete", description: `${result.imported} member(s) imported in ${((Date.now() - t0) / 1000).toFixed(1)}s` });
    } catch (e) {
      toast({ title: "Import failed", description: e instanceof Error ? e.message : "Nothing was saved.", variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function runRollback(batch: ImportBatch) {
    setRollbackTarget(null);
    setBusy(true); setBusyLabel("Undoing import…");
    try {
      const r = await fetch(`${basePath}/api/members/import/${batch.id}/rollback`, { method: "POST", credentials: "include" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((body as { error?: string }).error ?? "Rollback failed");
      toast({ title: "Import undone", description: `${(body as { removed: number }).removed} member(s) removed.` });
      queryClient.invalidateQueries();
    } catch (e) {
      toast({ title: "Cannot undo import", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally { setBusy(false); }
  }

  const dupRows = analysis?.rows.filter((r) => r.status === "duplicate") ?? [];
  const validCount = (analysis?.summary.valid ?? 0) +
    dupRows.filter((r) => (resolutions[r.rowNumber] ?? "skip") !== "skip").length;

  return (
    <div className="space-y-6 p-1" data-testid="page-import-members">
      <div>
        <h1 className="text-2xl font-bold">Import Members</h1>
        <p className="text-sm text-muted-foreground">Migrate your legacy member database (TXT, CSV or Excel) safely into the portal.</p>
      </div>

      <Tabs defaultValue="wizard">
        <TabsList>
          <TabsTrigger value="wizard" data-testid="tab-wizard"><Upload className="mr-1.5 h-4 w-4" />Import Wizard</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history"><History className="mr-1.5 h-4 w-4" />Import History</TabsTrigger>
        </TabsList>

        <TabsContent value="wizard" className="space-y-4">
          {/* Stepper */}
          <div className="flex flex-wrap items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${i < step ? "bg-green-600 text-white" : i === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                <span className={`text-sm ${i === step ? "font-semibold" : "text-muted-foreground"}`}>{s}</span>
                {i < STEPS.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            ))}
          </div>

          {busy && (
            <Card><CardContent className="flex items-center gap-3 py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">{busyLabel}</p>
                <Progress value={undefined} className="mt-2 h-2" />
              </div>
            </CardContent></Card>
          )}

          {/* Step 1: Upload */}
          {step === 0 && !busy && (
            <Card>
              <CardContent className="py-10">
                <div
                  className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center hover:bg-muted/50"
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void handleFile(f); }}
                  data-testid="dropzone-upload"
                >
                  <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
                  <p className="font-medium">Drop your legacy member file here, or click to browse</p>
                  <p className="text-sm text-muted-foreground">TXT (tab separated), CSV or XLSX — delimiter detected automatically. Max 15 MB / 20,000 rows.</p>
                </div>
                <input ref={fileInput} type="file" accept=".txt,.csv,.tsv,.xlsx" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }} data-testid="input-file" />
                <div className="mt-6 grid gap-4 sm:grid-cols-2 text-sm">
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <p className="font-semibold mb-1.5">Members Import accepts:</p>
                    <p className="text-muted-foreground">Name · Membership Number · Mobile Number · Passport Number · Iqama Number · Email · Address · DOB · Nationality</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <p className="font-semibold mb-1.5">Not for this importer — Payments files contain:</p>
                    <p className="text-muted-foreground">Amount · Receipt Number · Payment Date · Bill Number · Remarks · Membership Fee · FRF Fee</p>
                    <p className="mt-1.5 text-xs text-muted-foreground">Payment files are detected automatically and cannot be imported as members.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Mapping */}
          {step === 1 && !busy && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" />Columns detected automatically — adjust if needed</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <span><b className="text-foreground">{file?.name}</b></span>
                  <span>{((file?.size ?? 0) / 1024).toFixed(1)} KB</span>
                  <span>{dataRows.length.toLocaleString()} records</span>
                  {detection && (
                    <Badge
                      variant="outline"
                      data-testid="badge-detected-type"
                      className={
                        detection.type === "members"
                          ? "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-400"
                          : detection.type === "unknown"
                            ? "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                            : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                      }
                    >
                      Detected File Type: {TYPE_LABELS[detection.type]}
                      {detection.type !== "unknown" ? ` — ${detection.confidence}% confidence` : ""}
                    </Badge>
                  )}
                </div>
                {detection && detection.type !== "members" && detection.type !== "unknown" && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300" data-testid="warning-wrong-file-type">
                    <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 shrink-0" />
                      This file appears to contain {TYPE_LABELS[detection.type].toLowerCase()} records, not member records.
                      {detection.type === "payments" ? " Please use the Payments Import module instead." : ""}
                    </p>
                    <ul className="mt-2 list-disc pl-6 space-y-0.5">
                      {detection.matched.map((m) => (
                        <li key={m}>Column matching "{m}" was found. This looks like a {TYPE_LABELS[detection.type].toLowerCase().replace(/s$/, "")} file.</li>
                      ))}
                    </ul>
                    {detectionLocked ? (
                      <p className="mt-3 font-semibold" data-testid="text-import-blocked">
                        Import blocked. This file has been identified as a {TYPE_LABELS[detection.type]} file.
                        {detection.type === "payments" ? " Please use the Payments Import module." : ` Please use the ${TYPE_LABELS[detection.type]} Import module.`}
                      </p>
                    ) : overrideDetection ? (
                      <p className="mt-3 font-medium" data-testid="text-override-active">
                        Detection overridden — this file will be treated as a member file. Column values are still checked below.
                      </p>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 border-amber-400"
                        onClick={() => setOverrideDialogOpen(true)}
                        data-testid="button-override-detection"
                      >Override Detection</Button>
                    )}
                  </div>
                )}
                <div className="max-h-[420px] overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th className="p-2 text-left">File Column</th>
                        <th className="p-2 text-left">Sample Data</th>
                        <th className="p-2 text-left">Import As</th>
                      </tr>
                    </thead>
                    <tbody>
                      {header.map((h, col) => (
                        <tr key={col} className="border-t">
                          <td className="p-2 font-medium">{h || <span className="text-muted-foreground">(column {col + 1})</span>}</td>
                          <td className="max-w-[280px] truncate p-2 text-muted-foreground">
                            {dataRows.slice(0, 3).map((r) => r[col]).filter(Boolean).join(" • ")}
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-2">
                              <Select
                                value={mapping[col] ?? "ignore"}
                                disabled={detectionLocked}
                                onValueChange={(v) => setMapping((m) => m.map((x, i) => (i === col ? (v as TargetKey) : x)))}
                              >
                                <SelectTrigger className="w-56" data-testid={`select-mapping-${col}`}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="ignore">— Ignore —</SelectItem>
                                  {TARGET_FIELDS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              {mapping[col] !== "ignore" && !detectionLocked && (
                                columnChecks[col]?.valid ? (
                                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" data-testid={`icon-mapping-valid-${col}`} />
                                ) : (
                                  <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400" data-testid={`icon-mapping-invalid-${col}`}>
                                    <AlertTriangle className="h-4 w-4 shrink-0" />{columnChecks[col]?.reason}
                                  </span>
                                )
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(0)} data-testid="button-back"><ArrowLeft className="mr-1 h-4 w-4" />Back</Button>
                  <Button
                    disabled={detectionLocked}
                    onClick={() => {
                      if (detectionLocked) return;
                      if (detection && detection.type !== "members" && detection.type !== "unknown" && !overrideDetection) {
                        toast({
                          title: `This may be a ${TYPE_LABELS[detection.type].toLowerCase()} file`,
                          description: "Click \"Override Detection\" above if you are sure this is a member file.",
                          variant: "destructive",
                        });
                        return;
                      }
                      if (invalidColumns.length > 0) {
                        const first = invalidColumns[0]!;
                        toast({
                          title: "Some columns are mapped to the wrong fields",
                          description: `"${header[first.col] || `Column ${first.col + 1}`}" — ${first.reason}. Fix the mapping or set it to Ignore.`,
                          variant: "destructive",
                        });
                        return;
                      }
                      const mapped = new Set(mapping.filter((m) => m !== "ignore"));
                      if (!mapped.has("fullName") && !(mapped.has("firstName") || mapped.has("lastName"))) {
                        toast({
                          title: "Column 'Member Name' was not found",
                          description: "A name column (Full Name, or First + Last Name) is required for member import. Map it in the \"Import As\" column.",
                          variant: "destructive",
                        }); return;
                      }
                      if (!mapped.has("mobileNumber")) {
                        toast({
                          title: "Column 'Mobile Number' was not found",
                          description: "A mobile/phone column is required for member import. Map it in the \"Import As\" column.",
                          variant: "destructive",
                        }); return;
                      }
                      saveMapping(header, mapping); // remember as the default Legacy Access Members Mapping
                      void runAnalyze(2);
                    }}
                    data-testid="button-validate"
                  >Clean & Validate<ArrowRight className="ml-1 h-4 w-4" /></Button>
                </div>

                {/* Override Detection confirmation */}
                <AlertDialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />Warning
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This file appears to be a {detection ? TYPE_LABELS[detection.type] : ""} file.
                        Importing it as Members may corrupt your member database.
                        <br /><br />Continue anyway?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="button-override-cancel">Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => setOverrideDetection(true)} data-testid="button-override-continue">
                        Continue
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Validation results */}
          {step === 2 && analysis && !busy && (
            <Card>
              <CardHeader><CardTitle className="text-base">Validation Results</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-1" data-testid="pre-import-summary">
                  <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{analysis.summary.total.toLocaleString()} member records detected</p>
                  <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{mapping.filter((m) => m !== "ignore").length} fields mapped automatically</p>
                  {mapping.filter((m) => m === "ignore").length > 0 && (
                    <p className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />{mapping.filter((m) => m === "ignore").length} optional column(s) ignored (no DKMO equivalent)</p>
                  )}
                  {analysis.summary.duplicates > 0 && (
                    <p className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />{analysis.summary.duplicates} duplicate member(s) found — review in the next step</p>
                  )}
                  {analysis.summary.invalid > 0 && (
                    <p className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" />{analysis.summary.invalid} record(s) need attention (missing name or invalid mobile)</p>
                  )}
                  <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4 text-green-600" />Ready to import</p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <StatCard label="Total" value={analysis.summary.total} />
                  <StatCard label="Valid" value={analysis.summary.valid} tone="green" />
                  <StatCard label="Invalid" value={analysis.summary.invalid} tone="red" />
                  <StatCard label="Duplicates" value={analysis.summary.duplicates} tone="yellow" />
                  <StatCard label="Blank rows" value={analysis.summary.blank} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <StatCard label="Complete records" value={analysis.summary.complete ?? 0} tone="green" />
                  <StatCard label="Partial (OK to import)" value={analysis.summary.partial ?? 0} />
                  <StatCard label="Needs review" value={analysis.summary.needsReview ?? 0} tone="red" />
                </div>
                {analysis.summary.invalid > 0 && (
                  <div className="max-h-72 overflow-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted"><tr><th className="p-2 text-left">Row</th><th className="p-2 text-left">Name</th><th className="p-2 text-left">Problem</th></tr></thead>
                      <tbody>
                        {analysis.rows.filter((r) => r.status === "invalid").map((r) => (
                          <tr key={r.rowNumber} className="border-t">
                            <td className="p-2">{r.rowNumber}</td>
                            <td className="p-2">{String(r.cleaned.fullName ?? "")}</td>
                            <td className="p-2 text-red-600 dark:text-red-400">{r.errors.join("; ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {analysis.rows.some((r) => r.transforms?.length > 0) && (
                  <div>
                    <p className="mb-1 text-sm font-medium">Automatic corrections (original → new)</p>
                    <div className="max-h-64 overflow-auto rounded-md border">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-muted"><tr><th className="p-2 text-left">Row</th><th className="p-2 text-left">Name</th><th className="p-2 text-left">Corrections</th></tr></thead>
                        <tbody>
                          {analysis.rows.filter((r) => r.transforms?.length > 0).slice(0, 300).map((r) => (
                            <tr key={r.rowNumber} className="border-t align-top">
                              <td className="p-2">{r.rowNumber}</td>
                              <td className="whitespace-nowrap p-2">{String(r.cleaned.fullName ?? "")}</td>
                              <td className="p-2 text-muted-foreground">{r.transforms.map((t) => <div key={t}>{t}</div>)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">Invalid rows will not be imported. You can download them at the end and fix the source file.</p>
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="mr-1 h-4 w-4" />Back</Button>
                  <Button onClick={() => setStep(3)} data-testid="button-to-duplicates">Continue<ArrowRight className="ml-1 h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Duplicates */}
          {step === 3 && analysis && !busy && (
            <Card>
              <CardHeader><CardTitle className="text-base">Duplicate Records ({dupRows.length})</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {dupRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No duplicates found — all records are new.</p>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setResolutions(Object.fromEntries(dupRows.map((r) => [r.rowNumber, "skip"])))}>Skip All</Button>
                      <Button size="sm" variant="outline" onClick={() => setResolutions(Object.fromEntries(dupRows.filter((r) => r.duplicate).map((r) => [r.rowNumber, "update"])))}>Update All Existing</Button>
                    </div>
                    <div className="max-h-96 overflow-auto rounded-md border">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-muted"><tr>
                          <th className="p-2 text-left">Row</th><th className="p-2 text-left">Name</th>
                          <th className="p-2 text-left">Matches</th><th className="p-2 text-left">Reason</th><th className="p-2 text-left">Action</th>
                        </tr></thead>
                        <tbody>
                          {dupRows.map((r) => (
                            <tr key={r.rowNumber} className="border-t">
                              <td className="p-2">{r.rowNumber}</td>
                              <td className="p-2">
                                {String(r.cleaned.fullName ?? "")}
                                {r.duplicate?.likelySame && <Badge variant="outline" className="ml-2 border-yellow-400 text-yellow-700 dark:text-yellow-400">Likely same member</Badge>}
                              </td>
                              <td className="p-2 text-muted-foreground">
                                {r.duplicate ? `${r.duplicate.memberName} (${r.duplicate.membershipId})` : `Row ${r.fileDuplicateOfRow} in this file`}
                              </td>
                              <td className="p-2 text-muted-foreground">{r.duplicate?.reasons.join(", ") ?? "Same mobile within file"}</td>
                              <td className="p-2">
                                <Select value={resolutions[r.rowNumber] ?? "skip"} onValueChange={(v) => setResolutions((x) => ({ ...x, [r.rowNumber]: v as "skip" | "update" | "import" }))}>
                                  <SelectTrigger className="w-40" data-testid={`select-resolution-${r.rowNumber}`}><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="skip">Skip</SelectItem>
                                    {r.duplicate && <SelectItem value="update">Update Existing</SelectItem>}
                                    <SelectItem value="import">Import Anyway</SelectItem>
                                  </SelectContent>
                                </Select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="mr-1 h-4 w-4" />Back</Button>
                  <Button onClick={() => setStep(4)} data-testid="button-to-preview">Continue<ArrowRight className="ml-1 h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 5: Preview & confirm */}
          {step === 4 && analysis && !busy && (
            <Card>
              <CardHeader><CardTitle className="text-base">Ready to Import</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="New members" value={analysis.summary.valid + dupRows.filter((r) => (resolutions[r.rowNumber] ?? "skip") === "import").length} tone="green" />
                  <StatCard label="Members to update" value={dupRows.filter((r) => (resolutions[r.rowNumber] ?? "skip") === "update").length} />
                  <StatCard label="Will be skipped" value={analysis.summary.blank + analysis.summary.invalid + dupRows.filter((r) => (resolutions[r.rowNumber] ?? "skip") === "skip").length} tone="yellow" />
                  <StatCard label="With warnings" value={analysis.summary.withWarnings} />
                </div>
                {(analysis.summary.newJamaaths.length > 0 || analysis.summary.newGroups.length > 0) && (
                  <div className="rounded-md border p-3 text-sm">
                    {analysis.summary.newJamaaths.length > 0 && (
                      <p><b>New Jamaaths:</b> {analysis.summary.newJamaaths.slice(0, 15).join(", ")}{analysis.summary.newJamaaths.length > 15 ? ` +${analysis.summary.newJamaaths.length - 15} more` : ""}</p>
                    )}
                    {analysis.summary.newGroups.length > 0 && (
                      <p className="mt-1"><b>New Groups:</b> {analysis.summary.newGroups.join(", ")}</p>
                    )}
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  Each new member gets a fresh DKMO membership number; the old ID is stored as Legacy ID for searching.
                  Everything is saved in one transaction — if anything fails, nothing is saved. This import can be undone afterwards.
                </p>
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(3)}><ArrowLeft className="mr-1 h-4 w-4" />Back</Button>
                  <Button onClick={() => setConfirmOpen(true)} disabled={validCount === 0} data-testid="button-import">
                    <Users className="mr-1.5 h-4 w-4" />Import {validCount.toLocaleString()} Member(s)
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 6: Report */}
          {step === 5 && report && !busy && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-5 w-5 text-green-600" />Import Completed</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <StatCard label="Imported" value={report.imported} tone="green" />
                  <StatCard label="Updated" value={report.updated} />
                  <StatCard label="Skipped" value={report.skipped} tone="yellow" />
                  <StatCard label="Failed" value={report.failed} tone={report.failed > 0 ? "red" : undefined} />
                  <StatCard label="Duration" value={`${(report.durationMs / 1000).toFixed(1)}s`} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {report.failedRows.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => downloadCsv("failed-records.csv", ["Row", "Reason"], report.failedRows.map((f) => [String(f.rowNumber), f.reason]))} data-testid="button-download-failed">
                      <Download className="mr-1.5 h-4 w-4" />Failed Records CSV
                    </Button>
                  )}
                  {analysis && analysis.summary.duplicates > 0 && (
                    <Button variant="outline" size="sm" onClick={() => downloadCsv("duplicate-report.csv", ["Row", "Name", "Matched Member", "Reasons", "Action"], dupRows.map((r) => [String(r.rowNumber), String(r.cleaned.fullName ?? ""), r.duplicate ? `${r.duplicate.memberName} (${r.duplicate.membershipId})` : `Row ${r.fileDuplicateOfRow}`, r.duplicate?.reasons.join("; ") ?? "Duplicate within file", resolutions[r.rowNumber] ?? "skip"]))}>
                      <Download className="mr-1.5 h-4 w-4" />Duplicate Report CSV
                    </Button>
                  )}
                  <Button size="sm" onClick={() => { setStep(0); setFile(null); setGrid([]); setAnalysis(null); setReport(null); setResolutions({}); }} data-testid="button-new-import">
                    <Upload className="mr-1.5 h-4 w-4" />New Import
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">Imported members are live immediately — they appear in the Members list, search, and dashboard counts. If something is wrong, use Import History → Undo.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* History */}
        <TabsContent value="history">
          <Card>
            <CardContent className="pt-6">
              {historyQuery.isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (historyQuery.data?.length ?? 0) === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No imports yet.</p>
              ) : (
                <div className="overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted"><tr>
                      <th className="p-2 text-left">Date</th><th className="p-2 text-left">Admin</th><th className="p-2 text-left">File</th>
                      <th className="p-2 text-right">Imported</th><th className="p-2 text-right">Updated</th><th className="p-2 text-right">Skipped</th>
                      <th className="p-2 text-right">Failed</th><th className="p-2 text-right">Duration</th><th className="p-2 text-left">Status</th><th className="p-2" />
                    </tr></thead>
                    <tbody>
                      {historyQuery.data!.map((b) => (
                        <tr key={b.id} className="border-t" data-testid={`row-history-${b.id}`}>
                          <td className="whitespace-nowrap p-2">{new Date(b.createdAt).toLocaleString()}</td>
                          <td className="p-2">{b.createdByName}</td>
                          <td className="max-w-[200px] truncate p-2">{b.fileName || "—"}</td>
                          <td className="p-2 text-right">{b.imported}</td>
                          <td className="p-2 text-right">{b.updated}</td>
                          <td className="p-2 text-right">{b.skipped}</td>
                          <td className="p-2 text-right">{b.failed}</td>
                          <td className="p-2 text-right">{(b.durationMs / 1000).toFixed(1)}s</td>
                          <td className="p-2">
                            {b.rolledBack ? <Badge variant="outline">Undone</Badge> : b.imported > 0 ? <Badge className="bg-green-600 hover:bg-green-600">Imported</Badge> : <Badge variant="secondary">—</Badge>}
                          </td>
                          <td className="p-2 text-right">
                                                        {!b.rolledBack && b.imported > 0 && (
                              <Button variant="ghost" size="sm" onClick={() => setRollbackTarget(b)} data-testid={`button-rollback-${b.id}`}>
                                <RotateCcw className="mr-1 h-3.5 w-3.5" />Undo
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirm import */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import {validCount.toLocaleString()} member(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              New DKMO membership numbers will be generated automatically. The import is saved in a single transaction and can be undone from Import History.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runImport()} data-testid="button-confirm-import">Start Import</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm rollback */}
      <AlertDialog open={rollbackTarget !== null} onOpenChange={(o) => !o && setRollbackTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo this import?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the {rollbackTarget?.imported} member(s) created by "{rollbackTarget?.fileName}". Members who already have payments, FRF payments or loans cannot be removed — the undo will be blocked in that case. Updates made to existing members are not reverted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => rollbackTarget && void runRollback(rollbackTarget)} data-testid="button-confirm-rollback">
              <AlertTriangle className="mr-1.5 h-4 w-4" />Undo Import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: "green" | "red" | "yellow" }) {
  const toneCls = tone === "green" ? "text-green-600 dark:text-green-400" : tone === "red" ? "text-red-600 dark:text-red-400" : tone === "yellow" ? "text-yellow-600 dark:text-yellow-400" : "";
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${toneCls}`}>{typeof value === "number" ? value.toLocaleString() : value}</p>
    </div>
  );
}
