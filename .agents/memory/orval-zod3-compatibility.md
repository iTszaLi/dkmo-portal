---
name: Orval and Zod 3 compatibility
description: The workspace uses Zod 3 while the current Orval generator can emit Zod 4-only helpers.
---

The API code generator must normalize Zod 4-only `int()` and `uuid()` helpers to Zod 3-compatible `number().int()` and `string().uuid()` forms, and cast generated `Headers.entries()` access where the current TypeScript DOM lib lacks that declaration.

**Why:** Regenerated contracts otherwise pass generation but crash the API at module load, or fail the workspace library typecheck.

**How to apply:** Keep the normalization in the API spec post-generation script so every future codegen run produces runnable shared libraries.