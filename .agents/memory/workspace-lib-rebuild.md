---
name: Stale workspace lib types
description: TypeScript project references serve stale .d.ts for lib/* until rebuilt
---
- The portal and api-server typecheck against compiled declarations of workspace libs (project references + tsconfig.tsbuildinfo/dist), even though package.json exports point at src.
**Why:** after rewriting lib/api-client-react/src/loans.ts and lib/db schema, `tsc --noEmit` in consumers reported the OLD exports until `npx tsc -b` was run inside each edited lib.
**How to apply:** whenever you add/change exports in `lib/db` or `lib/api-client-react`, run `npx tsc -b` in that lib before typechecking or trusting errors in consuming packages.
