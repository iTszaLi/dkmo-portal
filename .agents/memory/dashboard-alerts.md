---
name: Dashboard notification alerts
description: How operational notifications are surfaced in the DKMO portal.
---

# Dashboard notification alerts

New public membership applications remain visible in the portal notification bell while their application status is `submitted`. Moving an application to review, approval, or rejection clears that notification because the current queue is no longer new.

**Why:** administrators need a prompt to review newly submitted applications without introducing a separate real-time notification service.

**How to apply:** add operational notification items to the authenticated dashboard alerts endpoint; the shared notification bell polls that endpoint and links each item to the relevant module.