---
name: Navigation return context
description: Detail and edit flows carry an internal returnTo path while filtered module lists keep their state in URL parameters.
---

Application Back controls must return through the shared internal `returnTo` contract rather than hardcoded parent URLs. Major list filters, sort values, searches, and pagination should be reflected in the list URL before detail navigation.

**Why:** Hardcoded parent links sent users to a reset or unrelated module view, especially when a detail page was opened from a filtered list or a nested cross-module link.

**How to apply:** Use the shared navigation helpers for list-to-detail links and detail/edit Back controls. Keep return targets relative to the router (strip the mounted `BASE_URL` before storing or navigating) and use canonical module fallbacks for direct detail URLs. Native browser Back remains separate from the application Back control.