import { Router, type IRouter } from "express";
import { verifyCredentials, publicUser } from "../lib/users";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
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
      res.json({ user: publicUser(user) });
    });
  });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  if (!req.session) {
    res.status(204).end();
    return;
  }
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
