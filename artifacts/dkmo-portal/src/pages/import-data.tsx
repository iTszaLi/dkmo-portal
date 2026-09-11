import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import {
  Upload, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, RotateCcw,
  History, Loader2, CreditCard, ReceiptText, HeartHandshake, Award, CalendarDays, DatabaseZap, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { parseImportFile } from "@/lib/import-parse";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Module configuration ─────────────────────────────────────────────────────
interface FieldDef { key: string; label: string; patterns: RegExp[]; required?: boolean }
interface ModuleDef {
  slug: string;
  title: string;
  noun: string; // "payment records"
  icon: typeof CreditCard;
  description: string;
  accepts: string;
  fields: FieldDef[];
}

const MODULES: ModuleDef[] = [
  {
    slug: "payments",
    title: "Payments Import",
    noun: "payment records",
    icon: CreditCard,
    description: "Legacy payment ledger (Id No, Date, Details, Amount, Entry date, Bill_No, Remarks). Each row is matched to a member by legacy ID, DKMO ID or mobile number.",
    accepts: "Id No (member), Date, Details, Amount, Entry date, Bill No, Remarks",
    fields: [
      { key: "memberRef", label: "Member (Id No / DKMO ID / Mobile)", patterns: [/^id ?no|member|dkmo/i], required: true },
      { key: "billNo", label: "Bill / Receipt Number", patterns: [/bill|receipt/i] },
      { key: "entryDate", label: "Entry Date (ignored)", patterns: [/entry ?date/i] },
      { key: "date", label: "Payment Date", patterns: [/^date$|paid|payment ?date/i] },
      { key: "amount", label: "Amount", patterns: [/amount|amt\b/i], required: true },
      { key: "details", label: "Details / Payment Type", patterns: [/details?|description|type/i] },
      { key: "remarks", label: "Remarks", patterns: [/remarks?|notes?/i] },
    ],
  },
  {
    slug: "receipts",
    title: "Receipts Import",
    noun: "receipt records",
    icon: ReceiptText,
    description: "Legacy receipt book. Each row becomes a receipt; member details are filled in automatically when the member is found.",
    accepts: "Receipt No, Date, Member Name or ID, Amount, Payment Types",
    fields: [
      { key: "receiptNumber", label: "Receipt Number", patterns: [/receipt|bill/i], required: true },
      { key: "memberRef", label: "Member ID (DKMO / Legacy)", patterns: [/^id ?no|member ?id|dkmo/i] },
      { key: "memberName", label: "Member Name", patterns: [/name/i], required: true },
      { key: "date", label: "Receipt Date", patterns: [/date/i] },
      { key: "amount", label: "Amount", patterns: [/amount|amt\b/i], required: true },
      { key: "paymentTypes", label: "Payment Types / Details", patterns: [/type|details?|description/i] },
      { key: "mobileNumber", label: "Mobile Number", patterns: [/mobile|phone/i] },
      { key: "jamathName", label: "Jamaath", patterns: [/jama|mahal/i] },
    ],
  },
  {
    slug: "frf",
    title: "FRF Contributions Import",
    noun: "FRF contribution records",
    icon: HeartHandshake,
    description: "Per-member FRF contributions for an existing claim. The claim must already exist in the portal — rows are matched by the deceased / claimant name.",
    accepts: "Member ID, Claim (claimant name), Amount, Paid Date, Status",
    fields: [
      { key: "memberRef", label: "Member (Id No / DKMO ID / Mobile)", patterns: [/^id ?no|member|dkmo/i], required: true },
      { key: "claimRef", label: "FRF Claim (Claimant Name)", patterns: [/claim|deceased|case/i], required: true },
      { key: "amount", label: "Amount", patterns: [/amount|amt\b/i] },
      { key: "date", label: "Paid Date", patterns: [/date/i] },
      { key: "status", label: "Status (Paid / Pending)", patterns: [/status|paid/i] },
    ],
  },
  {
    slug: "sponsors",
    title: "Sponsors Import",
    noun: "sponsor records",
    icon: Award,
    description: "Sponsor list with contact details and pledged / paid amounts.",
    accepts: "Sponsor Name, Company, Contact Person, Phone, Email, Tier, Total Amount, Paid Amount, Notes",
    fields: [
      { key: "sponsorName", label: "Sponsor Name", patterns: [/sponsor|^name$/i], required: true },
      { key: "company", label: "Company", patterns: [/company|organi[sz]ation/i] },
      { key: "contactPerson", label: "Contact Person", patterns: [/contact ?person|contact$/i] },
      { key: "phone", label: "Phone", patterns: [/phone|mobile/i] },
      { key: "email", label: "Email", patterns: [/e-?mail/i] },
      { key: "tier", label: "Tier", patterns: [/tier|level|category/i] },
      { key: "paidAmount", label: "Paid Amount", patterns: [/paid/i] },
      { key: "totalAmount", label: "Total / Pledged Amount", patterns: [/total|amount|pledge/i] },
      { key: "notes", label: "Notes", patterns: [/notes?|remarks?/i] },
    ],
  },
  {
    slug: "events",
    title: "Events Import",
    noun: "event records",
    icon: CalendarDays,
    description: "Past and upcoming events. Events dated in the past are marked completed automatically.",
    accepts: "Event Name, Date, Location, Budget, Description, Status",
    fields: [
      { key: "name", label: "Event Name", patterns: [/event|^name|title/i], required: true },
      { key: "date", label: "Event Date", patterns: [/date/i] },
      { key: "location", label: "Location", patterns: [/location|venue|place/i] },
      { key: "budget", label: "Budget", patterns: [/budget|amount|cost/i] },
      { key: "description", label: "Description", patterns: [/desc|details?|notes?|remarks?/i] },
    ],
  },
];

type TargetKey = string; // field key or "ignore"

function autoDetect(mod: ModuleDef, header: string): TargetKey {
  const h = header.trim();
  if (!h) return "ignore";
  for (const f of mod.fields) if (f.patterns.some((p) => p.test(h))) return f.key;
  return "ignore";
}

interface AnalyzedRow {
  rowNumber: number;
  status: "valid" | "invalid" | "duplicate" | "blank";
  display: Record<string, string>;
  errors: string[];
  warnings: string[];
  duplicateReason: string;
}
interface AnalyzeResult {
  summary: { total: number; valid: number; invalid: number; duplicates: number; blank: number; withWarnings: number };
  rows: AnalyzedRow[];
}
interface ImportBatch {
  id: string; fileName: string; totalRows: number; imported: number; skipped: number;
  failed: number; duplicates: number; rolledBack: boolean; createdByName: string; createdAt: string;
}

// ── Hub page ──────────────────────────────────────────────────────────────────
export function ImportDataHubPage() {
  const { user } = useAuth();
  if (user?.role !== "admin") {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Only administrators can import data.</div>;
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Data Import</h1>
        <p className="text-muted-foreground">Bring records from the legacy Access database into the portal, one module at a time.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/import-members">
          <Card className="cursor-pointer transition-shadow hover:shadow-md" data-testid="card-import-members">
            <CardContent className="flex items-start gap-3 p-5">
              <Users className="mt-1 h-6 w-6 text-primary shrink-0" />
              <div>
                <p className="font-semibold">Members Import</p>
                <p className="text-sm text-muted-foreground">Legacy member database with full column mapping, duplicate handling and rollback.</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        {MODULES.map((m) => (
          <Link key={m.slug} href={`/import-data/${m.slug}`}>
            <Card className="cursor-pointer transition-shadow hover:shadow-md" data-testid={`card-import-${m.slug}`}>
              <CardContent className="flex items-start gap-3 p-5">
                <m.icon className="mt-1 h-6 w-6 text-primary shrink-0" />
                <div>
                  <p className="font-semibold">{m.title}</p>
                  <p className="text-sm text-muted-foreground">{m.description}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Wizard page ───────────────────────────────────────────────────────────────
const STEPS = ["Upload File", "Map Columns", "Validate", "Import"];

export default function ImportDataPage() {
  const [, params] = useRoute("/import-data/:entity");
  const mod = MODULES.find((m) => m.slug === params?.entity);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [grid, setGrid] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<TargetKey[]>([]);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; failed: number; duplicates: number } | null>(null);
  const [rollbackBatch, setRollbackBatch] = useState<ImportBatch | null>(null);

  const historyQuery = useQuery<ImportBatch[]>({
    queryKey: ["import-history", mod?.slug],
    enabled: !!mod,
    queryFn: async () => {
      const r = await fetch(`${basePath}/api/import/${mod!.slug}/history`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load history");
      return r.json();
    },
  });

  const header = grid[0] ?? [];
  const dataRows = useMemo(() => grid.slice(1), [grid]);

  if (!mod) return <div className="flex h-64 items-center justify-center text-muted-foreground">Unknown import module.</div>;
  if (user?.role !== "admin") {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Only administrators can import data.</div>;
  }

  function buildRows() {
    return dataRows.map((cells, i) => {
      const rec: Record<string, string> = {};
      mapping.forEach((target, col) => {
        if (target === "ignore") return;
        const v = cells[col] ?? "";
        if (v.trim() !== "" || rec[target] === undefined) rec[target] = v;
      });
      return { rowNumber: i + 2, ...rec };
    });
  }

  async function handleFile(f: File) {
    if (f.size > 15 * 1024 * 1024) { toast({ title: "File too large (max 15 MB)", variant: "destructive" }); return; }
    if (!/\.(txt|csv|tsv|xlsx)$/i.test(f.name)) { toast({ title: "Unsupported file type", description: "Upload a TXT, CSV or XLSX file.", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const parsed = await parseImportFile(f);
      if (parsed.length < 2) { toast({ title: "File appears to be empty", variant: "destructive" }); return; }
      if (parsed.length > 20001) { toast({ title: "Too many rows (max 20,000)", variant: "destructive" }); return; }
      setFile(f);
      setGrid(parsed);
      setMapping(parsed[0]!.map((h) => autoDetect(mod!, h)));
      setAnalysis(null);
      setResult(null);
      setStep(1);
    } catch {
      toast({ title: "Could not read the file", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function runAnalyze() {
    setBusy(true);
    try {
      const r = await fetch(`${basePath}/api/import/${mod!.slug}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rows: buildRows() }),
      });
      if (!r.ok) throw new Error();
      setAnalysis(await r.json());
      setStep(2);
    } catch {
      toast({ title: "Validation failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function runCommit() {
    setBusy(true);
    try {
      const r = await fetch(`${basePath}/api/import/${mod!.slug}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fileName: file?.name ?? "", fileSize: file?.size ?? 0, rows: buildRows() }),
      });
      if (!r.ok) throw new Error();
      const data = await r.json();
      setResult(data);
      setStep(3);
      void queryClient.invalidateQueries({ queryKey: ["import-history", mod!.slug] });
    } catch {
      toast({ title: "Import failed", description: "Nothing was imported. Please try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function runRollback(batch: ImportBatch) {
    try {
      const r = await fetch(`${basePath}/api/import/${mod!.slug}/${batch.id}/rollback`, { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error();
      const data = await r.json();
      toast({ title: `Rolled back — ${data.removed} record(s) removed` });
      void queryClient.invalidateQueries({ queryKey: ["import-history", mod!.slug] });
    } catch {
      toast({ title: "Rollback failed", variant: "destructive" });
    }
  }

  const requiredMissing = mod.fields.filter((f) => f.required && !mapping.includes(f.key));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <mod.icon className="h-6 w-6 text-primary" />{mod.title}
          </h1>
          <p className="text-muted-foreground">{mod.description}</p>
        </div>
        <Link href="/import-data"><Button variant="outline" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />All Import Modules</Button></Link>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
            <span className={i <= step ? "font-medium" : "text-muted-foreground"}>{s}</span>
            {i < STEPS.length - 1 && <span className="text-muted-foreground">→</span>}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 0 && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div
              className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center hover:bg-muted/40"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void handleFile(f); }}
              data-testid="dropzone-upload"
            >
              {busy ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <Upload className="h-8 w-8 text-muted-foreground" />}
              <p className="font-medium">Drop your file here, or click to browse</p>
              <p className="text-sm text-muted-foreground">TXT, CSV or Excel — up to 20,000 rows</p>
              <input ref={fileInput} type="file" accept=".txt,.csv,.tsv,.xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }} data-testid="input-file" />
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <span className="font-medium">{mod.title} accepts:</span> {mod.accepts}
            </div>

            {historyQuery.data && historyQuery.data.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-sm font-medium"><History className="h-4 w-4" />Previous imports</p>
                <Table>
                  <TableHeader><TableRow><TableHead>File</TableHead><TableHead>Imported</TableHead><TableHead>Skipped</TableHead><TableHead>Date</TableHead><TableHead>By</TableHead><TableHead /></TableRow></TableHeader>
                  <TableBody>
                    {historyQuery.data.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="max-w-[200px] truncate">{b.fileName || "—"}{b.rolledBack && <Badge variant="outline" className="ml-2">Rolled back</Badge>}</TableCell>
                        <TableCell>{b.imported}</TableCell>
                        <TableCell>{b.skipped + b.failed}</TableCell>
                        <TableCell>{new Date(b.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>{b.createdByName || "—"}</TableCell>
                        <TableCell>
                          {!b.rolledBack && b.imported > 0 && (
                            <Button variant="ghost" size="sm" onClick={() => setRollbackBatch(b)} data-testid={`button-rollback-${b.id}`}>
                              <RotateCcw className="mr-1 h-4 w-4" />Roll back
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Map columns */}
      {step === 1 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Map Columns — {file?.name} ({dataRows.length.toLocaleString()} rows)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader><TableRow><TableHead>File Column</TableHead><TableHead>Sample</TableHead><TableHead>Import As</TableHead></TableRow></TableHeader>
              <TableBody>
                {header.map((h, col) => (
                  <TableRow key={col}>
                    <TableCell className="font-medium">{h || `Column ${col + 1}`}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-muted-foreground">{dataRows[0]?.[col] ?? ""}</TableCell>
                    <TableCell>
                      <Select value={mapping[col] ?? "ignore"} onValueChange={(v) => setMapping((m) => m.map((x, i) => (i === col ? v : x)))}>
                        <SelectTrigger className="w-56" data-testid={`select-mapping-${col}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ignore">— Ignore —</SelectItem>
                          {mod.fields.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {requiredMissing.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40" data-testid="warning-required-missing">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500 shrink-0" />
                <span>Required field(s) not mapped: {requiredMissing.map((f) => f.label).join(", ")}. Map them in the "Import As" column before continuing.</span>
              </div>
            )}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(0)}><ArrowLeft className="mr-1 h-4 w-4" />Back</Button>
              <Button onClick={() => void runAnalyze()} disabled={busy || requiredMissing.length > 0} data-testid="button-validate">
                {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Validate<ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Validation results */}
      {step === 2 && analysis && (
        <Card>
          <CardHeader><CardTitle className="text-base">Validation Results</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-1" data-testid="pre-import-summary">
              <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{analysis.summary.total.toLocaleString()} {mod.noun} detected</p>
              <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{analysis.summary.valid.toLocaleString()} ready to import</p>
              {analysis.summary.duplicates > 0 && <p className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />{analysis.summary.duplicates} duplicate(s) — will be skipped</p>}
              {analysis.summary.invalid > 0 && <p className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" />{analysis.summary.invalid} record(s) with problems — will be skipped</p>}
              {analysis.summary.blank > 0 && <p className="flex items-center gap-2 text-muted-foreground"><AlertTriangle className="h-4 w-4" />{analysis.summary.blank} blank row(s) ignored</p>}
            </div>

            {analysis.rows.some((r) => r.status === "invalid" || r.status === "duplicate") && (
              <div className="max-h-72 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Record</TableHead><TableHead>Problem</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {analysis.rows.filter((r) => r.status === "invalid" || r.status === "duplicate").slice(0, 200).map((r) => (
                      <TableRow key={r.rowNumber}>
                        <TableCell>{r.rowNumber}</TableCell>
                        <TableCell className="max-w-[280px] truncate">{Object.values(r.display).filter(Boolean).slice(0, 3).join(" · ")}</TableCell>
                        <TableCell className="text-sm">
                          {r.status === "duplicate"
                            ? <span className="text-amber-600 dark:text-amber-400">{r.duplicateReason}</span>
                            : <span className="text-red-600 dark:text-red-400">{r.errors.join("; ")}</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="mr-1 h-4 w-4" />Back</Button>
              <Button onClick={() => void runCommit()} disabled={busy || analysis.summary.valid === 0} data-testid="button-import">
                {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Import {analysis.summary.valid.toLocaleString()} Record(s)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Done */}
      {step === 3 && result && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
            <p className="text-xl font-semibold" data-testid="text-import-result">{result.imported.toLocaleString()} record(s) imported</p>
            <p className="text-sm text-muted-foreground">
              {result.duplicates > 0 && `${result.duplicates} duplicate(s) skipped. `}
              {result.failed > 0 && `${result.failed} record(s) had problems and were skipped. `}
              You can roll this import back from the history list if something looks wrong.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setStep(0); setFile(null); setGrid([]); setAnalysis(null); setResult(null); }}>Import Another File</Button>
              <Link href="/import-data"><Button><DatabaseZap className="mr-1 h-4 w-4" />All Import Modules</Button></Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rollback confirmation */}
      <AlertDialog open={!!rollbackBatch} onOpenChange={(o) => { if (!o) setRollbackBatch(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Roll back this import?</AlertDialogTitle>
            <AlertDialogDescription>
              All {rollbackBatch?.imported} record(s) created by "{rollbackBatch?.fileName || "this import"}" will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (rollbackBatch) void runRollback(rollbackBatch); setRollbackBatch(null); }}>
              Roll Back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
