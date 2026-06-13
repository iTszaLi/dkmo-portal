import session, { type SessionOptions } from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import type { RequestHandler } from "express";
import { logger } from "./logger";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    lastSeenAt?: number;
  }
}

const SESSION_TTL_MS = 1000 * 60 * 30;
const SESSION_TABLE = "user_sessions";

const SESSION_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "${SESSION_TABLE}" (
  "sid"    varchar      NOT NULL COLLATE "default",
  "sess"   json         NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "${SESSION_TABLE}_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX IF NOT EXISTS "IDX_${SESSION_TABLE}_expire" ON "${SESSION_TABLE}" ("expire");
`;

let initPromise: Promise<void> | null = null;

async function ensureSessionTable(pool: pg.Pool): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      await pool.query(SESSION_SCHEMA_SQL);
      logger.info({ table: SESSION_TABLE }, "Session table ready");
    } catch (err) {
      logger.error({ err }, "Failed to ensure session table exists");
      throw err;
    }
  })();
  return initPromise;
}

export function createSessionMiddleware(): RequestHandler {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is required.");
  }
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required.");
  }

  const PgStore = connectPgSimple(session);
  const pool = new pg.Pool({ connectionString: databaseUrl });

  void ensureSessionTable(pool);

  const options: SessionOptions = {
    name: "dkmo.sid",
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: new PgStore({
      pool,
      tableName: SESSION_TABLE,
      createTableIfMissing: false,
      pruneSessionInterval: 60 * 15,
    }),
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: SESSION_TTL_MS,
      path: "/",
    },
  };

  const middleware = session(options);

  const wrapped: RequestHandler = (req, res, next) => {
    ensureSessionTable(pool)
      .then(() => {
        middleware(req, res, (err) => {
          if (err) return next(err);
          if (req.session && req.session.userId) {
            const now = Date.now();
            const last = req.session.lastSeenAt ?? 0;
            if (now - last > SESSION_TTL_MS) {
              req.session.destroy(() => next());
              return;
            }
            req.session.lastSeenAt = now;
          }
          next();
        });
      })
      .catch(next);
  };

  return wrapped;
}
