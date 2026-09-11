---
name: Imported member activity dates
description: Which member date is authoritative for dashboard activity and monthly growth.
---

Imported member rows receive a batch timestamp in `created_at`, so that field is not an authoritative membership-activity date for legacy data. Use the normalized legacy membership date, falling back to the legacy entry date when present; exclude imported rows with no valid source date rather than counting the import batch.

**Why:** The development database showed every imported member as created in the current month even though their real membership dates were historical. Treating the batch timestamp as activity inflated “new this month” and growth metrics.

**How to apply:** For non-imported members, application creation time can represent new-member activity. For imported members, only a normalized legacy date should feed monthly activity metrics.