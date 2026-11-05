# D2a — host crash on destruction of a custom code-block renderable

- **Symptom**: TUI crash `Error: remove expects a renderable child object` while an
  assistant-emitted `doc` fence is streamed (the host replaces the block on every
  token change).
- **Root cause**: the host parents plugin renderables in its own tree, and its
  `remove` does a strict `instanceof` of its own `Renderable` class — a plugin ships
  its own `@opentui/core` copy, so its renderable instances are rejected. Verified on
  host 2.2.5 and core 0.8.2 (same check). Upstream family: `anomalyco/opencode`
  #43693 / #43696.
- **Fix**: decision "fence-passthrough" — the plugin registers **no** custom code
  block renderer; `doc` fences render as the host's standard code block, and their
  document lines open through the root click layer (the v2 renderer code is kept in
  the development git history, unreachable from the published package).
- **Regression (automated)**: `test/harness/fence-passthrough.test.ts` (CI) — asserts
  the plugin's real `setup` never calls `markdown.registerCodeBlockRenderer`, and
  drives a real mouse click on a rendered fence line through the full chain (spawn
  caught by the `acceptance/fake-xdg-open` on PATH).
- **Black box (manual, each host bump)**: in a real TUI, stream an assistant message
  containing a `doc` fence → no crash, TUI alive; then click a document line inside
  the fence → exactly one open.
- **Seed (verbatim, black box)**: create the file `touch /tmp/opencode/qa/d2a-seed.md`,
  then ask the assistant to answer with a `doc` fence citing that single path — the
  streamed fence is the crash trigger.
- **Status**: fixed and accepted 2026-11-04 (acceptance run 2 — all cases green,
  including the crash trigger replayed on streamed fences).
