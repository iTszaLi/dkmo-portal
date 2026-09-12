import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { createSessionMiddleware } from "./lib/session";
import router from "./routes";
import healthRouter from "./routes/health";
import { logger } from "./lib/logger";

const app = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Only allow credentialed requests from this app's own domains (dev preview
// and published domains). Same-origin requests have no Origin header and are
// unaffected.
const allowedOrigins = new Set<string>();
if (process.env.REPLIT_DEV_DOMAIN) allowedOrigins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
for (const d of (process.env.REPLIT_DOMAINS ?? "").split(",")) {
  if (d.trim()) allowedOrigins.add(`https://${d.trim()}`);
}
// Extra origins for non-Replit hosting (e.g. a Vercel frontend):
// CORS_ORIGINS=https://dkmo-portal.vercel.app,https://example.com
for (const d of (process.env.CORS_ORIGINS ?? "").split(",")) {
  if (d.trim()) allowedOrigins.add(d.trim().replace(/\/$/, ""));
}
app.use(
  cors({
    credentials: true,
    origin: (origin, cb) => {
      // localhost is only trusted during local development, never in production.
      const devLocalhost =
        process.env.NODE_ENV !== "production" && origin?.startsWith("http://localhost");
      if (!origin || allowedOrigins.has(origin) || devLocalhost) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
  }),
);

// Baseline HTTP security headers (no external dependency needed).
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));

// Keep the startup probe independent from the session store. Authenticated
// application routes still pass through the database-backed session middleware.
app.use("/api", healthRouter);
app.use(createSessionMiddleware());

app.use("/api", router);

// Convert body-parser and other errors into JSON so clients never receive an
// HTML error page (which surfaces as an unhelpful runtime overlay in the SPA).
app.use(
  (
    err: Error & { type?: string; status?: number },
    req: Request,
    res: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: NextFunction,
  ) => {
    if (err?.type === "entity.too.large") {
      res.status(413).json({
        error:
          "The uploaded photo is too large. Please choose a smaller image (under 5MB) and try again.",
      });
      return;
    }
    if (err?.type === "entity.parse.failed") {
      res.status(400).json({ error: "Invalid request format. Please try again." });
      return;
    }
    logger.error({ err }, "Unhandled request error");
    res.status(err?.status ?? 500).json({
      error: "Something went wrong on our end. Please try again.",
    });
  },
);

export default app;
