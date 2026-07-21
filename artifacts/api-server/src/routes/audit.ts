import { Router, type IRouter } from "express";
import { desc, and, gte, lte, ilike, eq, or, count } from "drizzle-orm";
import { db, auditLogsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const router: IRouter = Router();
router.use(requireAuth);
router.use(requireRole("admin", "finance"));

router.get("/audit-logs", async (req, res): Promise<void> => {
  const {
    module,
    action,
    userId,
    search,
    from,
    to,
    page = "1",
    pageSize = "50",
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSizeNum = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 50));

  const conditions = [];
  if (module && module !== "all") conditions.push(eq(auditLogsTable.module, module));
  if (action && action !== "all") conditions.push(eq(auditLogsTable.action, action));
  if (userId && userId !== "all") conditions.push(eq(auditLogsTable.userId, userId));
  if (from) conditions.push(gte(auditLogsTable.createdAt, new Date(from)));
  if (to) {
    const toDate = new Date(to);
    toDate.setDate(toDate.getDate() + 1);
    conditions.push(lte(auditLogsTable.createdAt, toDate));
  }
  if (search?.trim()) {
    const q = `%${search.trim()}%`;
    conditions.push(
      or(
        ilike(auditLogsTable.userName, q),
        ilike(auditLogsTable.action, q),
        ilike(auditLogsTable.module, q),
        ilike(auditLogsTable.entityName, q),
        ilike(auditLogsTable.details, q),
      ),
    );
  }

  const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);

  const [totalRow] = await db
    .select({ count: count() })
    .from(auditLogsTable)
    .where(where);

  const items = await db
    .select()
    .from(auditLogsTable)
    .where(where)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(pageSizeNum)
    .offset((pageNum - 1) * pageSizeNum);

  res.json({
    items: items.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.userName,
      action: r.action,
      module: r.module,
      entityId: r.entityId ?? null,
      entityName: r.entityName ?? null,
      details: r.details ?? null,
      ipAddress: r.ipAddress ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    total: Number(totalRow?.count ?? 0),
  });
});

export default router;
