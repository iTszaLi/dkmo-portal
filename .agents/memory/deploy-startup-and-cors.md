---
name: Autoscale startup budget & credentialed CORS
description: Why sync CPU work at module load breaks publishes, and how CORS must be scoped for the session-cookie auth.
---
- Rule: never do synchronous CPU-heavy work (e.g. bcrypt.hashSync) at module load in the API server; defer to lazy async init.
  **Why:** Autoscale publish died at "Creating Autoscale service" because the health probe timed out during cold start; making seed-user hashing lazy/async fixed publishing.
  **How to apply:** any startup-path crypto/IO must be async and off the request-critical path until first use.
- Rule: CORS must use an explicit allowlist (REPLIT_DEV_DOMAIN + REPLIT_DOMAINS + localhost), never `origin: true` with `credentials: true`.
  **Why:** session cookie is SameSite=none; reflecting arbitrary origins with credentials allows cross-origin authenticated reads.
- Seed executive passwords are overridable via EXEC_PASSWORD / EXEC_PASSWORD_<USERNAME> env secrets; the hardcoded value is a dev-only fallback — production must set the secret.
