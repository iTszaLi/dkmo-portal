import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db, membersTable, importBatchesTable, paymentsTable, frfContributionsTable, loansTable } from "@workspace/db";
import { z } from "zod";
import { requireAuth, requireRole, type AuthedRequest } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { getUserById } from "../lib/users";

/**
 * Legacy member import module (Admin → Data Management → Import Members).
 *
 * The client parses the uploaded file (TXT/CSV/XLSX) and sends mapped rows as
 * JSON. The server is authoritative: it re-cleans, re-validates and re-checks
 * duplicates on BOTH the analyze (dry-run) and commit endpoints, so nothing
 * the client sends is trusted.
 */

const router: IRouter = Router();
router.use(requireAuth);

const MAX_ROWS = 20_000;
const BATCH_SIZE = 500;

// ── Row schema (all optional strings; server cleans/validates) ───────────────
const RawRow = z.object({
  rowNumber: z.number().int().min(1),
  legacyMemberId: z.string().max(100).optional(),
  applicationNumber: z.string().max(100).optional(),
  oldApplicationNumber: z.string().max(100).optional(),
  fullName: z.string().max(300).optional(),
  mobileNumber: z.string().max(50).optional(),
  whatsappNumber: z.string().max(50).optional(),
  iqamaNumber: z.string().max(50).optional(),
  passportNumber: z.string().max(50).optional(),
  jamaath: z.string().max(200).optional(),
  nativePlace: z.string().max(200).optional(),
  city: z.string().max(200).optional(),
  country: z.string().max(200).optional(),
  dateOfBirth: z.string().max(50).optional(),
  memberGroup: z.string().max(200).optional(),
});
type RawRowT = z.infer<typeof RawRow>;

const AnalyzeBody = z.object({ rows: z.array(RawRow).min(1).max(MAX_ROWS) });

const CommitBody = z.object({
  fileName: z.string().max(300).default(""),
  fileSize: z.number().int().min(0).default(0),
  rows: z.array(RawRow).min(1).max(MAX_ROWS),
  // rowNumber → how to handle a duplicate row. Default: skip.
  resolutions: z.record(z.string(), z.enum(["skip", "update", "import"])).default({}),
});

// ── Cleaning helpers ──────────────────────────────────────────────────────────
function cleanText(v: string | undefined): string {
  if (!v) return "";
  // Strip control/zero-width chars, collapse whitespace, trim.
  const cleaned = v
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Common "empty" placeholders from legacy exports become blank.
  if (/^(null|nil|n\/a|na|none|-{1,3}|\.)$/i.test(cleaned)) return "";
  return cleaned;
}

function properCase(name: string): string {
  // Leave non-Latin (e.g. Arabic) untouched; title-case Latin words.
  if (!/[a-z]/i.test(name)) return name;
  return name
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Normalize any legacy Saudi mobile format to 05XXXXXXXX; return "" if not valid. */
export function normalizeSaudiMobile(v: string): string {
  const digits = v.replace(/\D/g, "");
  let core = "";
  if (/^9665\d{8}$/.test(digits)) core = digits.slice(3); // 9665XXXXXXXX
  else if (/^009665\d{8}$/.test(digits)) core = digits.slice(5);
  else if (/^05\d{8}$/.test(digits)) core = digits.slice(1); // 05XXXXXXXX
  else if (/^5\d{8}$/.test(digits)) core = digits; // 5XXXXXXXX
  else return "";
  return `0${core}`;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** Convert common legacy date formats to YYYY-MM-DD; return "" if unparseable. */
export function normalizeDate(v: string): string {
  const s = v.trim();
  if (!s) return "";
  let y = 0, m = 0, d = 0;
  let match: RegExpMatchArray | null;
  if ((match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) {
    y = +match[1]!; m = +match[2]!; d = +match[3]!;
  } else if ((match = s.match(/^(\d{1,2})[-/. ]([A-Za-z]{3,})[-/. ](\d{2,4})$/))) {
    // 17-Sep-81, 17 September 1981
    const mon = MONTHS[match[2]!.slice(0, 3).toLowerCase()];
    if (!mon) return "";
    d = +match[1]!; m = +mon; y = expandYear(+match[3]!);
  } else if ((match = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) {
    // DD/MM/YYYY (legacy default) — but MM-DD-YYYY when first part > 12 impossible;
    // if second part > 12, treat as MM-DD-YYYY (US export).
    const a = +match[1]!, b = +match[2]!;
    y = expandYear(+match[3]!);
    if (b > 12 && a <= 12) { m = a; d = b; } else { d = a; m = b; }
  } else {
    return "";
  }
  if (y < 1900 || y > new Date().getFullYear() || m < 1 || m > 12 || d < 1 || d > 31) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function expandYear(y: number): number {
  if (y >= 100) return y;
  return y <= 30 ? 2000 + y : 1900 + y;
}

function normKey(v: string): string {
  return v.replace(/\s+/g, " ").trim().toLowerCase();
}

// ── Cleaning + validation ────────────────────────────────────────────────────
interface CleanRow {
  rowNumber: number;
  legacyMemberId: string;
  applicationNumber: string;
  oldApplicationNumber: string;
  fullName: string;
  mobileNumber: string;
  whatsappNumber: string;
  iqamaNumber: string;
  passportNumber: string;
  jamaath: string;
  nativePlace: string;
  city: string;
  country: string;
  dateOfBirth: string;
  memberGroup: string;
  errors: string[];
  warnings: string[];
  isBlank: boolean;
}

function cleanAndValidate(raw: RawRowT): CleanRow {
  const errors: string[] = [];
  const warnings: string[] = [];

  const fullName = properCase(cleanText(raw.fullName));
  const mobileRaw = cleanText(raw.mobileNumber);
  const mobileNumber = mobileRaw ? normalizeSaudiMobile(mobileRaw) : "";
  const whatsappRaw = cleanText(raw.whatsappNumber);
  const whatsappNumber = whatsappRaw ? normalizeSaudiMobile(whatsappRaw) || whatsappRaw : "";
  const dobRaw = cleanText(raw.dateOfBirth);
  const dateOfBirth = dobRaw ? normalizeDate(dobRaw) : "";

  const row: CleanRow = {
    rowNumber: raw.rowNumber,
    legacyMemberId: cleanText(raw.legacyMemberId),
    applicationNumber: cleanText(raw.applicationNumber),
    oldApplicationNumber: cleanText(raw.oldApplicationNumber),
    fullName,
    mobileNumber,
    whatsappNumber,
    iqamaNumber: cleanText(raw.iqamaNumber),
    passportNumber: cleanText(raw.passportNumber),
    jamaath: cleanText(raw.jamaath),
    nativePlace: properCase(cleanText(raw.nativePlace)),
    city: properCase(cleanText(raw.city)) || "Riyadh",
    country: properCase(cleanText(raw.country)) || "Saudi Arabia",
    dateOfBirth,
    memberGroup: cleanText(raw.memberGroup),
    errors,
    warnings,
    isBlank: false,
  };

  row.isBlank = !row.fullName && !mobileRaw && !row.iqamaNumber && !row.legacyMemberId;
  if (row.isBlank) return row;

  if (!row.fullName) errors.push("Missing name");
  if (!mobileRaw) errors.push("Missing mobile number");
  else if (!mobileNumber) errors.push(`Invalid mobile number "${mobileRaw}"`);
  if (dobRaw && !dateOfBirth) warnings.push(`Unrecognized date of birth "${dobRaw}" — left blank`);
  if (whatsappRaw && whatsappNumber === whatsappRaw && !normalizeSaudiMobile(whatsappRaw))
    warnings.push("WhatsApp number kept as-is (not a Saudi format)");
  return row;
}

// ── Duplicate detection against existing members + within the file ──────────
interface DupInfo {
  memberId: string;
  membershipId: string;
  memberName: string;
  reasons: string[];
  likelySame: boolean;
}

async function buildExistingIndexes() {
  const existing = await db
    .select({
      id: membersTable.id,
      fullName: membersTable.fullName,
      membershipId: membersTable.membershipId,
      mobileNumber: membersTable.mobileNumber,
      iqamaNumber: membersTable.iqamaNumber,
      passportNumber: membersTable.passportNumber,
      applicationNumber: membersTable.applicationNumber,
      legacyMemberId: membersTable.legacyMemberId,
      jamaath: membersTable.jamaath,
      memberGroup: membersTable.memberGroup,
    })
    .from(membersTable);
  const byMobile = new Map<string, (typeof existing)[number]>();
  const byIqama = new Map<string, (typeof existing)[number]>();
  const byPassport = new Map<string, (typeof existing)[number]>();
  const byAppNo = new Map<string, (typeof existing)[number]>();
  const byLegacy = new Map<string, (typeof existing)[number]>();
  const jamaaths = new Map<string, string>();
  const groups = new Map<string, string>();
  for (const m of existing) {
    const mob = normalizeSaudiMobile(m.mobileNumber) || m.mobileNumber.replace(/\D/g, "");
    if (mob) byMobile.set(mob, m);
    if (m.iqamaNumber) byIqama.set(normKey(m.iqamaNumber), m);
    if (m.passportNumber) byPassport.set(normKey(m.passportNumber), m);
    if (m.applicationNumber) byAppNo.set(normKey(m.applicationNumber), m);
    if (m.legacyMemberId) byLegacy.set(normKey(m.legacyMemberId), m);
    if (m.jamaath) jamaaths.set(normKey(m.jamaath), m.jamaath);
    if (m.memberGroup) groups.set(normKey(m.memberGroup), m.memberGroup);
  }
  return { byMobile, byIqama, byPassport, byAppNo, byLegacy, jamaaths, groups };
}

/** Very light fuzzy match: names share ≥60% of normalized tokens. */
function namesLikelySame(a: string, b: string): boolean {
  const ta = new Set(normKey(a).split(" "));
  const tb = new Set(normKey(b).split(" "));
  if (ta.size === 0 || tb.size === 0) return false;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / Math.min(ta.size, tb.size) >= 0.6;
}

function findDuplicate(
  row: CleanRow,
  idx: Awaited<ReturnType<typeof buildExistingIndexes>>,
): DupInfo | null {
  const reasons: string[] = [];
  let hit: { id: string; fullName: string; membershipId: string } | null = null;
  const checks: Array<[string, Map<string, { id: string; fullName: string; membershipId: string }>, string]> = [
    [row.mobileNumber, idx.byMobile, "Same mobile number"],
    [row.iqamaNumber ? normKey(row.iqamaNumber) : "", idx.byIqama, "Same Iqama number"],
    [row.passportNumber ? normKey(row.passportNumber) : "", idx.byPassport, "Same passport number"],
    [row.applicationNumber ? normKey(row.applicationNumber) : "", idx.byAppNo, "Same application number"],
    [row.legacyMemberId ? normKey(row.legacyMemberId) : "", idx.byLegacy, "Same legacy member ID"],
  ];
  for (const [key, map, reason] of checks) {
    if (!key) continue;
    const m = map.get(key);
    if (m) {
      reasons.push(reason);
      if (!hit) hit = m;
    }
  }
  if (!hit) return null;
  return {
    memberId: hit.id,
    membershipId: hit.membershipId,
    memberName: hit.fullName,
    reasons,
    likelySame: namesLikelySame(row.fullName, hit.fullName),
  };
}

interface AnalyzedRow {
  row: CleanRow;
  duplicate: DupInfo | null;
  fileDuplicateOfRow: number | null;
  status: "valid" | "invalid" | "duplicate" | "blank";
}

function analyzeRows(
  rawRows: RawRowT[],
  idx: Awaited<ReturnType<typeof buildExistingIndexes>>,
): AnalyzedRow[] {
  const out: AnalyzedRow[] = [];
  const seenMobiles = new Map<string, number>();
  for (const raw of rawRows) {
    const row = cleanAndValidate(raw);
    if (row.isBlank) {
      out.push({ row, duplicate: null, fileDuplicateOfRow: null, status: "blank" });
      continue;
    }
    if (row.errors.length > 0) {
      out.push({ row, duplicate: null, fileDuplicateOfRow: null, status: "invalid" });
      continue;
    }
    const fileDupOf = seenMobiles.get(row.mobileNumber) ?? null;
    if (fileDupOf === null) seenMobiles.set(row.mobileNumber, row.rowNumber);
    const duplicate = findDuplicate(row, idx);
    // Normalize Jamaath / Group casing against existing values.
    if (row.jamaath) {
      const known = idx.jamaaths.get(normKey(row.jamaath));
      if (known) row.jamaath = known;
      else idx.jamaaths.set(normKey(row.jamaath), row.jamaath);
    }
    if (row.memberGroup) {
      const known = idx.groups.get(normKey(row.memberGroup));
      if (known) row.memberGroup = known;
      else idx.groups.set(normKey(row.memberGroup), row.memberGroup);
    }
    out.push({
      row,
      duplicate,
      fileDuplicateOfRow: fileDupOf,
      status: duplicate || fileDupOf !== null ? "duplicate" : "valid",
    });
  }
  return out;
}

// ── Analyze (dry run) ────────────────────────────────────────────────────────
router.post("/members/import/analyze", requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = AnalyzeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid rows payload" });
    return;
  }
  const idx = await buildExistingIndexes();
  const preexistingJamaaths = new Set(idx.jamaaths.keys());
  const preexistingGroups = new Set(idx.groups.keys());
  const analyzed = analyzeRows(parsed.data.rows, idx);

  const newJamaaths = [...idx.jamaaths.entries()].filter(([k]) => !preexistingJamaaths.has(k)).map(([, v]) => v);
  const newGroups = [...idx.groups.entries()].filter(([k]) => !preexistingGroups.has(k)).map(([, v]) => v);

  res.json({
    summary: {
      total: analyzed.length,
      valid: analyzed.filter((a) => a.status === "valid").length,
      invalid: analyzed.filter((a) => a.status === "invalid").length,
      duplicates: analyzed.filter((a) => a.status === "duplicate").length,
      blank: analyzed.filter((a) => a.status === "blank").length,
      withWarnings: analyzed.filter((a) => a.row.warnings.length > 0).length,
      newJamaaths,
      newGroups,
    },
    rows: analyzed.map((a) => ({
      rowNumber: a.row.rowNumber,
      status: a.status,
      cleaned: { ...a.row, errors: undefined, warnings: undefined, isBlank: undefined },
      errors: a.row.errors,
      warnings: a.row.warnings,
      duplicate: a.duplicate,
      fileDuplicateOfRow: a.fileDuplicateOfRow,
    })),
  });
});

// ── Commit ───────────────────────────────────────────────────────────────────
router.post("/members/import/commit", requireRole("admin"), async (req: AuthedRequest, res): Promise<void> => {
  const parsed = CommitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid import payload" });
    return;
  }
  const { fileName, fileSize, rows, resolutions } = parsed.data;
  const startedAt = Date.now();

  const idx = await buildExistingIndexes();
  const analyzed = analyzeRows(rows, idx);

  const failedRows: Array<{ rowNumber: number; reason: string }> = [];
  let imported = 0, updated = 0, skipped = 0, duplicates = 0;

  const user = req.userId ? getUserById(req.userId) : null;

  const [batch] = await db
    .insert(importBatchesTable)
    .values({
      fileName,
      fileSize,
      totalRows: analyzed.length,
      createdBy: req.userId ?? "",
      createdByName: user?.displayName ?? "",
    })
    .returning();
  const batchId = batch!.id;

  // Work list: inserts and updates decided up-front so batches are pure DB work.
  const toInsert: CleanRow[] = [];
  const toUpdate: Array<{ row: CleanRow; memberId: string }> = [];
  const seenFileMobiles = new Set<string>();

  for (const a of analyzed) {
    if (a.status === "blank") continue;
    if (a.status === "invalid") {
      failedRows.push({ rowNumber: a.row.rowNumber, reason: a.row.errors.join("; ") });
      continue;
    }
    if (a.status === "duplicate") {
      duplicates++;
      const resolution = resolutions[String(a.row.rowNumber)] ?? "skip";
      if (resolution === "skip") { skipped++; continue; }
      if (resolution === "update" && a.duplicate) { toUpdate.push({ row: a.row, memberId: a.duplicate.memberId }); continue; }
      if (resolution === "update" && !a.duplicate) { skipped++; continue; } // file-internal dup can't "update"
      // "import" falls through to insert
    }
    // Guard: never insert the same mobile twice within one run.
    if (seenFileMobiles.has(a.row.mobileNumber)) { skipped++; continue; }
    seenFileMobiles.add(a.row.mobileNumber);
    toInsert.push(a.row);
  }

  try {
    await db.transaction(async (tx) => {
      // Reserve sequential DKMO IDs from the shared sequence.
      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const chunk = toInsert.slice(i, i + BATCH_SIZE);
        const values = [];
        for (const row of chunk) {
          // next_dkmo_number() returns the fully formatted "DKMO-XXXX" ID.
          const result = await tx.execute(sql`SELECT next_dkmo_number() AS num`);
          const membershipId = String((result.rows[0] as { num: string }).num);
          values.push({
            fullName: row.fullName,
            mobileNumber: row.mobileNumber,
            membershipId,
            applicationNumber: row.applicationNumber,
            iqamaNumber: row.iqamaNumber,
            jamaath: row.jamaath,
            city: row.city,
            country: row.country,
            dateOfBirth: row.dateOfBirth,
            designation: "Member",
            feeStatus: "paid",
            feePaidAt: new Date(),
            feeUpdatedBy: req.userId ?? "import",
            frfStatus: "active",
            notes: "Imported from legacy database",
            legacyMemberId: row.legacyMemberId,
            oldApplicationNumber: row.oldApplicationNumber,
            whatsappNumber: row.whatsappNumber,
            passportNumber: row.passportNumber,
            nativePlace: row.nativePlace,
            memberGroup: row.memberGroup,
            importBatchId: batchId,
          });
        }
        if (values.length > 0) {
          await tx.insert(membersTable).values(values);
          imported += values.length;
        }
      }

      // Updates: fill legacy fields and any blank existing fields (never blank out data).
      for (const { row, memberId } of toUpdate) {
        await tx.execute(sql`
          UPDATE members SET
            legacy_member_id = CASE WHEN legacy_member_id = '' THEN ${row.legacyMemberId} ELSE legacy_member_id END,
            old_application_number = CASE WHEN old_application_number = '' THEN ${row.oldApplicationNumber} ELSE old_application_number END,
            whatsapp_number = CASE WHEN whatsapp_number = '' THEN ${row.whatsappNumber} ELSE whatsapp_number END,
            passport_number = CASE WHEN passport_number = '' THEN ${row.passportNumber} ELSE passport_number END,
            native_place = CASE WHEN native_place = '' THEN ${row.nativePlace} ELSE native_place END,
            member_group = CASE WHEN member_group = '' THEN ${row.memberGroup} ELSE member_group END,
            application_number = CASE WHEN application_number = '' THEN ${row.applicationNumber} ELSE application_number END,
            iqama_number = CASE WHEN iqama_number = '' THEN ${row.iqamaNumber} ELSE iqama_number END,
            jamaath = CASE WHEN jamaath = '' THEN ${row.jamaath} ELSE jamaath END,
            date_of_birth = CASE WHEN date_of_birth = '' THEN ${row.dateOfBirth} ELSE date_of_birth END,
            updated_at = NOW()
          WHERE id = ${memberId}::uuid
        `);
        updated++;
      }
    });
  } catch (err) {
    // Whole transaction rolled back — mark the batch as failed.
    await db
      .update(importBatchesTable)
      .set({ failed: analyzed.length, notes: "Import failed — no records were saved", durationMs: Date.now() - startedAt })
      .where(eq(importBatchesTable.id, batchId));
    throw err;
  }

  const durationMs = Date.now() - startedAt;
  await db
    .update(importBatchesTable)
    .set({ imported, updated, skipped, failed: failedRows.length, duplicates, durationMs })
    .where(eq(importBatchesTable.id, batchId));

  logAudit(req, "members_imported", "members", {
    entityId: batchId,
    entityName: fileName || "legacy import",
    details: `Imported ${imported}, updated ${updated}, skipped ${skipped}, failed ${failedRows.length}`,
  });

  res.json({ batchId, imported, updated, skipped, failed: failedRows.length, duplicates, durationMs, failedRows });
});

// ── History ──────────────────────────────────────────────────────────────────
router.get("/members/import/history", requireRole("admin"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(importBatchesTable).orderBy(desc(importBatchesTable.createdAt));
  res.json(rows);
});

// ── Rollback (undo an import's inserted members) ─────────────────────────────
router.post("/members/import/:id/rollback", requireRole("admin"), async (req: AuthedRequest, res): Promise<void> => {
  const batchId = String(req.params.id);
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) { res.status(400).json({ error: "Invalid import id" }); return; }
  const [batch] = await db.select().from(importBatchesTable).where(eq(importBatchesTable.id, batchId));
  if (!batch) { res.status(404).json({ error: "Import not found" }); return; }
  if (batch.rolledBack) { res.status(400).json({ error: "This import was already undone" }); return; }

  // The dependency check and delete run in ONE transaction so a concurrent
  // payment/loan insert cannot slip between them: the guarded DELETE only
  // removes members with no dependents, and if any member of the batch would
  // survive, the whole transaction aborts and nothing is deleted.
  let result: number;
  try {
    result = await db.transaction(async (tx) => {
      // Lock the batch's member rows; concurrent FK inserts referencing a row
      // being deleted will conflict inside this transaction instead of racing.
      await tx.execute(sql`
        SELECT id FROM members WHERE import_batch_id = ${batchId}::uuid FOR UPDATE
      `);
      const deleted = (
        await tx.execute(sql`
          DELETE FROM members m
          WHERE m.import_batch_id = ${batchId}::uuid
            AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.member_id = m.id)
            AND NOT EXISTS (SELECT 1 FROM frf_contributions fc WHERE fc.member_id = m.id AND fc.amount_paid > 0)
            AND NOT EXISTS (SELECT 1 FROM loans l WHERE l.member_id = m.id)
          RETURNING m.id
        `)
      ).rows.length;
      const [{ remaining }] = (
        await tx.execute(sql`
          SELECT COUNT(*)::int AS remaining FROM members WHERE import_batch_id = ${batchId}::uuid
        `)
      ).rows as Array<{ remaining: number }>;
      if (remaining > 0) {
        // Abort — some members have dependents; roll everything back.
        throw Object.assign(new Error("ROLLBACK_BLOCKED"), { remaining });
      }
      await tx
        .update(importBatchesTable)
        .set({ rolledBack: true, rolledBackAt: new Date(), notes: `Undone — ${deleted} member(s) removed` })
        .where(eq(importBatchesTable.id, batchId));
      return deleted;
    });
  } catch (err) {
    if (err instanceof Error && err.message === "ROLLBACK_BLOCKED") {
      const remaining = (err as Error & { remaining?: number }).remaining ?? 0;
      res.status(400).json({
        error: `Cannot undo: ${remaining} imported member(s) already have payments, FRF payments or loans. Remove those records first.`,
      });
      return;
    }
    throw err;
  }

  logAudit(req, "members_import_rolled_back", "members", {
    entityId: batchId,
    entityName: batch.fileName || "legacy import",
    details: `Removed ${result} imported member(s)`,
  });
  res.json({ removed: result });
});

export default router;
