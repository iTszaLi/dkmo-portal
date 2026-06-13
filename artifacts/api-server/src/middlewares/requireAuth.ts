import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getUserById, type Role } from "../lib/users";

export type AuthedRequest = Request & { userId: string; userRole: Role };

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const user = getUserById(userId);
  if (!user) {
    req.session?.destroy(() => {
      res.status(401).json({ error: "Unauthorized" });
    });
    return;
  }
  const r = req as AuthedRequest;
  r.userId = userId;
  r.userRole = user.role;
  next();
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, res, next) => {
    const role = (req as AuthedRequest).userRole;
    if (!role) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(role)) {
      res.status(403).json({ error: "Forbidden: insufficient role." });
      return;
    }
    next();
  };
}
