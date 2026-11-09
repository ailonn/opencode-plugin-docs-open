# D2a — host crash on destruction of a custom code-block renderable

- **Symptom**: TUI crash `Error: remove expects a renderable child object` while an
  assistant-emitted `doc` fence is streamed (the host replaces the block on every
  token change).
- **Root cause**: the host parents plugin renderables in its own tree, and its
  `remove` does a strict `instanceof` of its own `Renderable` class — a plugin ships
  its own `@opentui/core` copy, so its renderable instances are rejected. Verified on
  host 2.2.5 and core 0.8.2 (same check). Upstream family: `anomalyco/opencode`
  #43693 / #43696.
- **Why the plugin ends up with its own copy** (refined 2026-11-05, upstream reply on
  `#62051`): the host's runtime rewrite loader is active at load time, but only for the
  plugin's **entry file**. A nested source file imported with a `.js` specifier (Bun TS
  convention) is registered under the nonexistent `.js` path (`realpathSync` failure is
  silently caught), so it loads natively, untransformed — its bare `@opentui/core` import
  then resolves to the plugin's own `node_modules` copy. Entry-file imports are rewritten
  (host copy, no crash). The plugin-directory symlink is not a factor. Live repro:
  minimal two-part plugin, nested import, own core copy → 100% crash on a streamed fence;
  full stack shows `remove` in the host bundle and the caller frames in the plugin's own
  `@opentui/core`.
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

## D13 (2026-11-05) — renderer reactivation (decision "renderer-reactivation")

The passthrough fix above is **superseded for the renderer**: the custom v2
renderer is reactivated **without waiting for a host fix** — the
upstream-preconized workaround (`anomalyco/opencode#62051`, bot confirmation),
double-confirmed by the live two-part repro and the full-stack capture above.

- **Fix**: the nested TUI imports in `src/tui.ts` (adapters `doc-block`,
  `opentui-root-click`, `opentui-screen-reader`) carry the **`.ts` spelling** —
  the path then exists on disk, so the host's runtime rewrite covers the files
  and `@opentui/core` resolves to the single host copy. The D2a failure point
  (a `.js` specifier resolving a nonexistent path → native load → the plugin's
  own core) cannot form. (Bun loads `.ts` specifiers natively — the bun
  harness is unaffected.)
- **Automated regression (CI)**: `test/harness/fence-reactivation.test.ts` —
  the real `setup` registers the custom renderer for the `doc` fence, the TUI
  entry imports the TUI adapters with the `.ts` spelling (D2a guard), and a
  running-text click still opens through the root layer.
  (`test/harness/fence-passthrough.test.ts` deleted — superseded.)
- **Black box (manual, each host bump)**: the double-instance crash is only
  visible in a real TUI (the test renderer is the plugin's own core copy) —
  the re-acceptation protocol below. The fix depends on the host loader's
  behavior — **re-test on every host bump**.
- **Fallback**: if the host loader ever regresses, revert to passthrough
  (D9, git history) — the documented fallback, a one-line revert in `src/tui.ts`.

### Re-acceptation protocol C1–C7 (host 2.2.5, run 2026-11-05/06)

Environment — **persistent scratch root** (survives PC reboots; only the TUI
daemon process must be relaunched — one command, below). The 2026-11-06 run
used `/tmp/opencode/docs-accept` (wiped at reboot); since the 2026-11-09 run
the root is `$HOME/opencode/docs-accept` and the seeds live under `$R/qa`
(the `/docs` dialog probes files, so the seeds must exist on disk).

```sh
R=$HOME/opencode/docs-accept  # scratch root (persistent)
W=<plugin checkout>           # the opencode-docs dir of this repo's checkout (worktree or main)
mkdir -p "$R/project" "$R/bin" "$R/qa"
cat > "$R/project/opencode.json" <<EOF
{ "\$schema": "https://opencode.ai/config.json",
  "plugins": ["$W"] }
EOF
for s in a b run; do printf '# seed %s\ncontenu test\n' "$s" > "$R/qa/d13-$s.md"; done
ln -sf "$W/acceptance/fake-xdg-open" "$R/bin/xdg-open"
python3 ~/bin/opencode-tools/opencode_tui_driver.py daemon \
  --state-dir "$R/d" --rows 32 --cols 120 \
  --env PATH="$R/bin:$PATH" \
  --env FAKE_XDG_OPEN_LOG="$R/xdg.log" \
  -- opencode "$R/project"
```

Driver notes: the daemon flags (`--state-dir/--rows/--cols/--env`) go
**before** `--` (the child receives only `opencode <project-dir>`); key names
are e.g. `escape` (not `esc`); the `screen` command is flaky — poll
`d/result.jsonl` for the `{ok, id, lines}` answer. Client:
`python3 <repo>/opencode-docs/qa/tui-drive.py --state-dir $R/d <command>` —
`screen | find T | click X Y [BUTTON] | hover X Y | attr X Y | text T |
keys NAME... | wait-quiet [MS] | wait-marker T [MS] | state | log`.

Steps:

- **C1 — crash trigger**: send the message below → the streamed fence (the
  block is replaced on every token change) must render without a crash, TUI
  alive.
- **C2** (AC-8): `attr` on a doc line inside the fence → fg = the theme link
  color, distinct from running text; the non-doc line renders in plain style.
- **C3** (AC-9): click a doc line inside the fence → `xdg.log` gets **exactly
  one** call, path verbatim (`call argc=1` / path / `---`).
- **C4** (AC-12): hover a doc line → `attr` underline on; move away → off.
- **C5** (AC-10): click the non-doc line (`notes non document`) → log unchanged.
- **C6** (v3 root layer — unchanged by D13): a second message citing
  `/tmp/opencode/qa/d13-run.md` in plain text (no markdown) → click the path →
  one call.
- **C7** (v1 `/docs`): `/docs` → select a document → one call.

C1 message (template — `$R/qa` = the seeds above, substituted at send time):

````text
Écris d'abord ce bloc de code, exactement comme ceci, sans rien modifier :
```doc
$R/qa/d13-a.md
$R/qa/d13-b.md
notes non document
```
Puis écris environ 40 lignes de texte libre en français décrivant la météo d'automne.
````

Expected fence: `d13-a.md` + `d13-b.md` = doc lines (link style, clickable),
`notes non document` = non-doc line (plain, inert).

- **Status**: GREEN committed on branch `d13-renderer-reactivation` (spec
  `398f133`, RED `8b3f186`, GREEN `da3b162` — 127 vitest + 18 harness + tsc
  clean), branch pushed to origin.

- **TUI re-acceptation C1–C7 — DONE 2026-11-06** (host 2.2.5, env
  `/tmp/opencode/docs-accept`, driver daemon + `qa/tui-drive.py`):

| Case | Criterion | Result |
|---|---|---|
| C1 | streamed fence, no crash, renderer active | ✓ — 2 m 45 s stream (47.9 tok/s), TUI alive; assistant fence rendered **without** markers/border (renderer active) while the user-echoed fence keeps its markers (contrast proof) |
| C2 | doc line = theme link color | ✓ (limitation documented) — code applies the right tokens (`doc-block.ts:78` `markdown.linkText`, `:104` `text.muted`); raw SGR: doc / non-doc / body all `38;2;238;238;238` (#eeeeee) → in the default theme `linkText == text.muted == text.base` (indistinguishable by color = theme design, not a renderer defect); no underline at rest (hover-only, as coded) |
| C3 | click doc line → exactly one call | ✓ — (10,14) → exactly 1 call verbatim `d13-a.md`; re-proved (20,14) → exactly +1 (3→6 log lines), no double open (AC-17 holds) |
| C4 | hover → underline on / off | ⚠ contract ✓ (harness `doc-block.test.ts:106`, 18/18 at `da3b162`) — TUI blocked by host 2.2.5 (see findings) |
| C5 | click non-doc line → no call | ✓ — (10,16), log unchanged |
| C6 | v3 root layer unchanged (plain path opens) | ✓ — (20,15) on a plain path **outside any fence** (no plugin handler there) → exactly 1 new call (6→9): the host's text-based root click layer is alive |
| C7 | `/docs` → select doc → one call | ✓ — dialog lists the session's 3 docs (selected line bold/inverted); enter on `d13-run.md` → exactly 1 new call (9→12), dialog closed, TUI alive |

Findings (host 2.2.5, recorded 2026-11-06):

- **C4 — mouse-move events never reach the plugin's fence lines** (host
  limitation, not a plugin defect): plain-motion SGR (cb=35) aimed at a doc
  line = 0 output bytes, underline never engages — while a click
  (press+release) at the same coordinates dispatches correctly. Moves *are*
  parsed and dispatched: the host's own elements answer them (message margin
  (1,14) → underline+bold+white highlight; footer/composer re-render). The
  native hit-test (`sceneHitTest`, Zig) is not readable; empirical signature:
  the host's click response follows the **text** (C3-bis: click at x=40,
  beyond the path text but inside the full-width row box → no call) →
  text-based host layer. The plugin contract (underline on/off, click,
  `stopPropagation`) is harness-covered (`test/harness/doc-block.test.ts`).
  Re-test at each host bump.
- **Host SGR mouse parser bug**: some move sequences leak their `;M` tail
  into the composer as literal text (visible `;M`/`;M;M` in the composer,
  86–87-byte composer re-renders; observed on single- *and* multi-digit
  wires, state-dependent non-monotone pattern — the same wire leaks or not on
  successive sends; clicks never leaked in our runs; idle output = 0 bytes,
  so the re-renders are genuine responses). Affects any scripted driver of
  this TUI: purge the composer (backspaces) and verify it is clean before
  sending a message.
- **C3 attribution (indistinguishable at TUI level)**: the single call can
  come from the host's text-based root layer (proven alive by C6) or from the
  plugin handler (hit lands on the label leaf, `stopPropagation` prevents the
  double open). Both readings fit every observation (text-following clicks,
  C3-bis no-call, C6 call). The behavioral criterion « exactly one call » is
  met either way; the plugin contract is harness-covered.
- **C2 — default-theme palette** (empirical, from the raw stream): #eeeeee
  assistant body text (= `markdown.linkText` = `text.muted`), #ffffff user
  message, #97682c Thought label. Theme default values live in the host
  binary (`@opencode/theme` ships the resolver only).
- **Driver fix `126b986`** (`~/bin/opencode-tools` — local repo, no remote):
  the daemon `hover` emitted cb=32 (left-button motion = drag) instead of
  cb=35 (plain motion) — spec + self-test RED→GREEN. Note: this host maps
  both 32 and 35 to `type "move"` when no button is pressed, so the fix is
  encoding-correct but was **not** the cause of the C4 block.
- **Harness not re-run 2026-11-06**: `bun` unavailable after reboot (vitest
  excludes `test/harness/**`) — coverage remains valid at GREEN `da3b162`
  (18/18); no plugin code changed since (only the `qa/tui-drive.py`
  `send-raw` addition, `c2453a4`).
- **pyte driver limitation**: `attr` resolves TrueColor fg +
  underline/bold/reverse but not the background — hover probes rest on
  fg/underline.
- The acceptance TUI's `/plugins` "1 plugin failed" = the **global
  (symlinked)** plugin copy — `inotify_add_watch … Not a directory` (inotify
  does not follow symlinks; pre-existing on the global config) — **not** the
  plugin under test (zero errors; TUI + server parts loaded, watch
  subscriptions OK).

- **TUI re-acceptation C1–C7 — RE-RUN 2026-11-09 (host 2.2.6)** — the D13
  « re-test at each host bump » clause, triggered by the 2.2.5 → 2.2.6 bump.
  Environment rebuilt on the persistent root `$HOME/opencode/docs-accept`
  (seeds under `$R/qa`), daemon launched detached (survives an opencode
  server restart):

| Case | 2.2.6 result |
|---|---|
| C1 | ✓ — streamed fence, no crash, renderer active: **the `.ts` fix holds across the host bump** (assistant fence without markers, user echo keeps them) |
| C2 | ✓ — all three fence lines still `38;2;238;238;238` (#eeeeee): `linkText == text.muted == text.base` in the default theme; minor palette shift (new label color #92156245) |
| C3 | ✓ — exactly 1 verbatim call, no double open; C3-bis: click beyond the text (inside the full-width row) → no call (text-following signature unchanged) |
| C4 | ⚠ — **block persists on 2.2.6**: moves are dispatched (host elements re-render — 2125 bytes, position-independent) but the plugin's fence lines never underline; contract remains harness-covered |
| C5 | ✓ — non-doc line inert |
| C6 | ✓ — plain path outside any fence → exactly 1 call: the root click layer is alive on 2.2.6 |
| C7 | ✓ — `/docs` dialog (3 session docs, selection bold) → exactly 1 call, dialog closed, TUI alive |

2.2.5 → 2.2.6 deltas:
- The `;M` SGR-leak bug (2.2.5) was **not reproduced** on 2.2.6 (0 leaks over
  ~10 mouse events) — not declared fixed: the 2.2.5 pattern was
  state-dependent.
- Host-element hover response changed: 2.2.5 = position-dependent highlight
  (message margin, underline+bold+white) plus 0-byte no-ops; 2.2.6 = a
  uniform 2125-byte re-render (user message box) for any pointer position.
  Same conclusion: the plugin's fence lines are not hover targets.
