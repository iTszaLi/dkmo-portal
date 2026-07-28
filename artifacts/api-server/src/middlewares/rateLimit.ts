import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Lightweight in-memory sliding-window rate limiter for public (unauthenticated)
 * endpoints, to slow down scraping/enumeration. Keyed by client IP.
 */
export function publicRateLimit(maxRequests: number, windowMs: number): RequestHandler {
  const hits = new Map<string, number[]>();

  // Periodic cleanup so the map doesn't grow unbounded.
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, times] of hits) {
      const fresh = times.filter((t) => t > cutoff);
      if (fresh.length === 0) hits.delete(key);
      else hits.set(key, fresh);
    }
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip ?? "unknown";
    const now = Date.now();
    const cutoff = now - windowMs;
    const times = (hits.get(ip) ?? []).filter((t) => t > cutoff);
    if (times.length >= maxRequests) {
      res.status(429).json({ error: "Too many requests — please try again shortly." });
      return;
    }
    times.push(now);
    hits.set(ip, times);
    next();
  };
}
