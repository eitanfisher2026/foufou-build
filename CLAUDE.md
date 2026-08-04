# FouFou Build — Claude Context

Admin tool for managing FouFou's cities — areas, interests/categories, and configuration data that the main FouFou app reads. Not a public-facing app.

- **Firebase project:** `bangkok-explorer` — the **same** Firebase project as [FouFou-dev](../FouFou-dev/CLAUDE.md)/[FouFou](../FouFou/CLAUDE.md); this tool edits that shared data, it doesn't have its own backend.
- Access requires `userRole >= 2` (admin) — same role model as the main app (0=regular, 1=editor, 2=admin).
- Sibling of the FouFou app repos, not of Buli/Roy-News/FouFou-Pets (different owner-project cluster).

## Stack
- No build framework — single `app.js` (~280KB) loaded via `<script type="text/babel" src="app.js">` (in-browser Babel compile), React 18 + Tailwind CDN + Firebase compat SDK v9.22.0, all via CDN `<script>` tags in `index.html`.
- Versioned like the other single-file apps here (`v1.0.X` tags in commit messages) — bump on every change, same spirit as FouFou/Buli/Roy-News even though there's no separate `VERSION` constant convention confirmed yet here.

## What it actually does (inferred from the data files present — verify before deep changes)
- `customInterests.json` / `customInterests2.json` / `interestConfig.json` — per-city interest/category configuration data, the main editable content this tool manages.
- `migrate-interest-ids.js` — a one-off migration script; check whether it's still relevant before assuming it needs re-running.
- `export-interests.html`, `feature-graphic*.html` — standalone auxiliary/export tools, not part of the main app flow.
- `Google place types.txt` — reference data for mapping to Google Places API types.

## Standing workflow rules (shared across Eitan's projects)
- **Decide and act, don't ask process questions.** Carry an agreed change through to commit/push without pausing for permission at each step, unless it's genuinely irreversible.
- **Batch fixes into one deploy/commit pass** rather than one per tiny change.
- Communicate in product-level terms, not code details — see the global `~/.claude/CLAUDE.md`.

## Gaps to fill in as they come up
This file was written from a light structural pass (file listing, script tags, Firebase config, role gate), not a deep read of `app.js`. Expand this file with real architecture notes (state shape, key components, Firebase read/write patterns) the next time substantial work happens here — don't let it go stale as a thin stub.
