import { Router, type IRouter } from "express";
import { desc, eq, and, sql } from "drizzle-orm";
import {
  db,
  membersTable,
  paymentsTable,
  receiptsTable,
  frfClaimsTable,
  frfContributionsTable,
  sponsorsTable,
  eventsTable,
  importBatchesTable,
} from "@workspace/db";
import { z } from "zod";
import { requireAuth, requireRole, type AuthedRequest } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { getUserById } from "../lib/users";
import { normalizeSaudiMobile, normalizeDate } from "./member-import";
import { syncMemberFrfEligibility } from "../lib/frf-ledger";

/**
 * Generic legacy data import (Payments / Receipts / FRF Contributions /
 * Sponsors / Events). Same architecture as the Members importer: the client
 * parses the file and sends mapped rows; the server re-cleans, re-validates
 * and re-checks duplicates on both analyze (dry run) and commit. Each commit
 * creates an import_batches row (entity column) and stamps created rows with
 * import_batch_id so a batch can be rolled back.
 */

const router: IRouter = Router();
router.use(requireAuth);

const MAX_ROWS = 20_000;
const ENTITIES = ["payments", "receipts", "frf", "sponsors", "events"] as const;
type Entity = (typeof ENTITIES)[number];

const RawRow = z
  .object({ rowNumber: z.number().int().min(1) })
  .catchall(z.string().max(2000).optional());
type RawRowT = z.infer<typeof RawRow>;

const AnalyzeBody = z.object({ rows: z.array(RawRow).min(1).max(MAX_ROWS) });
const CommitBody = z.object({
  fileName: z.string().max(300).default(""),
  fileSize: z.number().int().min(0).default(0),
  rows: z.array(RawRow).min(1).max(MAX_ROWS),
});

function cleanText(v: unknown): string {
  if (typeof v !== "string" || !v) return "";
  const cleaned = v
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(null|nil|n\/a|na|none|-{1,3}|\.)$/i.test(cleaned)) return "";
  return cleaned;
}

function normKey(v: string): string {
  return v.replace(/\s+/g, " ").trim().toLowerCase();
}

function parseAmount(v: string): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

interface CleanedRow {
  rowNumber: number;
  values: Record<string, string>;
  display: Record<string, string>;
  errors: string[];
  warnings: string[];
  isBlank: boolean;
  dupKey: string;
  dupReason: string;
  memberId?: string;
  memberName?: string;
  claimId?: string;
}

interface AnalyzedRow {
  rowNumber: number;
  status: "valid" | "invalid" | "duplicate" | "blank";
  display: Record<string, string>;
  errors: string[];
  warnings: string[];
  duplicateReason: string;
}

// ── Member / claim lookup indexes ────────────────────────────────────────────
async function buildMemberIndex() {
  const members = await db
    .select({
      id: membersTable.id,
      fullName: membersTable.fullName,
      membershipId: membersTable.membershipId,
      legacyMemberId: membersTable.legacyMemberId,
      mobileNumber: membersTable.mobileNumber,
      jamaath: membersTable.jamaath,
      whatsappNumber: membersTable.whatsappNumber,
    })
    .from(membersTable);
  const idx = new Map<string, (typeof members)[number]>();
  for (const m of members) {
    if (m.legacyMemberId) idx.set(`legacy:${normKey(m.legacyMemberId)}`, m);
    idx.set(`dkmo:${normKey(m.membershipId)}`, m);
    const mob = normalizeSaudiMobile(m.mobileNumber) || m.mobileNumber.replace(/\D/g, "");
    if (mob) idx.set(`mob:${mob}`, m);
    idx.set(`name:${normKey(m.fullName)}`, m);
  }
  return idx;
}

function findMember(
  ref: string,
  idx: Awaited<ReturnType<typeof buildMemberIndex>>,
): { id: string; fullName: string; membershipId: string; jamaath: string; mobileNumber: string; whatsappNumber: string } | null {
  const k = normKey(ref);
  if (!k) return null;
  return (
    idx.get(`legacy:${k}`) ??
    idx.get(`dkmo:${k}`) ??
    idx.get(`mob:${normalizeSaudiMobile(ref) || ref.replace(/\D/g, "")}`) ??
    idx.get(`name:${k}`) ??
    null
  );
}

async function buildClaimIndex() {
  const claims = await db
    .select({ id: frfClaimsTable.id, claimantName: frfClaimsTable.claimantName, title: frfClaimsTable.title })
    .from(frfClaimsTable);
  const idx = new Map<string, string>();
  for (const c of claims) {
    if (c.claimantName) idx.set(normKey(c.claimantName), c.id);
    if (c.title) idx.set(normKey(c.title), c.id);
    idx.set(normKey(c.id), c.id);
  }
  return idx;
}

// ── Per-entity cleaning / validation ─────────────────────────────────────────
interface Ctx {
  memberIdx: Awaited<ReturnType<typeof buildMemberIndex>> | null;
  claimIdx: Map<string, string> | null;
  existingDupKeys: Set<string>;
}

async function buildCtx(entity: Entity): Promise<Ctx> {
  const ctx: Ctx = { memberIdx: null, claimIdx: null, existingDupKeys: new Set() };
  if (entity === "payments" || entity === "frf" || entity === "receipts") ctx.memberIdx = await buildMemberIndex();
  if (entity === "frf") ctx.claimIdx = await buildClaimIndex();

  if (entity === "payments") {
    const rows = await db
      .select({ memberId: paymentsTable.memberId, amountPaid: paymentsTable.amountPaid, paidAt: paymentsTable.paidAt, receiptNumber: paymentsTable.receiptNumber })
      .from(paymentsTable);
    for (const r of rows) {
      const day = r.paidAt.toISOString().slice(0, 10);
      ctx.existingDupKeys.add(`${r.memberId}|${day}|${Number(r.amountPaid)}`);
      if (r.receiptNumber) ctx.existingDupKeys.add(`bill:${normKey(r.receiptNumber)}`);
    }
  } else if (entity === "receipts") {
    const rows = await db.select({ receiptNumber: receiptsTable.receiptNumber }).from(receiptsTable);
    for (const r of rows) ctx.existingDupKeys.add(normKey(r.receiptNumber));
  } else if (entity === "frf") {
    const rows = await db
      .select({ claimId: frfContributionsTable.claimId, memberId: frfContributionsTable.memberId })
      .from(frfContributionsTable);
    for (const r of rows) ctx.existingDupKeys.add(`${r.claimId}|${r.memberId}`);
  } else if (entity === "sponsors") {
    const rows = await db.select({ sponsorName: sponsorsTable.sponsorName }).from(sponsorsTable);
    for (const r of rows) ctx.existingDupKeys.add(normKey(r.sponsorName));
  } else if (entity === "events") {
    const rows = await db.select({ name: eventsTable.name, eventDate: eventsTable.eventDate }).from(eventsTable);
    for (const r of rows) ctx.existingDupKeys.add(`${normKey(r.name)}|${r.eventDate ? r.eventDate.toISOString().slice(0, 10) : ""}`);
  }
  return ctx;
}

function cleanRow(entity: Entity, raw: RawRowT, ctx: Ctx): CleanedRow {
  const g = (k: string) => cleanText(raw[k]);
  const errors: string[] = [];
  const warnings: string[] = [];
  const row: CleanedRow = {
    rowNumber: raw.rowNumber,
    values: {},
    display: {},
    errors,
    warnings,
    isBlank: false,
    dupKey: "",
    dupReason: "",
  };

  if (entity === "payments") {
    const memberRef = g("memberRef");
    const amount = parseAmount(g("amount"));
    const dateRaw = g("date");
    const date = dateRaw ? normalizeDate(dateRaw) : "";
    const billNo = g("billNo");
    const details = g("details");
    const remarks = g("remarks");
    row.isBlank = !memberRef && amount === null && !billNo;
    if (row.isBlank) return row;
    const member = memberRef && ctx.memberIdx ? findMember(memberRef, ctx.memberIdx) : null;
    if (!memberRef) errors.push("Missing member reference (Id No / DKMO ID / mobile)");
    else if (!member) errors.push(`Member "${memberRef}" was not found in the portal`);
    if (amount === null || amount <= 0) errors.push(`Missing or invalid amount "${g("amount")}"`);
    if (dateRaw && !date) warnings.push(`Unrecognized date "${dateRaw}" — today's date will be used`);
    row.memberId = member?.id;
    row.memberName = member?.fullName;
    row.values = { amount: String(amount ?? ""), date, billNo, details, remarks };
    row.display = { Member: member ? `${member.fullName} (${member.membershipId})` : memberRef, Amount: amount !== null ? amount.toFixed(2) : g("amount"), Date: date || dateRaw, "Bill No": billNo, Details: details };
    if (member && amount !== null) {
      const day = date || new Date().toISOString().slice(0, 10);
      row.dupKey = `${member.id}|${day}|${amount}`;
      row.dupReason = "Same member, date and amount as an existing payment";
      if (billNo && ctx.existingDupKeys.has(`bill:${normKey(billNo)}`)) {
        row.dupKey = `bill:${normKey(billNo)}`;
        row.dupReason = `Bill number "${billNo}" already exists`;
      }
    }
  } else if (entity === "receipts") {
    const receiptNumber = g("receiptNumber");
    const memberRef = g("memberRef");
    const memberName = g("memberName");
    const amount = parseAmount(g("amount"));
    const dateRaw = g("date");
    const date = dateRaw ? normalizeDate(dateRaw) : "";
    row.isBlank = !receiptNumber && !memberName && !memberRef && amount === null;
    if (row.isBlank) return row;
    const member = memberRef && ctx.memberIdx ? findMember(memberRef, ctx.memberIdx) : (memberName && ctx.memberIdx ? findMember(memberName, ctx.memberIdx) : null);
    if (!receiptNumber) errors.push("Missing receipt number");
    if (!memberName && !member) errors.push("Missing member name");
    if (amount === null || amount < 0) errors.push(`Missing or invalid amount "${g("amount")}"`);
    if (dateRaw && !date) warnings.push(`Unrecognized receipt date "${dateRaw}" — kept as written`);
    row.memberId = member?.id;
    row.values = {
      receiptNumber,
      receiptDate: date || dateRaw,
      memberName: memberName || member?.fullName || "",
      dkmoId: member?.membershipId ?? "",
      jamathName: member?.jamaath ?? g("jamathName"),
      mobileNumber: member?.mobileNumber ?? g("mobileNumber"),
      whatsappNumber: member?.whatsappNumber ?? g("whatsappNumber"),
      amount: String(amount ?? 0),
      paymentTypes: g("paymentTypes"),
    };
    row.display = { "Receipt No": receiptNumber, Member: row.values.memberName, Amount: amount !== null ? amount.toFixed(2) : "", Date: row.values.receiptDate };
    row.dupKey = normKey(receiptNumber);
    row.dupReason = `Receipt number "${receiptNumber}" already exists`;
  } else if (entity === "frf") {
    const memberRef = g("memberRef");
    const claimRef = g("claimRef");
    const amount = parseAmount(g("amount"));
    const dateRaw = g("date");
    const date = dateRaw ? normalizeDate(dateRaw) : "";
    const statusRaw = g("status").toLowerCase();
    row.isBlank = !memberRef && !claimRef;
    if (row.isBlank) return row;
    const member = memberRef && ctx.memberIdx ? findMember(memberRef, ctx.memberIdx) : null;
    const claimId = claimRef && ctx.claimIdx ? ctx.claimIdx.get(normKey(claimRef)) ?? null : null;
    if (!memberRef) errors.push("Missing member reference");
    else if (!member) errors.push(`Member "${memberRef}" was not found in the portal`);
    if (!claimRef) errors.push("Missing FRF claim reference (deceased/claimant name)");
    else if (!claimId) errors.push(`FRF claim "${claimRef}" was not found — create the claim first`);
    const paid = /paid|yes|true|1/.test(statusRaw) || (amount !== null && amount > 0);
    row.memberId = member?.id;
    row.memberName = member?.fullName;
    row.claimId = claimId ?? undefined;
    row.values = { amount: String(amount ?? 50), amountPaid: paid ? String(amount ?? 50) : "0", status: paid ? "paid" : "pending", paidAt: paid ? date : "" };
    row.display = { Member: member ? `${member.fullName} (${member.membershipId})` : memberRef, Claim: claimRef, Amount: String(amount ?? 50), Status: paid ? "Paid" : "Pending" };
    if (member && claimId) {
      row.dupKey = `${claimId}|${member.id}`;
      row.dupReason = "This member already has a contribution entry for this claim";
    }
  } else if (entity === "sponsors") {
    const sponsorName = g("sponsorName");
    const total = parseAmount(g("totalAmount"));
    const paid = parseAmount(g("paidAmount"));
    row.isBlank = !sponsorName;
    if (row.isBlank) return row;
    const tierRaw = normKey(g("tier"));
    const tier = ["platinum", "gold", "silver", "bronze"].includes(tierRaw) ? tierRaw : "bronze";
    const email = g("email").toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) warnings.push(`Invalid email "${email}" — left blank`);
    row.values = {
      sponsorName,
      company: g("company"),
      contactPerson: g("contactPerson"),
      phone: normalizeSaudiMobile(g("phone")) || g("phone"),
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
      tier,
      totalAmount: String(total ?? 0),
      paidAmount: String(paid ?? 0),
      notes: g("notes"),
    };
    row.display = { Sponsor: sponsorName, Company: row.values.company, Tier: tier, Total: row.values.totalAmount };
    row.dupKey = normKey(sponsorName);
    row.dupReason = `A sponsor named "${sponsorName}" already exists`;
  } else {
    // events
    const name = g("name");
    const dateRaw = g("date");
    const date = dateRaw ? normalizeDate(dateRaw) : "";
    const budget = parseAmount(g("budget"));
    row.isBlank = !name;
    if (row.isBlank) return row;
    if (dateRaw && !date) warnings.push(`Unrecognized event date "${dateRaw}" — left blank`);
    const past = date && date < new Date().toISOString().slice(0, 10);
    row.values = { name, date, location: g("location"), budget: String(budget ?? 0), description: g("description"), status: past ? "completed" : "upcoming" };
    row.display = { Event: name, Date: date || dateRaw, Location: row.values.location, Budget: row.values.budget };
    row.dupKey = `${normKey(name)}|${date}`;
    row.dupReason = `An event named "${name}" on the same date already exists`;
  }
  return row;
}

function analyzeAll(entity: Entity, rawRows: RawRowT[], ctx: Ctx): { rows: CleanedRow[]; analyzed: AnalyzedRow[] } {
  const rows: CleanedRow[] = [];
  const analyzed: AnalyzedRow[] = [];
  const seenInFile = new Set<string>();
  for (const raw of rawRows) {
    const row = cleanRow(entity, raw, ctx);
    let status: AnalyzedRow["status"];
    let duplicateReason = "";
    if (row.isBlank) status = "blank";
    else if (row.errors.length > 0) status = "invalid";
    else if (row.dupKey && (ctx.existingDupKeys.has(row.dupKey) || seenInFile.has(row.dupKey))) {
      status = "duplicate";
      duplicateReason = seenInFile.has(row.dupKey) ? "Duplicate of another row in this file" : row.dupReason;
    } else status = "valid";
    if (row.dupKey && status === "valid") seenInFile.add(row.dupKey);
    rows.push(row);
    analyzed.push({ rowNumber: row.rowNumber, status, display: row.display, errors: row.errors, warnings: row.warnings, duplicateReason });
  }
  return { rows, analyzed };
}

function summarize(analyzed: AnalyzedRow[]) {
  return {
    total: analyzed.length,
    valid: analyzed.filter((a) => a.status === "valid").length,
    invalid: analyzed.filter((a) => a.status === "invalid").length,
    duplicates: analyzed.filter((a) => a.status === "duplicate").length,
    blank: analyzed.filter((a) => a.status === "blank").length,
    withWarnings: analyzed.filter((a) => a.warnings.length > 0).length,
  };
}

function parseEntity(v: string): Entity | null {
  return (ENTITIES as readonly string[]).includes(v) ? (v as Entity) : null;
}

// ── Analyze ──────────────────────────────────────────────────────────────────
router.post("/import/:entity/analyze", requireRole("admin"), async (req, res): Promise<void> => {
  const entity = parseEntity(String(req.params.entity));
  if (!entity) { res.status(404).json({ error: "Unknown import type" }); return; }
  const parsed = AnalyzeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid rows payload" }); return; }
  const ctx = await buildCtx(entity);
  const { analyzed } = analyzeAll(entity, parsed.data.rows, ctx);
  res.json({ summary: summarize(analyzed), rows: analyzed });
});

// ── Commit ───────────────────────────────────────────────────────────────────
router.post("/import/:entity/commit", requireRole("admin"), async (req: AuthedRequest, res): Promise<void> => {
  const entity = parseEntity(String(req.params.entity));
  if (!entity) { res.status(404).json({ error: "Unknown import type" }); return; }
  const parsed = CommitBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid payload" }); return; }
  const started = Date.now();
  const ctx = await buildCtx(entity);
  const { rows, analyzed } = analyzeAll(entity, parsed.data.rows, ctx);
  const statusByRow = new Map(analyzed.map((a) => [a.rowNumber, a.status]));
  const toImport = rows.filter((r) => statusByRow.get(r.rowNumber) === "valid");
  const user = req.userId ? getUserById(req.userId) : null;

  let imported = 0;
  const batchId = await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(importBatchesTable)
      .values({
        entity,
        fileName: parsed.data.fileName,
        fileSize: parsed.data.fileSize,
        totalRows: rows.length,
        createdBy: req.userId ?? "",
        createdByName: user?.displayName ?? user?.username ?? "",
      })
      .returning({ id: importBatchesTable.id });
    const id = batch!.id;

    for (const row of toImport) {
      const v = row.values;
      if (entity === "payments") {
        const paymentType = /frf/i.test(v.details ?? "") ? "frf_contribution" : "membership_fee";
        const [insertedPayment] = await tx.insert(paymentsTable).values({
          memberId: row.memberId!,
          paymentType,
          amountDue: v.amount!,
          amountPaid: v.amount!,
          status: "paid",
          paymentMethod: "legacy",
          receiptNumber: v.billNo ?? "",
          notes: [v.details, v.remarks].filter(Boolean).join(" — ") || "Imported from legacy database",
          paidAt: v.date ? new Date(`${v.date}T12:00:00Z`) : new Date(),
          importBatchId: id,
        }).returning({ memberId: paymentsTable.memberId });
        if (paymentType === "membership_fee" && insertedPayment) {
          const [member] = await tx
            .select({ legacyMemberId: membersTable.legacyMemberId })
            .from(membersTable)
            .where(eq(membersTable.id, insertedPayment.memberId));
          if (member && !member.legacyMemberId) {
            const [updated] = await tx
              .update(membersTable)
              .set({
                feeStatus: "paid",
                feePaidAt: v.date ? new Date(`${v.date}T12:00:00Z`) : new Date(),
                feeUpdatedBy: req.userId ?? "import",
              })
              .where(eq(membersTable.id, insertedPayment.memberId))
              .returning({ feeStatus: membersTable.feeStatus });
            await syncMemberFrfEligibility(
              insertedPayment.memberId,
              updated?.feeStatus ?? "paid",
              tx,
            );
          }
        }
      } else if (entity === "receipts") {
        await tx.insert(receiptsTable).values({
          receiptNumber: v.receiptNumber!,
          receiptDate: v.receiptDate ?? "",
          memberName: v.memberName!,
          dkmoId: v.dkmoId ?? "",
          jamathName: v.jamathName ?? "",
          mobileNumber: v.mobileNumber ?? "",
          whatsappNumber: v.whatsappNumber ?? "",
          amount: v.amount ?? "0",
          paymentTypes: v.paymentTypes ?? "",
          createdBy: user?.displayName ?? user?.username ?? "import",
          importBatchId: id,
        });
      } else if (entity === "frf") {
        const [member] = await tx
          .select({ feeStatus: membersTable.feeStatus })
          .from(membersTable)
          .where(eq(membersTable.id, row.memberId!));
        const importedStatus =
          member?.feeStatus === "paid" || Number(v.amountPaid ?? 0) > 0
            ? v.status!
            : "cancelled";
        await tx.insert(frfContributionsTable).values({
          claimId: row.claimId!,
          memberId: row.memberId!,
          amount: v.amount!,
          amountPaid: v.amountPaid!,
          status: importedStatus,
          paidAt: v.status === "paid" ? (v.paidAt ? new Date(`${v.paidAt}T12:00:00Z`) : new Date()) : null,
          importBatchId: id,
        });
      } else if (entity === "sponsors") {
        await tx.insert(sponsorsTable).values({
          sponsorName: v.sponsorName!,
          company: v.company ?? "",
          contactPerson: v.contactPerson ?? "",
          phone: v.phone ?? "",
          email: v.email ?? "",
          tier: v.tier ?? "bronze",
          totalAmount: v.totalAmount ?? "0",
          paidAmount: v.paidAmount ?? "0",
          status: Number(v.paidAmount ?? 0) >= Number(v.totalAmount ?? 0) && Number(v.totalAmount ?? 0) > 0 ? "received" : "pending",
          notes: v.notes ?? "",
          importBatchId: id,
        });
      } else {
        await tx.insert(eventsTable).values({
          name: v.name!,
          eventDate: v.date ? new Date(`${v.date}T12:00:00Z`) : null,
          location: v.location ?? "",
          budget: v.budget ?? "0",
          description: v.description ?? "",
          status: v.status ?? "upcoming",
          importBatchId: id,
        });
      }
      imported++;
    }

    const summary = summarize(analyzed);
    await tx
      .update(importBatchesTable)
      .set({
        imported,
        skipped: summary.duplicates + summary.blank,
        failed: summary.invalid,
        duplicates: summary.duplicates,
        durationMs: Date.now() - started,
      })
      .where(eq(importBatchesTable.id, id));
    return id;
  });

  await logAudit(req, `${entity}_import_committed`, "import", { entityId: batchId, details: JSON.stringify({ imported, fileName: parsed.data.fileName }) });
  const summary = summarize(analyzed);
  res.json({
    batchId,
    imported,
    skipped: summary.duplicates + summary.blank,
    failed: summary.invalid,
    duplicates: summary.duplicates,
    durationMs: Date.now() - started,
    failedRows: analyzed.filter((a) => a.status === "invalid").map((a) => ({ rowNumber: a.rowNumber, errors: a.errors })),
  });
});

// ── History ──────────────────────────────────────────────────────────────────
router.get("/import/:entity/history", requireRole("admin"), async (req, res): Promise<void> => {
  const entity = parseEntity(String(req.params.entity));
  if (!entity) { res.status(404).json({ error: "Unknown import type" }); return; }
  const batches = await db
    .select()
    .from(importBatchesTable)
    .where(eq(importBatchesTable.entity, entity))
    .orderBy(desc(importBatchesTable.createdAt));
  res.json(batches);
});

// ── Rollback ─────────────────────────────────────────────────────────────────
router.post("/import/:entity/:id/rollback", requireRole("admin"), async (req: AuthedRequest, res): Promise<void> => {
  const entity = parseEntity(String(req.params.entity));
  if (!entity) { res.status(404).json({ error: "Unknown import type" }); return; }
  const id = z.string().uuid().safeParse(String(req.params.id));
  if (!id.success) { res.status(400).json({ error: "Invalid batch id" }); return; }
  const [batch] = await db.select().from(importBatchesTable).where(eq(importBatchesTable.id, id.data));
  if (!batch || batch.entity !== entity) { res.status(404).json({ error: "Import batch not found" }); return; }
  if (batch.rolledBack) { res.status(400).json({ error: "This import was already rolled back" }); return; }

  const table =
    entity === "payments" ? paymentsTable :
    entity === "receipts" ? receiptsTable :
    entity === "frf" ? frfContributionsTable :
    entity === "sponsors" ? sponsorsTable : eventsTable;

  let removed = 0;
  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(table)
      .where(eq(table.importBatchId, id.data))
      .returning({ id: table.id });
    removed = deleted.length;
    await tx
      .update(importBatchesTable)
      .set({ rolledBack: true, rolledBackAt: new Date() })
      .where(eq(importBatchesTable.id, id.data));
  });
  await logAudit(req, `${entity}_import_rolled_back`, "import", { entityId: id.data, details: JSON.stringify({ removed }) });
  res.json({ removed });
});

export default router;
