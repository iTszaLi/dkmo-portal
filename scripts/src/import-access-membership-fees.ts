import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pool } from "@workspace/db";

type CsvRow = Record<string, string>;

type EvidenceGroup = {
  legacyMemberId: string;
  status: "paid" | "review";
  amount: number | null;
  paidAt: string | null;
  records: CsvRow[];
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.endsWith("\r") ? cell.slice(0, -1) : cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function readCsv(path: string): CsvRow[] {
  const rows = parseCsv(readFileSync(path, "utf8"));
  const headers = rows.shift() ?? [];
  return rows
    .filter((row) => row.some((value) => value !== ""))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function buildEvidence(rows: CsvRow[]): EvidenceGroup[] {
  const grouped = new Map<string, CsvRow[]>();
  for (const row of rows) {
    if (row.inferred_payment_type !== "membership_fee") continue;
    const legacyMemberId = row.legacy_member_id?.trim() ?? "";
    if (!/^\d+$/.test(legacyMemberId)) {
      throw new Error(`Membership-fee source row ${row.source_row || "?"} has no numeric Access member ID`);
    }
    const records = grouped.get(legacyMemberId) ?? [];
    records.push(row);
    grouped.set(legacyMemberId, records);
  }

  return [...grouped.entries()]
    .map(([legacyMemberId, records]) => {
      const knownAmounts = records
        .map((record) => record.amount?.trim() ?? "")
        .filter(Boolean)
        .map(Number);
      if (knownAmounts.some((amount) => !Number.isFinite(amount))) {
        throw new Error(`Access member ${legacyMemberId} has an invalid membership-fee amount`);
      }
      const paymentDates = records
        .map((record) => record.payment_date?.trim() ?? "")
        .filter(Boolean)
        .sort();
      return {
        legacyMemberId,
        status: records.some((record) => record.historical_status === "paid") ? "paid" : "review",
        amount: knownAmounts.length > 0
          ? Math.round(knownAmounts.reduce((sum, amount) => sum + amount, 0) * 100) / 100
          : null,
        paidAt: paymentDates.at(-1) ?? null,
        records,
      } satisfies EvidenceGroup;
    })
    .sort((left, right) => Number(left.legacyMemberId) - Number(right.legacyMemberId));
}

async function main() {
  const workspaceRoot = resolve(process.cwd(), "..");
  const sourcePath = resolve(
    workspaceRoot,
    process.argv[2] ?? ".agents/outputs/dkmo-access-migration-audit/migration_payments_preview.csv",
  );
  const evidence = buildEvidence(readCsv(sourcePath));
  const sourceRows = evidence.reduce((sum, group) => sum + group.records.length, 0);
  const paidMembers = evidence.filter((group) => group.status === "paid").length;
  const reviewMembers = evidence.filter((group) => group.status === "review").length;
  const knownAmountTotal = evidence.reduce((sum, group) => sum + (group.amount ?? 0), 0);

  if (
    sourceRows !== 1_118
    || evidence.length !== 1_097
    || paidMembers !== 1_096
    || reviewMembers !== 1
    || knownAmountTotal !== 108_500
  ) {
    throw new Error(
      `Access fee evidence validation failed: rows=${sourceRows}, members=${evidence.length}, `
      + `paid=${paidMembers}, review=${reviewMembers}, amount=${knownAmountTotal}`,
    );
  }

  const legacyMembers = await pool.query<{
    legacy_member_id: string;
    membership_id: string;
  }>(`
    SELECT legacy_member_id, membership_id
    FROM members
    WHERE legacy_member_id <> ''
  `);
  const portalAccessIds = new Set(legacyMembers.rows.map((row) => row.legacy_member_id));
  const portalMembershipIds = new Set(legacyMembers.rows.map((row) => row.membership_id));
  if (
    legacyMembers.rows.length !== 1_118
    || portalAccessIds.size !== 1_118
    || portalMembershipIds.size !== 1_118
  ) {
    throw new Error(
      `Portal member identity validation failed: rows=${legacyMembers.rows.length}, `
      + `Access IDs=${portalAccessIds.size}, Portal IDs=${portalMembershipIds.size}`,
    );
  }
  const unmatchedEvidenceIds = evidence
    .map((group) => group.legacyMemberId)
    .filter((legacyMemberId) => !portalAccessIds.has(legacyMemberId));
  const evidenceIdSet = new Set(evidence.map((group) => group.legacyMemberId));
  const noEvidenceIds = [...portalAccessIds]
    .filter((legacyMemberId) => !evidenceIdSet.has(legacyMemberId))
    .sort((left, right) => Number(left) - Number(right));
  if (unmatchedEvidenceIds.length > 0 || noEvidenceIds.length !== 21) {
    throw new Error(
      `Access/Portal ID set validation failed: unmatched evidence IDs=${unmatchedEvidenceIds.join(",") || "none"}, `
      + `no-evidence Portal IDs=${noEvidenceIds.length}`,
    );
  }

  const before = await pool.query(`
    SELECT membership_id, legacy_member_id, membership_fee, fee_status, fee_paid_at,
      legacy_raw_record->'membershipFeeEvidence' AS previous_evidence
    FROM members
    WHERE legacy_member_id <> ''
    ORDER BY legacy_member_id::int
  `);
  const backupPath = resolve(
    workspaceRoot,
    ".agents/outputs/dkmo-access-migration-audit/access_membership_fees_before_reconciliation.json",
  );
  writeFileSync(backupPath, JSON.stringify(before.rows, null, 2));

  await pool.query("BEGIN");
  try {
    const updated = await pool.query(
      `WITH evidence AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
          "legacyMemberId" text,
          status text,
          amount numeric,
          "paidAt" text,
          records jsonb
        )
      ), targets AS (
        SELECT m.id, e.status, e.amount, e."paidAt", e.records
        FROM members m
        LEFT JOIN evidence e ON e."legacyMemberId" = m.legacy_member_id
        WHERE m.legacy_member_id <> ''
      )
      UPDATE members m
      SET
        fee_status = COALESCE(t.status, 'not_applicable'),
        membership_fee = COALESCE(t.amount, 0),
        fee_paid_at = CASE
          WHEN t."paidAt" IS NULL OR t."paidAt" = '' THEN NULL
          ELSE t."paidAt"::timestamptz
        END,
        fee_updated_by = 'ACCD legacy database import',
        legacy_raw_record = COALESCE(m.legacy_raw_record, '{}'::jsonb) || jsonb_build_object(
          'membershipFeeEvidence', jsonb_build_object(
            'source', '01_Main_new',
            'matchedBy', 'exact Access member ID',
            'recordCount', COALESCE(jsonb_array_length(t.records), 0),
            'historicalStatus', COALESCE(t.status, 'not_applicable'),
            'knownAmountTotal', to_jsonb(t.amount),
            'latestPaymentDate', to_jsonb(t."paidAt")
          ),
          'membershipFeeRecords', COALESCE(t.records, '[]'::jsonb)
        ),
        updated_at = NOW()
      FROM targets t
      WHERE m.id = t.id
      RETURNING m.id`,
      [JSON.stringify(evidence)],
    );
    if (updated.rowCount !== 1_118) {
      throw new Error(`Expected to reconcile 1118 legacy members, updated ${updated.rowCount ?? 0}`);
    }
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }

  const result = await pool.query(`
    SELECT fee_status, COUNT(*)::int AS members,
      COALESCE(SUM(membership_fee), 0)::numeric(12,2) AS amount,
      COALESCE(SUM(jsonb_array_length(COALESCE(legacy_raw_record->'membershipFeeRecords', '[]'::jsonb))), 0)::int AS source_rows
    FROM members
    WHERE legacy_member_id <> ''
    GROUP BY fee_status
    ORDER BY fee_status
  `);
  const postCheck = await pool.query<{
    paid: number;
    review: number;
    not_applicable: number;
    extracted_paid_total: string;
    preserved_source_rows: number;
  }>(`
    SELECT
      COUNT(*) FILTER (WHERE fee_status = 'paid')::int AS paid,
      COUNT(*) FILTER (WHERE fee_status = 'review')::int AS review,
      COUNT(*) FILTER (WHERE fee_status = 'not_applicable')::int AS not_applicable,
      COALESCE(SUM(membership_fee) FILTER (WHERE fee_status = 'paid'), 0)::numeric(12,2) AS extracted_paid_total,
      COALESCE(SUM(jsonb_array_length(COALESCE(legacy_raw_record->'membershipFeeRecords', '[]'::jsonb))), 0)::int AS preserved_source_rows
    FROM members
    WHERE legacy_member_id <> ''
  `);
  const reconciled = postCheck.rows[0];
  if (
    !reconciled
    || reconciled.paid !== 1_096
    || reconciled.review !== 1
    || reconciled.not_applicable !== 21
    || Number(reconciled.extracted_paid_total) !== 108_500
    || reconciled.preserved_source_rows !== 1_118
  ) {
    throw new Error(`Post-import reconciliation failed: ${JSON.stringify(reconciled)}`);
  }
  const reportPath = resolve(
    workspaceRoot,
    ".agents/outputs/dkmo-access-migration-audit/access_membership_fee_reconciliation.json",
  );
  writeFileSync(reportPath, JSON.stringify({
    sourcePath,
    sourceRows,
    evidenceMembers: evidence.length,
    exactIdMatches: evidence.length,
    unmatchedEvidenceIds,
    noEvidenceIds,
    portalMembers: legacyMembers.rows.length,
    uniqueAccessIds: portalAccessIds.size,
    uniquePortalIds: portalMembershipIds.size,
    result: reconciled,
  }, null, 2));
  console.table(result.rows);
  console.log(`Preserved ${sourceRows} Access membership-fee rows from ${sourcePath}`);
  console.log(`Backup written to ${backupPath}`);
  console.log(`Reconciliation report written to ${reportPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });