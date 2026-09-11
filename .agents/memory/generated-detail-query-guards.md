---
name: Generated detail-query guards
description: Empty string route parameters can resolve to collection endpoints in generated API hooks.
---

Generated detail hooks only disable themselves for `null` or `undefined`; an empty string may still request a collection URL such as `/meetings/`. Components with auto-selected detail records must explicitly set `enabled: Boolean(id)` before reading detail-only fields.

**Why:** The collection response can be assigned to the detail type at compile time but lacks fields such as `attendance`, causing a runtime crash.

**How to apply:** When a detail hook receives a stateful or initially empty ID, provide the generated query key and an explicit enabled condition.