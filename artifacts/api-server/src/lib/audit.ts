import { db, auditLogsTable } from "@workspace/db";
import { getUserById } from "./users";
import type { Request } from "express";

function getIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]!.trim();
  return req.socket.remoteAddress ?? "";
}

export async function logAudit(
  req: Request & { userId?: string },
  action: string,
  module: string,
  opts?: {
    entityId?: string;
    entityName?: string;
    details?: string;
    userId?: string;
    userName?: string;
  },
): Promise<void> {
  try {
    const uid = opts?.userId ?? req.userId ?? "system";
    const user = getUserById(uid);
    const userName = opts?.userName ?? user?.displayName ?? uid;
    await db.insert(auditLogsTable).values({
      userId: uid,
      userName,
      action,
      module,
      entityId: opts?.entityId ?? null,
      entityName: opts?.entityName ?? null,
      details: process.env.NODE_ENV === "test" && req.headers["x-dkmo-test-run"]
        ? `[test-run:${String(req.headers["x-dkmo-test-run"]).slice(0, 120)}] ${opts?.details ?? ""}`.trim()
        : opts?.details ?? null,
      ipAddress: getIp(req),
      userAgent: (req.headers["user-agent"] ?? "").slice(0, 512) || null,
    });
  } catch {
    // Audit logging must never block main operations
  }
}
