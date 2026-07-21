import { Router, type IRouter } from "express";
import { eq, desc, ilike, or, count } from "drizzle-orm";
import { db, receiptsTable } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { z } from "zod";

const router: IRouter = Router();
router.get("/receipts/next-number", requireAuth, async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select({ receiptNumber: receiptsTable.receiptNumber })
      .from(receiptsTable)
      .orderBy(desc(receiptsTable.createdAt))
      .limit(20);

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const prefix = `DKMO-RC-${year}${month}-`;

    const nums = rows
      .map((r) => {
        const m = r.receiptNumber.match(/DKMO-RC-\d{6}-(\d+)/);
        return m ? parseInt(m[1]!, 10) : 0;
      })
      .filter((n) => n > 0);

    const maxNum = nums.length > 0 ? Math.max(...nums) : 0;
    const nextNum = String(maxNum + 1).padStart(4, "0");
    res.json({ nextNumber: `${prefix}${nextNum}` });
  } catch (err) {
    req.log.error({ err }, "getNextReceiptNumber failed");
    res.status(500).json({ error: "Failed to get next receipt number" });
  }
});

router.get("/receipts/verify/:receiptNumber", async (req, res): Promise<void> => {
  try {
    const { receiptNumber } = req.params;
    const [row] = await db
      .select()
      .from(receiptsTable)
      .where(eq(receiptsTable.receiptNumber, receiptNumber));
    if (!row) {
      res.status(404).json({ verified: false, error: "Receipt not found" });
      return;
    }
    res.json({
      verified: true,
      receiptNumber: row.receiptNumber,
      memberName: row.memberName,
      dkmoId: row.dkmoId ?? "",
      receiptDate: row.receiptDate,
      amount: Number(row.amount),
      paymentTypes: row.paymentTypes ?? "{}",
      issuedAt: row.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "verifyReceipt failed");
    res.status(500).json({ error: "Failed to verify receipt" });
  }
});

router.use(requireAuth);

const ReceiptRecordInput = z.object({
  receiptNumber: z.string().min(1),
  receiptDate: z.string().min(1),
  memberName: z.string().min(1),
  dkmoId: z.string().optional().default(""),
  jamathName: z.string().optional().default(""),
  mobileNumber: z.string().optional().default(""),
  whatsappNumber: z.string().optional().default(""),
  amount: z.number().min(0).default(0),
  paymentTypes: z.string().optional().default("{}"),
});

function receiptToApi(row: any) {
  return {
    id: row.id,
    receiptNumber: row.receiptNumber,
    receiptDate: row.receiptDate,
    memberName: row.memberName,
    dkmoId: row.dkmoId ?? "",
    jamathName: row.jamathName ?? "",
    mobileNumber: row.mobileNumber ?? "",
    whatsappNumber: row.whatsappNumber ?? "",
    amount: Number(row.amount),
    paymentTypes: row.paymentTypes ?? "{}",
    createdBy: row.createdBy ?? "",
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/receipts", async (req, res): Promise<void> => {
  try {
    const { search, page = "1", pageSize = "25" } = req.query as Record<string, string>;
    const p = Math.max(1, parseInt(page, 10));
    const ps = Math.min(100, Math.max(1, parseInt(pageSize, 10)));

    let baseQuery = db.select().from(receiptsTable).$dynamic();
    let countQuery = db.select({ count: count() }).from(receiptsTable).$dynamic();

    if (search) {
      const pattern = `%${search}%`;
      const cond = or(
        ilike(receiptsTable.memberName, pattern),
        ilike(receiptsTable.receiptNumber, pattern),
        ilike(receiptsTable.dkmoId, pattern),
      );
      baseQuery = baseQuery.where(cond);
      countQuery = countQuery.where(cond);
    }

    const [rows, [{ count: total }]] = await Promise.all([
      baseQuery.orderBy(desc(receiptsTable.createdAt)).limit(ps).offset((p - 1) * ps),
      countQuery,
    ]);

    res.json({ items: rows.map(receiptToApi), total: Number(total) });
  } catch (err) {
    req.log.error({ err }, "listReceiptRecords failed");
    res.status(500).json({ error: "Failed to list receipts" });
  }
});

router.post("/receipts", async (req, res): Promise<void> => {
  try {
    const parsed = ReceiptRecordInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }
    const userId = (req as AuthedRequest).userId ?? "";
    const { amount, ...rest } = parsed.data;
    const [row] = await db.insert(receiptsTable).values({
      ...rest,
      amount: String(amount),
      createdBy: userId,
    }).returning();
    res.status(201).json(receiptToApi(row));
  } catch (err) {
    req.log.error({ err }, "createReceiptRecord failed");
    res.status(500).json({ error: "Failed to create receipt record" });
  }
});

router.delete("/receipts/:id", async (req, res): Promise<void> => {
  try {
    await db.delete(receiptsTable).where(eq(receiptsTable.id, req.params.id));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "deleteReceiptRecord failed");
    res.status(500).json({ error: "Failed to delete receipt record" });
  }
});

export default router;
