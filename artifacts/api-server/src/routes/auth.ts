import { Router, type IRouter } from "express";
import { verifyCredentials, publicUser } from "../lib/users";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

// Simple per-IP login throttle to slow brute-force attempts. In-memory is
// acceptable: autoscale instances are short-lived and bcrypt already makes
// each attempt expensive.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 20;
const loginAttempts = new Map<string, { count: number; windowStart: number }>();

function isLoginThrottled(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, windowStart: now });
    if (loginAttempts.size > 10_000) {
      for (const [k, v] of loginAttempts) {
        if (now - v.windowStart > LOGIN_WINDOW_MS) loginAttempts.delete(k);
      }
    }
    return false;
  }
  entry.count += 1;
  return entry.count > LOGIN_MAX_ATTEMPTS;
}

router.post("/auth/login", async (req, res): Promise<void> => {
  if (isLoginThrottled(req.ip ?? "unknown")) {
    res.status(429).json({ error: "Too many login attempts. Please try again in a few minutes." });
    return;
  }
  const body = (req.body ?? {}) as { username?: unknown; password?: unknown };
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required." });
    return;
  }

  const user = await verifyCredentials(username, password);
  if (!user) {
    res.status(401).json({ error: "Invalid username or password." });
    return;
  }

  if (!req.session) {
    res.status(500).json({ error: "Session unavailable." });
    return;
  }

  req.session.regenerate((err) => {
    if (err) {
      req.log.error({ err }, "Failed to regenerate session");
      res.status(500).json({ error: "Login failed. Please try again." });
      return;
    }
    req.session.userId = user.id;
    req.session.lastSeenAt = Date.now();
    req.session.save((saveErr) => {
      if (saveErr) {
        req.log.error({ err: saveErr }, "Failed to save session");
        res.status(500).json({ error: "Login failed. Please try again." });
        return;
      }
      logAudit(req, "login", "auth", { userId: user.id, userName: user.displayName, details: `User logged in as ${user.role}` });
      res.json({ user: publicUser(user) });
    });
  });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  if (!req.session) {
    res.status(204).end();
    return;
  }
  const userId = req.session.userId;
  logAudit(req, "logout", "auth", { userId: userId ?? "unknown", details: "User logged out" });
  req.session.destroy((err) => {
    if (err) {
      req.log.error({ err }, "Failed to destroy session");
      res.status(500).json({ error: "Logout failed." });
      return;
    }
    res.clearCookie("dkmo.sid", { path: "/" });
    res.status(204).end();
  });
});

export default router;
