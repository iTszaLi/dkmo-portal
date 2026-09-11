---
name: Bulk SQL staging
description: Safe execution pattern for large audited database imports that exceed database-tool process limits.
---

Large row-by-row SQL payloads can fail before execution with an operating-system argument-size error.

**Why:** A single generated statement for a thousand JSON-rich records exceeded the database tool's process limit even though the SQL itself was valid.

**How to apply:** Upload validated rows to a temporary-purpose persistent staging table in small parameterized JSON batches, verify counts and unique keys, then perform the destructive replacement and reconciliation in one short transaction. Clear and remove the staging table afterward.