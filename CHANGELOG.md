# Changelog

All notable changes to `opencode-plugin-docs-open` are documented here.

## v0.4.0 — 2026-11-04

First public release.

### Added

- **Click-to-open on doc paths (TUI)**: a single plain left click on any document
  path — in assistant/user/tool message running text, or on a line of a `doc` code
  fence — opens it via `xdg-open`. Candidate = maximal path token around the
  clicked column (unicode letters/digits + `._~/-'`, requires `/`, document suffix,
  trailing punctuation stripped); absolute / `~/` / session-relative resolution
  (session root read at click time); silent no-op on missing file, markdown link
  under cursor, composer click or modified click; toast on open failure. No new
  agent instruction is required for running text — existing paths are clickable
  as-is.
- **`/docs` slash command (TUI)**: select dialog of the session's cited documents
  (tool calls `read` / `write` / `edit` / `shell` + message text), `file-name —
  parent folder` options; empty session → toast; open failure → error toast, the
  TUI stays operational.
- **`doc` fences (server part)**: an idempotent instruction is injected into the
  system prompts of the agents that carry one, teaching them to cite documents in
  `doc` fences (one path per line); agents with an empty system prompt are skipped.
  The fence renders as the host's **standard code block** — passthrough on purpose:
  a plugin-provided custom code-block renderer is parented in the host's render
  tree, and the host destroys replaced blocks with a strict `instanceof` check
  against its own `Renderable` class, which crashed the TUI on every streaming token
  change (known host bug family `anomalyco/opencode` #43693 / #43696). Document
  lines inside a fence open through the same root click layer as running text (same
  guards).

### Fixed

- **Real failure toasts (D10)**: the open promise now settles on the viewer's
  **exit** — a non-zero exit is reported with an error toast carrying the exit
  code, as are a signal kill and a spawn failure (viewer missing). The dialog and
  the click flow probe the file before opening (gone file → clear "file not found"
  toast); a directory named `*.md` is never opened. Previously the promise settled
  at spawn, so a file disappearing before the viewer started was silent — while the
  README promised an error toast.
- **Clicks after mouse motion (host 2.2.5 / core 0.8.2)**: the host leaves the
  mouse-release drag flag unset after any motion/hover event (and sometimes
  double-dispatches the release, observed 1 ms apart); the plugin treated those
  releases as non-clicks, silently dropping about half of all real clicks (a
  physical mouse always moves before it presses). An untracked release is now a
  plain click — only an explicit drag end is excluded, and moved selections were
  already excluded by the fresh-cell-selection guard — and identical releases
  within 250 ms are deduplicated (no double open). Live-verified: 13/13 in a
  controlled click matrix (before: ~half of hover-prefixed clicks dead).
- **Dialog ordering and resolution (D11/D12)**: the dialog sorted by first
  occurrence (re-citing a document never bumped it) and passed raw paths to the
  viewer — a bare relative citation resolved against the TUI process CWD and was
  silently never opened. Now: the last occurrence wins, every entry is resolved
  against the session root and home (one rule, shared with the click flow),
  deduplicated by resolved path, and sorted most-recently-cited first; the picked
  file is probed before opening.
- **Injected instruction cites relative-first (D11)**: the instruction carried an
  absolute example, biasing agents toward paths the TUI could not open from the
  dialog. The body now prefers paths relative to the working directory (absolute or
  `~/` only when the file is outside it) with a relative example; the first line
  (the idempotence marker) is stable across versions, so a prompt carrying a
  previous body is recognized and left alone.
- **Agents with an empty system prompt are skipped (AC-23)**: no empty prompt is
  injected and no crash.

### Notes

- v0.4.0 is the **first public release**; v0.1.0, v0.2.0 and v0.3.0 were
  development-only and never published — v0.3.0 in particular existed only as a
  local development tag, hence the version jump.
- Documented limitations (see README → Limitations): a path wrapped over two lines
  or containing spaces is not clickable; no hover affordance; `doc` fences carry no
  visual marker on opencode 2.2.5; the host's "Message Actions" menu swallows the
  clicks under it on user messages; the virtualized tool-output window can shift
  (the plugin reads the line at click time, so a click opens what is under the
  cursor); plugin options are not propagated by the host on 2.2.5, so the
  `clickable: false` opt-out is not effective there. Host-bound items are re-tested
  at each host bump.
- Install: clone + `pnpm install` + absolute path in the config (v0: the package is
  not published to npm).
- Single maintainer in v0.
