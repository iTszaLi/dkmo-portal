import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { getUserById, publicUser } from "../lib/users";

const router: IRouter = Router();

router.get("/me", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as typeof req & { userId: string }).userId;
  const user = getUserById(userId);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const u = publicUser(user);
  res.json({
    userId: u.userId,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    email: null,
    firstName: u.displayName.split(" ")[0] ?? u.displayName,
    lastName: u.displayName.split(" ").slice(1).join(" ") || null,
  });
});

export default router;
