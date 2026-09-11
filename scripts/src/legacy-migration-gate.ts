import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED_CANDIDATE_IDS = [
  "7101",
  "7112",
  "7115",
  "11485",
  "11568",
  "16842",
  "19062",
] as const;

const ALLOWED_DECISIONS = [
  "Confirm Same Person",
  "Confirm Different Person",
  "Needs Review / Skip",
] as const;

type Decision = (typeof ALLOWED_DECISIONS)[number];
type CsvRow = Record<string, string>;

function legacyKey(value: string): string {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return String(Number(trimmed));
  return trimmed.toLowerCase();
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
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
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
    );
}

function csvCell(value: unknown): string {
  const stringValue = String(value ?? "");
  return /[",\r\n]/.test(stringValue)
    ? `"${stringValue.replace(/"/g, '""')}"`
    : stringValue;
}

function writeCsv(path: string, rows: CsvRow[]): void {
  const headers = Object.keys(rows[0] ?? {});
  const output = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\n");
  writeFileSync(path, `${output}\n`, "utf8");
}

function numberValue(value: string): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function hasHistoricalValue(row: CsvRow, ...keys: string[]): boolean {
  return keys.some((key) => {
    const value = row[key] ?? "";
    return value !== "" && value !== "0" && value !== "0.00";
  });
}

function requiredCandidateSet(rows: CsvRow[]): string[] {
  return rows
    .map((row) => row.legacy_id)
    .filter((id): id is string => Boolean(id));
}

function decisionFor(row: CsvRow): Decision | "" {
  const decision = row.decision as Decision;
  return ALLOWED_DECISIONS.includes(decision) ? decision : "";
}

function buildReferralPlan(
  referralSourceRows: CsvRow[],
  masterRows: CsvRow[],
  planRows: CsvRow[],
): CsvRow[] {
  const masterById = new Map(masterRows.map((row) => [legacyKey(row.legacy_id), row]));
  const planById = new Map(planRows.map((row) => [legacyKey(row.legacy_id), row]));

  return referralSourceRows.map((row) => {
    const referredLegacyId = row.legacy_referred_member_id ?? "";
    const referrerLegacyId = row.legacy_referrer_id ?? "";
    const referred = planById.get(legacyKey(referredLegacyId));
    const referrer = masterById.get(legacyKey(referrerLegacyId));
    const hasReferrerId = Boolean(referrerLegacyId.trim());
    const hasReferrerRecord = Boolean(referrer);
    const sourceAction = row.action ?? "";

    let relationshipStatus = "NO_REFERRAL_SOURCE";
    if (hasReferrerId && hasReferrerRecord) {
      relationshipStatus =
        row.match_confidence === "high"
          ? "LEGACY_ID_RESOLVED"
          : "LEGACY_ID_RESOLVED_REVIEW";
    } else if (hasReferrerId) {
      relationshipStatus = "UNRESOLVED_REFERRER_ID";
    } else if (sourceAction === "MANUAL_REVIEW") {
      relationshipStatus = "NEEDS_REVIEW_FREE_TEXT";
    }

    return {
      source_table: row.source_table ?? "02_Name",
      source_row: row.source_row ?? "",
      legacy_referred_member_id: referredLegacyId,
      referred_member_name: row.member_name ?? referred?.legacy_name ?? "",
      legacy_referrer_id: referrerLegacyId,
      legacy_referrer_name:
        row.legacy_referrer_name ||
        row.raw_member_under ||
        referrer?.member_name ||
        "",
      raw_group: row.raw_group ?? "",
      raw_member_under: row.raw_member_under ?? "",
      raw_member_under_old: row.raw_member_under_old ?? "",
      source_action: sourceAction,
      source_match_confidence: row.match_confidence ?? "",
      relationship_status: relationshipStatus,
      relationship_preserved: hasReferrerId && hasReferrerRecord ? "yes" : "raw_only",
      referrer_portal_member_id: referrer?.current_portal_member_id ?? "",
      referred_portal_member_id: referred?.portal_member_id ?? "",
      unresolved_reason:
        relationshipStatus === "NO_REFERRAL_SOURCE"
          ? "Access row contains no safe referrer ID."
          : relationshipStatus === "NEEDS_REVIEW_FREE_TEXT"
            ? "Access contains free-text referral data without a safe numeric cross-reference."
            : relationshipStatus === "UNRESOLVED_REFERRER_ID"
              ? "Access referrer ID does not exist in the complete legacy member dataset."
              : "",
    };
  });
}

function buildPlan(
  masterRows: CsvRow[],
  resolutionRows: CsvRow[],
  referralSourceRows: CsvRow[],
  memberSourceRows: CsvRow[],
) {
  const resolutionByLegacyId = new Map(
    resolutionRows.map((row) => [row.legacy_id, row]),
  );
  const expectedIds = new Set<string>(REQUIRED_CANDIDATE_IDS);
  const actualIds = new Set(requiredCandidateSet(resolutionRows));
  const missing = REQUIRED_CANDIDATE_IDS.filter((id) => !actualIds.has(id));
  const unexpected = [...actualIds].filter((id) => !expectedIds.has(id));
  if (missing.length || unexpected.length || resolutionRows.length !== REQUIRED_CANDIDATE_IDS.length) {
    throw new Error(
      `Resolution worksheet must contain exactly the seven required IDs. Missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"}.`,
    );
  }

  const planRows: CsvRow[] = masterRows.map((master) => {
    const resolution = resolutionByLegacyId.get(master.legacy_id);
    const decision = resolution ? decisionFor(resolution) : "";
    const isCandidate = Boolean(resolution);
    const hasPortalCandidate = Boolean(master.current_portal_member);
    const mobileCandidate = resolution?.matching_reason.includes("mobile") ?? false;
    const possibleDuplicate = mobileCandidate && master.current_portal_membership_id !== "";

    let matchStatus = "UNMATCHED_LEGACY";
    let historyDestination = "legacy_preserved_unattached";
    let importBlockReason =
      "Full migration approval and a confirmed legacy crosswalk are still required.";
    let portalMemberId = "";
    let portalMembershipId = "";

    if (decision === "Confirm Same Person") {
      matchStatus = "CONFIRMED_MATCH";
      historyDestination = "existing_portal_member";
      importBlockReason = "";
      portalMemberId = resolution?.current_portal_member_id ?? "";
      portalMembershipId = resolution?.current_portal_membership_id ?? "";
    } else if (decision === "Confirm Different Person") {
      matchStatus = "CONFIRMED_DIFFERENT_PERSON";
      historyDestination = "separate_legacy_member_record";
      importBlockReason = "Do not attach history to the current portal member.";
    } else if (isCandidate) {
      matchStatus = "NEEDS_REVIEW";
      historyDestination = "legacy_preserved_unattached";
      importBlockReason =
        "Candidate decision is pending; do not attach or import historical relationships.";
    } else if (hasPortalCandidate) {
      matchStatus = "POSSIBLE_DUPLICATE";
      historyDestination = "legacy_preserved_unattached";
      importBlockReason =
        "Possible duplicate requires manual review before any portal attachment.";
    }

    return {
      legacy_id: master.legacy_id,
      legacy_name: master.member_name,
      source_record_included: "yes",
      portal_member_id: portalMemberId,
      portal_membership_id: portalMembershipId,
      match_status: matchStatus,
      match_confidence: resolution?.confidence_level ?? master.match_confidence ?? "none",
      match_reason: resolution?.matching_reason ?? master.match_reason ?? "",
      decision,
      decision_notes: resolution?.decision_notes ?? "",
      history_destination: historyDestination,
      membership_payment_records: master.membership_payment_records,
      membership_amount_paid: master.membership_amount_paid,
      referral_history: master.referrer_legacy_id ? "yes" : "no",
      referrer_legacy_id: master.referrer_legacy_id,
      frf_records: master.frf_records,
      frf_amount_recorded: master.frf_amount_recorded,
      loan_count: master.loan_count,
      loan_repayment_count: master.loan_repayment_count,
      other_or_adjustment_records: master.other_or_adjustment_records,
      preserved_legacy_id: "yes",
      possible_duplicate: possibleDuplicate ? "yes" : "no",
      legacy_member_page_included: "yes",
      planned_member_destination:
        matchStatus === "CONFIRMED_MATCH"
          ? "existing_portal_member"
          : "new_legacy_member_record",
      import_block_reason: importBlockReason,
    };
  });

  const referralRows = buildReferralPlan(referralSourceRows, masterRows, planRows);
  const referralByReferredId = new Map(
    referralRows
      .filter((row) => row.legacy_referred_member_id)
      .map((row) => [legacyKey(row.legacy_referred_member_id), row]),
  );
  const enrichedPlanRows: CsvRow[] = planRows.map((row) => {
    const referral = referralByReferredId.get(legacyKey(row.legacy_id));
    return {
      ...row,
      referrer_name: referral?.legacy_referrer_name ?? "",
      referral_status: referral?.relationship_status ?? "NO_REFERRAL_SOURCE",
      referrer_portal_member_id: referral?.referrer_portal_member_id ?? "",
    };
  });

  const pending = resolutionRows.filter((row) => row.decision === "").length;
  const invalid = resolutionRows.filter(
    (row) => row.decision !== "" && !decisionFor(row),
  ).length;
  const confirmedMatches = enrichedPlanRows.filter(
    (row) => row.match_status === "CONFIRMED_MATCH",
  ).length;
  const confirmedDifferent = enrichedPlanRows.filter(
    (row) => row.match_status === "CONFIRMED_DIFFERENT_PERSON",
  ).length;
  const needsReview = enrichedPlanRows.filter(
    (row) => row.match_status === "NEEDS_REVIEW",
  ).length;
  const unmatchedLegacy = enrichedPlanRows.filter(
    (row) => row.match_status === "UNMATCHED_LEGACY",
  ).length;
  const possibleDuplicates = enrichedPlanRows.filter(
    (row) => row.possible_duplicate === "yes",
  ).length;
  const referralCounts = {
    total_source_rows: referralRows.length,
    legacy_id_resolved: referralRows.filter(
      (row) => row.relationship_status === "LEGACY_ID_RESOLVED",
    ).length,
    legacy_id_resolved_review: referralRows.filter(
      (row) => row.relationship_status === "LEGACY_ID_RESOLVED_REVIEW",
    ).length,
    needs_review_free_text: referralRows.filter(
      (row) => row.relationship_status === "NEEDS_REVIEW_FREE_TEXT",
    ).length,
    unresolved_referrer_id: referralRows.filter(
      (row) => row.relationship_status === "UNRESOLVED_REFERRER_ID",
    ).length,
    no_referral_source: referralRows.filter(
      (row) => row.relationship_status === "NO_REFERRAL_SOURCE",
    ).length,
  };

  const sourceMemberById = new Map(
    memberSourceRows.map((row) => [legacyKey(row.legacy_id), row]),
  );
  const memberDatasetRows = enrichedPlanRows.map((row) => ({
    ...(sourceMemberById.get(legacyKey(row.legacy_id)) ?? {}),
    legacy_id: row.legacy_id,
    full_name: sourceMemberById.get(legacyKey(row.legacy_id))?.full_name ?? row.legacy_name,
    legacy_member_page_included: row.legacy_member_page_included,
    member_dataset_status: row.match_status,
    planned_member_destination: row.planned_member_destination,
    portal_member_id: row.portal_member_id,
    portal_membership_id: row.portal_membership_id,
    legacy_referrer_id: row.referrer_legacy_id,
    legacy_referrer_name: row.referrer_name,
    referrer_portal_member_id: row.referrer_portal_member_id,
    referral_status: row.referral_status,
    membership_payment_records: row.membership_payment_records,
    membership_amount_paid: row.membership_amount_paid,
    frf_records: row.frf_records,
    frf_amount_recorded: row.frf_amount_recorded,
    loan_count: row.loan_count,
    loan_repayment_count: row.loan_repayment_count,
    other_or_adjustment_records: row.other_or_adjustment_records,
    preserved_legacy_id: row.preserved_legacy_id,
    import_block_reason: row.import_block_reason,
  }));

  return {
    planRows: enrichedPlanRows,
    memberDatasetRows,
    referralRows,
    summary: {
      source_of_truth: "2022_New_Okkuta_02282022.accdb via the audited Access exports",
      source_records_included: masterRows.length,
      member_page_population_planned: masterRows.length,
      legacy_member_records_required: enrichedPlanRows.filter(
        (row) => row.planned_member_destination === "new_legacy_member_record",
      ).length,
      required_candidate_ids: REQUIRED_CANDIDATE_IDS,
      candidate_decisions_required: REQUIRED_CANDIDATE_IDS.length,
      candidate_decisions_recorded:
        resolutionRows.length - pending - invalid,
      pending_candidate_decisions: pending,
      invalid_candidate_decisions: invalid,
      categories: {
        confirmed_matches: confirmedMatches,
        confirmed_different_people: confirmedDifferent,
        unmatched_legacy_members: unmatchedLegacy,
        needs_review: needsReview,
        possible_duplicates: possibleDuplicates,
      },
      referral_relationships: referralCounts,
      historical_import_gate:
        pending === 0 && invalid === 0
          ? "READY_FOR_SEPARATE_MIGRATION_APPROVAL"
          : "BLOCKED_UNTIL_ALL_SEVEN_DECISIONS_ARE_RECORDED",
      preservation_rules: [
        "Every legacy row remains in the reconciliation and dry-run plan.",
        "The Access legacy ID is preserved on every historical record destination.",
        "Only Confirm Same Person may attach history to an existing portal member.",
        "Confirm Different Person keeps the legacy history separate.",
        "Needs Review / Skip preserves history but leaves it unattached.",
        "Every legacy row is planned for the Members dataset; unmatched never means excluded.",
        "Legacy referrals are keyed by Access legacy ID and remain raw-only when unresolved.",
        "This gate never approves the full migration or writes to the database.",
      ],
    },
  };
}

function writeMarkdownReport(
  path: string,
  summary: Record<string, unknown>,
  planRows: CsvRow[],
  referralRows: CsvRow[],
): void {
  const categories = summary.categories as Record<string, number>;
  const referrals = summary.referral_relationships as Record<string, number>;
  const candidates = REQUIRED_CANDIDATE_IDS.map((id) => {
    const row = planRows.find((candidate) => candidate.legacy_id === id);
    return `- ${id} — ${row?.legacy_name ?? "Not found"} — ${row?.match_status ?? "MISSING"} — history destination: ${row?.history_destination ?? "unknown"}`;
  }).join("\n");
  const unresolved = referralRows.filter(
    (row) =>
      row.relationship_status === "NEEDS_REVIEW_FREE_TEXT" ||
      row.relationship_status === "UNRESOLVED_REFERRER_ID" ||
      row.relationship_status === "NO_REFERRAL_SOURCE",
  ).length;

  const markdown = `# DKMO Legacy Member Dataset Dry Run

Generated from the audited Access exports for \`2022_New_Okkuta_02282022.accdb\`.

## Population gate

- Access member rows: **${summary.source_records_included}**
- Planned Members-page population: **${summary.member_page_population_planned}**
- Legacy member records required: **${summary.legacy_member_records_required}**
- Current portal members are not overwritten or deleted.
- Historical import gate: **${summary.historical_import_gate}**

## Match categories

- Confirmed matches: ${categories.confirmed_matches}
- Confirmed different people: ${categories.confirmed_different_people}
- Unmatched legacy members: ${categories.unmatched_legacy_members}
- Needs review: ${categories.needs_review}
- Possible duplicates: ${categories.possible_duplicates}

## Referral relationships

- Access referral-source rows: ${referrals.total_source_rows}
- Legacy IDs resolved exactly: ${referrals.legacy_id_resolved}
- Legacy IDs resolved but confidence requires review: ${referrals.legacy_id_resolved_review}
- Free-text referrals needing review: ${referrals.needs_review_free_text}
- Referrer IDs not found in the complete dataset: ${referrals.unresolved_referrer_id}
- Rows with no safe referral source: ${referrals.no_referral_source}
- Referral rows not yet attachable with confidence: ${unresolved}

Every row remains in \`migration_legacy_member_dataset.csv\`. Every referral row remains in \`migration_referral_relationships.csv\`, including raw-only unresolved relationships.

## Seven flagged members

${candidates}

## Preservation rules

${(summary.preservation_rules as string[]).map((rule) => `- ${rule}`).join("\n")}
`;
  writeFileSync(path, markdown, "utf8");
}

function parseArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    parsed[arg.slice(2)] = args[index + 1] ?? "";
    index += 1;
  }
  return parsed;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const workspaceRoot = resolve(process.cwd().endsWith("/scripts") ? ".." : ".");
  const masterPath = resolve(
    workspaceRoot,
    args.master || ".agents/outputs/dkmo-access-migration-audit/migration_master_reconciliation.csv",
  );
  const resolutionPath = resolve(
    workspaceRoot,
    args.resolution || ".agents/outputs/dkmo-access-migration-audit/migration_portal_match_resolution.csv",
  );
  const referralPath = resolve(
    workspaceRoot,
    args.referrals || ".agents/outputs/dkmo-access-migration-audit/migration_referrals_preview.csv",
  );
  const memberSourcePath = resolve(
    workspaceRoot,
    args.members || ".agents/outputs/dkmo-access-migration-audit/migration_members_preview.csv",
  );
  const outDir = resolve(
    workspaceRoot,
    args.out || ".agents/outputs/dkmo-access-migration-audit",
  );
  const masterRows = readCsv(masterPath);
  const resolutionRows = readCsv(resolutionPath);
  const referralSourceRows = readCsv(referralPath);
  const memberSourceRows = readCsv(memberSourcePath);
  if (masterRows.length === 0) throw new Error("The master reconciliation is empty.");
  if (referralSourceRows.length === 0) throw new Error("The referral reconciliation is empty.");
  if (memberSourceRows.length === 0) throw new Error("The member dataset source is empty.");
  const result = buildPlan(masterRows, resolutionRows, referralSourceRows, memberSourceRows);

  writeCsv(resolve(outDir, "migration_historical_import_plan.csv"), result.planRows);
  writeCsv(resolve(outDir, "migration_legacy_member_dataset.csv"), result.memberDatasetRows);
  writeCsv(resolve(outDir, "migration_referral_relationships.csv"), result.referralRows);
  writeFileSync(
    resolve(outDir, "migration_historical_import_plan.json"),
    `${JSON.stringify(result.summary, null, 2)}\n`,
    "utf8",
  );
  writeMarkdownReport(
    resolve(outDir, "DKMO_Legacy_Member_Dataset_Dry_Run_Report.md"),
    result.summary,
    result.planRows,
    result.referralRows,
  );
  console.log(JSON.stringify(result.summary, null, 2));
}

main();