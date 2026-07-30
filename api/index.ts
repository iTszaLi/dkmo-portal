// Vercel Serverless Function entry point.
//
// Vercel's Node.js runtime (@vercel/node) detects this file, bundles the
// Express app from the workspace source, and serves every /api/* request
// through it (see the rewrite in vercel.json). The same Express app also
// runs as a normal long-lived server in development via
// artifacts/api-server/src/index.ts.
import app from "../artifacts/api-server/src/app";

export default app;
