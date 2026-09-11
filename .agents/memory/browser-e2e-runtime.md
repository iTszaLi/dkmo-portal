---
name: Browser e2e runtime
description: Native runtime requirements for running Playwright browser checks in this workspace.
---

Playwright browser checks require both the downloaded Chromium binary and native Nix runtime libraries for GTK, GLib, GBM, XKB, and the Chromium graphics stack.

**Why:** The JavaScript test package can install successfully while Chromium still fails to launch with missing shared-library errors.

**How to apply:** When browser checks are added or run in a fresh workspace, install the Playwright browser and keep the required native packages in the workspace Nix dependencies.