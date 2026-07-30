// Vercel Serverless Function entry point (catch-all: handles every /api/*
// request via Vercel's file-system routing — no rewrite needed, and Express
// receives the original request URL, e.g. /api/auth/login).
//
// The same Express app also runs as a normal long-lived server in
// development via artifacts/api-server/src/index.ts.
import app from "../artifacts/api-server/src/app";

export default app;
