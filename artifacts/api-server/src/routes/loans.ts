import { Router, type IRouter } from "express";
import {
  db,
  loansTable,
  loanPaymentsTable,
  membersTable,
  loanBudgetsTable,
  loanBudgetHistoryTable,
  committeeAssignmentsTable,
  committeeTermsTable,
} from "@workspace/db";
import { eq, ilike, and, or, desc, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole, type AuthedRequest } from "../middlewares/requireAuth";
import { getUserById } from "../lib/users";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

const LOAN_TYPES = [
  "personal",
  "medical",
  "education",
  "business",
  "emergency",
  "marriage",
  "housing",
  "other",
] as const;
const LOAN_STATUSES = ["active", "closed", "overdue", "defaulted"] as const;
const PAYMENT_METHODS = ["cash", "bank_transfer", "upi", "card", "cheque"] as const;

// Simplified create: the system derives duration, status and balances automatically.
const LoanCreateSchema = z
  .object({
    memberId: z.string().uuid(),
    loanType: z.enum(LOAN_TYPES).default("personal"),
    principalAmount: z.coerce
      .number()
      .positive("Loan amount must be greater than 0")
      .max(999_999_999_999.99),
    emiAmount: z.coerce.number().positive("Monthly payment must be greater than 0"),
    disbursedDate: z.string().min(1),
    convenorName: z.string().default(""),
    responsibleCommitteeAssignmentId: z.string().uuid().nullable().optional(),
    notes: z.string().default(""),
  })
  .refine((d) => d.emiAmount <= d.principalAmount, {
    message: "Monthly payment cannot be greater than the loan amount",
  });

// Admin edit keeps full flexibility (legacy fields included).
const LoanUpdateSchema = z.object({
  memberId: z.string().uuid().nullable().optional(),
  loanType: z.enum(LOAN_TYPES).optional(),
  principalAmount: z.coerce.number().positive().max(999_999_999_999.99).optional(),
  disbursedDate: z.string().nullable().optional(),
  emiAmount: z.coerce.number().positive().optional(),
  convenorName: z.string().optional(),
  responsibleCommitteeAssignmentId: z.string().uuid().nullable().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

const PaymentInputSchema = z.object({
  amount: z.coerce.number().positive("Payment amount must be greater than 0"),
  paymentDate: z.string().min(1),
  paymentMethod: z.enum(PAYMENT_METHODS).default("cash"),
  notes: z.string().default(""),
});

const ListQuerySchema = z.object({
  search: z.string().optional(),
  // "open" = active|overdue; "due_this_month" = an installment falls due this
  // calendar month and isn't covered yet. Both power stat-card drilldowns.
  status: z.enum([...LOAN_STATUSES, "open", "due_this_month"] as const).optional(),
  loanType: z.enum(LOAN_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

type LoanRow = typeof loansTable.$inferSelect;
type ResponsibleStaff = {
  assignmentId: string;
  memberId: string;
  membershipId: string;
  fullName: string;
  position: string;
  committeeYear: string;
};

class InsufficientBudgetError extends Error {}
class InvalidAssignmentError extends Error {}

function moneyString(amount: number): string {
  return (Math.round((amount + Number.EPSILON) * 100) / 100).toFixed(2);
}

function moneyCents(value: string | number): bigint {
  const normalized = typeof value === "number" ? moneyString(value) : value;
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) throw new Error(`Invalid monetary value: ${normalized}`);
  const cents = BigInt(match[2]!) * 100n + BigInt((match[3] ?? "").padEnd(2, "0"));
  return match[1] ? -cents : cents;
}

function centsToNumber(value: bigint): number {
  return Number(value) / 100;
}

async function validateResponsibleAssignment(
  executor: any,
  assignmentId: string | null | undefined,
): Promise<void> {
  if (!assignmentId) return;
  const [assignment] = await executor
    .select({ id: committeeAssignmentsTable.id })
    .from(committeeAssignmentsTable)
    .innerJoin(
      committeeTermsTable,
      and(
        eq(committeeAssignmentsTable.termId, committeeTermsTable.id),
        eq(committeeTermsTable.isActive, true),
      ),
    )
    .where(
      and(
        eq(committeeAssignmentsTable.id, assignmentId),
        eq(committeeAssignmentsTable.isActive, true),
      ),
    );
  if (!assignment) {
    throw new InvalidAssignmentError(
      "Responsible staff must be an active assignment in the active committee term.",
    );
  }
}

async function responsibleStaffForLoans(rows: LoanRow[]): Promise<Map<string, ResponsibleStaff>> {
  const assignmentIds = [
    ...new Set(
      rows
        .map((row) => row.responsibleCommitteeAssignmentId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const result = new Map<string, ResponsibleStaff>();
  if (!assignmentIds.length) return result;
  const assignments = await db
    .select({
      assignmentId: committeeAssignmentsTable.id,
      memberId: committeeAssignmentsTable.memberId,
      position: committeeAssignmentsTable.position,
      committeeYear: committeeTermsTable.committeeYear,
      fullName: membersTable.fullName,
      membershipId: membersTable.membershipId,
    })
    .from(committeeAssignmentsTable)
    .innerJoin(committeeTermsTable, eq(committeeAssignmentsTable.termId, committeeTermsTable.id))
    .innerJoin(membersTable, eq(committeeAssignmentsTable.memberId, membersTable.id))
    .where(inArray(committeeAssignmentsTable.id, assignmentIds));
  for (const assignment of assignments) result.set(assignment.assignmentId, assignment);
  return result;
}

/**
 * Installments due so far. Installment k falls due k full months after the
 * disbursement date, so a loan disbursed today owes nothing yet.
 */
function expectedInstallments(r: LoanRow, emiCount: number): number {
  if (!r.disbursedDate) return 0;
  const start = new Date(r.disbursedDate);
  if (isNaN(start.getTime())) return 0;
  const now = new Date();
  let months =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1; // this month's due date not reached yet
  return Math.max(0, Math.min(months, emiCount));
}

/** Installments falling due on or before the end of the current calendar month. */
function expectedInstallmentsThroughThisMonth(r: LoanRow, emiCount: number): number {
  if (!r.disbursedDate) return 0;
  const start = new Date(r.disbursedDate);
  if (isNaN(start.getTime())) return 0;
  const now = new Date();
  const months =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  return Math.max(0, Math.min(months, emiCount));
}

/**
 * Derive everything from payments — the user never edits balances or status.
 * Legacy loans keep their pre-recorded progress via paid_emis * emi_amount as a baseline.
 */
function deriveLoan(r: LoanRow, paymentsTotal: number) {
  const principal = Number(r.principalAmount);
  const emi = Number(r.emiAmount);
  const legacyPaid = emi * r.paidEmis;
  const totalPaid = Math.min(legacyPaid + paymentsTotal, principal);
  const outstanding = Math.max(principal - totalPaid, 0);
  const emiCount = r.emiCount > 0 ? r.emiCount : emi > 0 ? Math.ceil(principal / emi) : 0;
  const paidInstallments =
    emi > 0 ? Math.min(Math.floor(totalPaid / emi + 1e-9), emiCount) : 0;

  let status: (typeof LOAN_STATUSES)[number];
  if (r.status === "defaulted") {
    status = "defaulted";
  } else if (outstanding <= 0) {
    status = "closed";
  } else if (expectedInstallments(r, emiCount) > paidInstallments) {
    status = "overdue";
  } else {
    status = "active";
  }
  return { principal, emi, totalPaid, outstanding, emiCount, paidInstallments, status };
}

function rowToApi(
  r: LoanRow,
  paymentsTotal: number,
  member?: { fullName: string; membershipId: string } | null,
  responsibleStaff?: ResponsibleStaff | null,
) {
  const d = deriveLoan(r, paymentsTotal);
  return {
    id: r.id,
    memberId: r.memberId,
    memberName: member?.fullName ?? null,
    membershipId: member?.membershipId ?? null,
    loanType: r.loanType,
    principalAmount: d.principal,
    disbursedDate: r.disbursedDate ?? null,
    emiAmount: d.emi,
    emiCount: d.emiCount,
    paidEmis: d.paidInstallments,
    totalPaid: d.totalPaid,
    outstandingBalance: d.outstanding,
    status: d.status,
    convenorName: r.convenorName,
    responsibleCommitteeAssignmentId: r.responsibleCommitteeAssignmentId,
    responsibleStaff: responsibleStaff ?? null,
    description: r.description,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function paymentToApi(p: typeof loanPaymentsTable.$inferSelect) {
  return {
    id: p.id,
    loanId: p.loanId,
    amount: Number(p.amount),
    paymentDate: p.paymentDate,
    paymentMethod: p.paymentMethod,
    notes: p.notes,
    recordedBy: p.recordedBy,
    createdAt: p.createdAt.toISOString(),
  };
}

async function paymentTotals(loanIds?: string[]): Promise<Map<string, number>> {
  const rows = await db
    .select({
      loanId: loanPaymentsTable.loanId,
      total: sql<number>`coalesce(sum(${loanPaymentsTable.amount}::numeric), 0)::float`,
    })
    .from(loanPaymentsTable)
    .groupBy(loanPaymentsTable.loanId);
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!loanIds || loanIds.includes(row.loanId)) map.set(row.loanId, Number(row.total));
  }
  return map;
}

router.use("/loans", requireAuth);

router.get("/loans/budget", async (_req, res): Promise<void> => {
  const [budget] = await db.select().from(loanBudgetsTable).where(eq(loanBudgetsTable.id, 1));
  if (!budget) {
    res.status(503).json({ error: "Loan budget has not been initialized. Run the database migration." });
    return;
  }
  const [{ total }] = await db
    .select({ total: sql<string>`coalesce(sum(${loansTable.principalAmount}), 0)::text` })
    .from(loansTable);
  const loanRows = await db.select().from(loansTable);
  const totals = await paymentTotals();
  const activeLoans = loanRows.reduce((count, loan) => {
    const status = deriveLoan(loan, totals.get(loan.id) ?? 0).status;
    return count + (status === "active" || status === "overdue" ? 1 : 0);
  }, 0);
  const totalBudget = Number(budget.amount);
  const totalDisbursed = Number(total);
  const remainingCents = moneyCents(budget.amount) - moneyCents(total);
  res.json({
    totalBudget,
    totalDisbursed,
    remainingBudget: Math.max(centsToNumber(remainingCents), 0),
    activeLoans,
    pendingApplications: 0,
    updatedAt: budget.updatedAt.toISOString(),
  });
});

router.put("/loans/budget", requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = z
    .object({ amount: z.coerce.number().finite().nonnegative().max(999_999_999_999.99) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const actor = getUserById((req as AuthedRequest).userId);
  try {
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM loan_budgets WHERE id = 1 FOR UPDATE`);
      const [current] = await tx.select().from(loanBudgetsTable).where(eq(loanBudgetsTable.id, 1));
      if (!current) throw new Error("Loan budget has not been initialized.");
      const [{ total }] = await tx
        .select({ total: sql<string>`coalesce(sum(${loansTable.principalAmount}), 0)::text` })
        .from(loansTable);
      if (moneyCents(parsed.data.amount) < moneyCents(total)) {
        throw new InsufficientBudgetError(
          `Budget cannot be below the total amount disbursed (SAR ${Number(total).toFixed(2)}).`,
        );
      }
      const [next] = await tx
        .update(loanBudgetsTable)
        .set({ amount: moneyString(parsed.data.amount), updatedAt: new Date() })
        .where(eq(loanBudgetsTable.id, 1))
        .returning();
      await tx.insert(loanBudgetHistoryTable).values({
        oldAmount: current.amount,
        newAmount: moneyString(parsed.data.amount),
        actorId: (req as AuthedRequest).userId,
        actorName: actor?.displayName ?? (req as AuthedRequest).userId,
      });
      return { next, oldAmount: current.amount };
    });
    await logAudit(req, "loan_budget_updated", "loans", {
      entityId: "1",
      details: JSON.stringify({
        oldAmount: Number(updated.oldAmount),
        newAmount: Number(updated.next.amount),
      }),
    });
    res.json({
      totalBudget: Number(updated.next.amount),
      updatedAt: updated.next.updatedAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof InsufficientBudgetError) {
      res.status(409).json({ error: error.message });
      return;
    }
    throw error;
  }
});

router.get("/loans/budget/history", requireRole("admin"), async (_req, res): Promise<void> => {
  const history = await db
    .select()
    .from(loanBudgetHistoryTable)
    .orderBy(desc(loanBudgetHistoryTable.createdAt));
  res.json(
    history.map((item) => ({
      id: item.id,
      oldAmount: Number(item.oldAmount),
      newAmount: Number(item.newAmount),
      actorId: item.actorId,
      actorName: item.actorName,
      timestamp: item.createdAt.toISOString(),
    })),
  );
});

// GET /loans/stats — must be before /:id
router.get("/loans/stats", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ loan: loansTable, memberId: loansTable.memberId })
    .from(loansTable);
  const totals = await paymentTotals();

  let active = 0;
  let overdue = 0;
  let closed = 0;
  let totalPrincipal = 0;
  let totalOutstanding = 0;
  let dueThisMonthAmount = 0;
  let dueThisMonthCount = 0;
  const missedMembers = new Set<string>();

  for (const { loan } of rows) {
    const d = deriveLoan(loan, totals.get(loan.id) ?? 0);
    totalPrincipal += d.principal;
    totalOutstanding += d.outstanding;
    if (d.status === "closed") closed += 1;
    else if (d.status === "overdue") {
      overdue += 1;
      if (loan.memberId) missedMembers.add(loan.memberId);
    } else if (d.status === "active") active += 1;
    // Due this month = an installment falls due within the current calendar
    // month and payments so far don't cover it yet.
    if (
      (d.status === "active" || d.status === "overdue") &&
      d.outstanding > 0 &&
      d.paidInstallments < expectedInstallmentsThroughThisMonth(loan, d.emiCount)
    ) {
      dueThisMonthCount += 1;
      dueThisMonthAmount += Math.min(d.emi, d.outstanding);
    }
  }

  res.json({
    total: rows.length,
    active,
    overdue,
    closed,
    totalPrincipal,
    totalOutstanding,
    dueThisMonthAmount,
    dueThisMonthCount,
    membersWithMissedPayments: missedMembers.size,
  });
});

// GET /loans
router.get("/loans", async (req, res): Promise<void> => {
  const parsed = ListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, status, loanType, page, pageSize } = parsed.data;

  // Status is derived, so filter after derivation (community-scale data).
  const rows = await db
    .select({
      loan: loansTable,
      memberName: membersTable.fullName,
      membershipId: membersTable.membershipId,
      mobileNumber: membersTable.mobileNumber,
    })
    .from(loansTable)
    .leftJoin(membersTable, eq(loansTable.memberId, membersTable.id))
    .where(
      and(
        loanType ? eq(loansTable.loanType, loanType) : undefined,
        search
          ? or(
              ilike(membersTable.fullName, `%${search}%`),
              ilike(membersTable.membershipId, `%${search}%`),
              ilike(membersTable.mobileNumber, `%${search}%`),
              ilike(loansTable.loanType, `%${search}%`),
              ilike(loansTable.description, `%${search}%`),
              ilike(loansTable.notes, `%${search}%`),
              ilike(loansTable.convenorName, `%${search}%`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(loansTable.createdAt));

  const totals = await paymentTotals();
  const staff = await responsibleStaffForLoans(rows.map((row) => row.loan));
  let pairs = rows.map((r) => ({
    raw: r.loan,
    api: rowToApi(
      r.loan,
      totals.get(r.loan.id) ?? 0,
      r.memberName ? { fullName: r.memberName, membershipId: r.membershipId ?? "" } : null,
      r.loan.responsibleCommitteeAssignmentId
        ? staff.get(r.loan.responsibleCommitteeAssignmentId)
        : null,
    ),
  }));
  if (status === "open") {
    pairs = pairs.filter((p) => p.api.status === "active" || p.api.status === "overdue");
  } else if (status === "due_this_month") {
    pairs = pairs.filter((p) => {
      const d = deriveLoan(p.raw, totals.get(p.raw.id) ?? 0);
      return (
        (d.status === "active" || d.status === "overdue") &&
        d.outstanding > 0 &&
        d.paidInstallments < expectedInstallmentsThroughThisMonth(p.raw, d.emiCount)
      );
    });
  } else if (status) {
    pairs = pairs.filter((p) => p.api.status === status);
  }
  const items = pairs.map((p) => p.api);

  const total = items.length;
  const start = (page - 1) * pageSize;
  res.json({ items: items.slice(start, start + pageSize), page, pageSize, total });
});

// GET /loans/:id
router.get("/loans/:id", async (req, res): Promise<void> => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select({ loan: loansTable, memberName: membersTable.fullName, membershipId: membersTable.membershipId })
    .from(loansTable)
    .leftJoin(membersTable, eq(loansTable.memberId, membersTable.id))
    .where(eq(loansTable.id, id.data));

  if (!row) {
    res.status(404).json({ error: "Loan not found" });
    return;
  }
  const totals = await paymentTotals([id.data]);
  const staff = await responsibleStaffForLoans([row.loan]);
  res.json(
    rowToApi(
      row.loan,
      totals.get(id.data) ?? 0,
      row.memberName ? { fullName: row.memberName, membershipId: row.membershipId ?? "" } : null,
      row.loan.responsibleCommitteeAssignmentId
        ? staff.get(row.loan.responsibleCommitteeAssignmentId)
        : null,
    ),
  );
});

// GET /loans/:id/payments — payment history
router.get("/loans/:id/payments", async (req, res): Promise<void> => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const rows = await db
    .select()
    .from(loanPaymentsTable)
    .where(eq(loanPaymentsTable.loanId, id.data))
    .orderBy(desc(loanPaymentsTable.paymentDate), desc(loanPaymentsTable.createdAt));
  res.json(rows.map(paymentToApi));
});

// POST /loans/:id/payments — record a repayment (auto-updates balance & status)
router.post(
  "/loans/:id/payments",
  requireRole("admin", "finance"),
  async (req, res): Promise<void> => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = PaymentInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [loan] = await db.select().from(loansTable).where(eq(loansTable.id, id.data));
    if (!loan) {
      res.status(404).json({ error: "Loan not found" });
      return;
    }
    const totalsBefore = await paymentTotals([id.data]);
    const before = deriveLoan(loan, totalsBefore.get(id.data) ?? 0);
    if (before.outstanding <= 0) {
      res.status(409).json({ error: "This loan is already fully paid." });
      return;
    }
    if (parsed.data.amount > before.outstanding) {
      res.status(409).json({
        error: `Payment exceeds the outstanding balance (SAR ${before.outstanding.toFixed(2)}).`,
      });
      return;
    }

    const user = getUserById((req as AuthedRequest).userId);
    const [created] = await db
      .insert(loanPaymentsTable)
      .values({
        loanId: id.data,
        amount: String(parsed.data.amount),
        paymentDate: parsed.data.paymentDate,
        paymentMethod: parsed.data.paymentMethod,
        notes: parsed.data.notes,
        recordedBy: user?.displayName ?? "",
      })
      .returning();

    // Keep the stored status in sync so other modules see the derived value.
    const after = deriveLoan(loan, (totalsBefore.get(id.data) ?? 0) + parsed.data.amount);
    await db
      .update(loansTable)
      .set({ status: after.status })
      .where(eq(loansTable.id, id.data));

    res.status(201).json({
      payment: paymentToApi(created),
      loanClosed: after.status === "closed",
    });
  },
);

// DELETE /loans/:id/payments/:paymentId — admin correction only
router.delete(
  "/loans/:id/payments/:paymentId",
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = z.string().uuid().safeParse(req.params.id);
    const paymentId = z.string().uuid().safeParse(req.params.paymentId);
    if (!id.success || !paymentId.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [deleted] = await db
      .delete(loanPaymentsTable)
      .where(and(eq(loanPaymentsTable.id, paymentId.data), eq(loanPaymentsTable.loanId, id.data)))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    const [loan] = await db.select().from(loansTable).where(eq(loansTable.id, id.data));
    if (loan) {
      const totals = await paymentTotals([id.data]);
      const d = deriveLoan(loan, totals.get(id.data) ?? 0);
      await db.update(loansTable).set({ status: d.status }).where(eq(loansTable.id, id.data));
    }
    res.sendStatus(204);
  },
);

// POST /loans — create (duration, status and balances are automatic)
router.post("/loans", requireRole("admin", "finance"), async (req, res): Promise<void> => {
  const parsed = LoanCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const emiCount = Math.ceil(d.principalAmount / d.emiAmount);
  // Only admins may assign someone else as convenor; everyone else is
  // recorded as the convenor themselves.
  const authed = req as AuthedRequest;
  const creator = getUserById(authed.userId);
  const convenorName =
    authed.userRole === "admin" && d.convenorName
      ? d.convenorName
      : (creator?.displayName ?? d.convenorName);
  let created: LoanRow;
  try {
    created = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM loan_budgets WHERE id = 1 FOR UPDATE`);
      const [budget] = await tx.select().from(loanBudgetsTable).where(eq(loanBudgetsTable.id, 1));
      if (!budget) throw new Error("Loan budget has not been initialized.");
      const [{ total }] = await tx
        .select({ total: sql<string>`coalesce(sum(${loansTable.principalAmount}), 0)::text` })
        .from(loansTable);
      const availableCents = moneyCents(budget.amount) - moneyCents(total);
      if (moneyCents(d.principalAmount) > availableCents) {
        throw new InsufficientBudgetError(
          `Insufficient remaining loan budget. Available: SAR ${Math.max(centsToNumber(availableCents), 0).toFixed(2)}.`,
        );
      }
      await validateResponsibleAssignment(tx, d.responsibleCommitteeAssignmentId);
      const [inserted] = await tx
        .insert(loansTable)
        .values({
          memberId: d.memberId,
          loanType: d.loanType,
          principalAmount: moneyString(d.principalAmount),
          disbursedDate: d.disbursedDate,
          emiAmount: moneyString(d.emiAmount),
          emiCount,
          paidEmis: 0,
          status: "active",
          convenorName,
          responsibleCommitteeAssignmentId: d.responsibleCommitteeAssignmentId ?? null,
          description: "",
          notes: d.notes,
        })
        .returning();
      return inserted;
    });
  } catch (error) {
    if (error instanceof InsufficientBudgetError) {
      res.status(409).json({ error: error.message });
      return;
    }
    if (error instanceof InvalidAssignmentError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  const member = created.memberId
    ? await db.select().from(membersTable).where(eq(membersTable.id, created.memberId)).then((r) => r[0])
    : null;

  const staff = await responsibleStaffForLoans([created]);
  await logAudit(req, "loan_created", "loans", {
    entityId: created.id,
    details: JSON.stringify({
      principalAmount: Number(created.principalAmount),
      responsibleCommitteeAssignmentId: created.responsibleCommitteeAssignmentId,
    }),
  });
  res.status(201).json(
    rowToApi(
      created,
      0,
      member ?? null,
      created.responsibleCommitteeAssignmentId
        ? staff.get(created.responsibleCommitteeAssignmentId)
        : null,
    ),
  );
});

// PUT /loans/:id — admin only
router.put("/loans/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = LoanUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const updates: Record<string, unknown> = {};
  if (d.memberId !== undefined) updates.memberId = d.memberId ?? null;
  if (d.loanType !== undefined) updates.loanType = d.loanType;
  if (d.principalAmount !== undefined) updates.principalAmount = String(d.principalAmount);
  if (d.disbursedDate !== undefined) updates.disbursedDate = d.disbursedDate ?? null;
  if (d.emiAmount !== undefined) updates.emiAmount = String(d.emiAmount);
  if (d.convenorName !== undefined) updates.convenorName = d.convenorName;
  if (d.responsibleCommitteeAssignmentId !== undefined) {
    updates.responsibleCommitteeAssignmentId = d.responsibleCommitteeAssignmentId;
  }
  if (d.description !== undefined) updates.description = d.description;
  if (d.notes !== undefined) updates.notes = d.notes;

  let existing: LoanRow | undefined;
  let updated: LoanRow | undefined;
  try {
    updated = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM loan_budgets WHERE id = 1 FOR UPDATE`);
      [existing] = await tx.select().from(loansTable).where(eq(loansTable.id, id.data));
      if (!existing) return undefined;
      await validateResponsibleAssignment(tx, d.responsibleCommitteeAssignmentId);
      const principal = d.principalAmount ?? Number(existing.principalAmount);
      const emi = d.emiAmount ?? Number(existing.emiAmount);
      if (d.principalAmount !== undefined || d.emiAmount !== undefined) {
        updates.emiCount = Math.ceil(principal / emi);
      }
      if (d.principalAmount !== undefined && d.principalAmount > Number(existing.principalAmount)) {
        const [budget] = await tx.select().from(loanBudgetsTable).where(eq(loanBudgetsTable.id, 1));
        if (!budget) throw new Error("Loan budget has not been initialized.");
        const [{ total }] = await tx
          .select({ total: sql<string>`coalesce(sum(${loansTable.principalAmount}), 0)::text` })
          .from(loansTable);
        const increaseCents =
          moneyCents(d.principalAmount) - moneyCents(existing.principalAmount);
        const availableCents = moneyCents(budget.amount) - moneyCents(total);
        if (increaseCents > availableCents) {
          throw new InsufficientBudgetError(
            `Insufficient remaining loan budget. Available: SAR ${Math.max(centsToNumber(availableCents), 0).toFixed(2)}.`,
          );
        }
      }
      const [changed] = await tx
        .update(loansTable)
        .set(updates)
        .where(eq(loansTable.id, id.data))
        .returning();
      return changed;
    });
  } catch (error) {
    if (error instanceof InsufficientBudgetError) {
      res.status(409).json({ error: error.message });
      return;
    }
    if (error instanceof InvalidAssignmentError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  if (!updated) {
    res.status(404).json({ error: "Loan not found" });
    return;
  }

  const totals = await paymentTotals([id.data]);
  // Keep stored status in sync after schedule/amount edits.
  const derived = deriveLoan(updated, totals.get(id.data) ?? 0);
  if (derived.status !== updated.status) {
    await db.update(loansTable).set({ status: derived.status }).where(eq(loansTable.id, id.data));
    updated.status = derived.status;
  }
  const member = updated.memberId
    ? await db.select().from(membersTable).where(eq(membersTable.id, updated.memberId)).then((r) => r[0])
    : null;

  const staff = await responsibleStaffForLoans([updated]);
  await logAudit(req, "loan_updated", "loans", {
    entityId: updated.id,
    details: JSON.stringify({
      principalAmount: {
        old: existing ? Number(existing.principalAmount) : null,
        new: Number(updated.principalAmount),
      },
      responsibleCommitteeAssignmentId: {
        old: existing?.responsibleCommitteeAssignmentId ?? null,
        new: updated.responsibleCommitteeAssignmentId,
      },
    }),
  });
  res.json(
    rowToApi(
      updated,
      totals.get(id.data) ?? 0,
      member ?? null,
      updated.responsibleCommitteeAssignmentId
        ? staff.get(updated.responsibleCommitteeAssignmentId)
        : null,
    ),
  );
});

// DELETE /loans/:id — admin only
router.delete("/loans/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [deleted] = await db.delete(loansTable).where(eq(loansTable.id, id.data)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Loan not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
