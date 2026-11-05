# opencode-plugin-docs-open

OpenCode plugin: documents cited in a session open with **one click**.

Two parts, one install entry:

- **TUI** — the `/docs` slash command (select dialog of the session's documents)
  and **click-to-open on doc paths** — in running text and on the lines of `doc`
  code fences (assistant, user and tool output messages).
- **server** — teaches every agent to cite documents in `doc` fences.

## Features

### `/docs` slash command (TUI)

- Select dialog: one option per document cited in the current session,
  **most recently cited first** (the last occurrence wins — re-citing a document
  bumps it), displayed as `file-name — parent folder`.
- Every entry is **resolved before opening** (absolute as-is · `~/` against your
  home · relative against the session's working root) and **probed**: a gone file
  is reported with an error toast, never silently dropped.
- Sources: tool calls (`read`, `write`, `edit`, `shell`) + message text.
- Documents = paths with one of: `.md .pdf .docx .odt .pptx .xlsx .txt .png .svg`.
- Empty session → toast; `xdg-open` missing or file gone → error toast, the TUI
  stays operational.

### Click-to-open on doc paths in running text (TUI)

Any document path in the visible session — assistant messages, your messages, tool
output, or a line of a `doc` code fence — opens with a **single plain left click**:

- candidate = the maximal path token around the clicked column of the rendered line:
  unicode letters/digits + `._~/-'`, must contain a `/`, must end with a document
  suffix (`.md .pdf .docx .odt .pptx .xlsx .txt .png .svg`); trailing sentence
  punctuation (`. , ; : ! ) ?`) is stripped before the suffix check;
- resolution: absolute as-is · `~/` against your home · relative against the current
  session's working root (read at click time — follows tab switches);
- guards: nonexistent path → silent no-op · a real markdown link under the cursor →
  the host handles it alone (no double action) · click in the composer → inert ·
  ctrl/alt/shift or a drag release → no-op · success is silent, failure is a toast;
- **click reliability (v0.4.0)**: on opencode 2.2.5 the host leaves its mouse-release
  drag flag unset after any motion/hover event (and sometimes double-dispatches the
  release). The plugin treats an untracked release as a plain click and drops
  duplicate releases within 250 ms — so a click that follows a hover still opens the
  document. (Before v0.4.0 those clicks were silently dead on about half of all real
  clicks — a physical mouse always moves before it presses.)

No new agent instruction is needed: every doc path already in running text is
clickable, whichever agent wrote it.

### `doc` fences (TUI + server)

The server part injects an instruction into the system prompts of the agents that
carry one (idempotent — never stacked twice, never invents a prompt; agents with an
empty system prompt are skipped): cite documents like

````
```doc
docs/file.md
```
````

— **paths relative to your working directory are preferred** (absolute or `~/` only
when the file is outside it), which is exactly what the TUI can resolve and open.

The fence renders as the host's **standard code block** — passthrough on purpose
(see Limitations for why). Its document lines open with a **single plain left click**,
through the same root click layer as running text: non-document lines are inert, and
the same guards apply (above). A fence without any document line is plain inert text.

### Opening

`xdg-open`, spawned **without a shell** — the path is a single argv entry, so spaces,
accents and apostrophes survive verbatim. The open promise is settled on the
viewer's **exit**: a non-zero exit is reported with an error toast carrying the exit
code, as are a signal kill and a spawn failure (viewer missing). The viewer is
spawned detached — it survives the TUI.

## Limitations (v0.4.0)

- A path wrapped over two lines is not clickable (the candidate is per rendered line).
- A path containing spaces is not clickable (the candidate token stops at the space —
  in running text as in `doc` fences).
- No hover affordance: the single left click is the affordance.
- `doc` fences render as the host's standard code block: no link styling, and on
  opencode 2.2.5 standard code blocks carry **no visual marker** (no language label,
  border or distinct color) — a `doc` block is visually indistinguishable from
  indented text. Re-tested at each host bump.
- Why no styled fence: a plugin-provided custom code-block renderer is parented in
  the host's own render tree, and the host destroys replaced blocks with a strict
  `instanceof` check against its own `Renderable` class — a plugin ships its own
  `@opentui/core` copy, so every token change while streaming crashed the TUI (known
  host bug family `anomalyco/opencode` #43693 / #43696). A styled fence returns only
  when the host serves its own core to plugins.
- **Host 2.2.5 — "Message Actions" menu**: a left click inside a **user** message
  box opens the host's context menu (Search / Jump / Revert / Copy / Fork); the
  clicks that land under the open menu are mostly swallowed, so opening a path in
  your own messages happens after `esc` (or a click outside the menu). Re-tested at
  each host bump.
- **Host 2.2.5 — virtualized tool-output window**: long tool output is virtualized
  ("(N earlier lines)") and the visible window can shift while the session runs —
  the same (x, y) is not always the same line. The plugin reads the line **at click
  time**, so a click always opens what is under the cursor; scripted clicks must
  re-locate the target first. Re-tested at each host bump.
- **Host 2.2.5 — plugin options are not propagated**: `context.options` is empty at
  runtime, so the `clickable: false` opt-out (below) is wired and documented but
  **not effective on 2.2.5**. Re-tested at each host bump.

## Install

v0: the package is **not published to npm** — install from a local clone (the host
resolves plugin entries as absolute paths or npm names; a bare name that is not on
npm cannot be resolved).

```sh
git clone https://github.com/ailonn/opencode-plugin-docs-open
cd opencode-plugin-docs-open
pnpm install
```

Then one entry in your OpenCode config loads both parts (server + TUI) — global:
`~/.config/opencode/opencode.jsonc`, or project: `.opencode/opencode.jsonc`:

```jsonc
{
  "plugins": ["/absolute/path/to/opencode-plugin-docs-open"]
}
```

pnpm is the tested package manager (the checked-in lockfile is pnpm's). Requires an
OpenCode V2 release exposing the `@opencode/plugin` + `@opencode/plugin/tui` APIs.
Linux for now (`xdg-open`).

Built and tested against `@opentui/core` 0.8.x (the version bundled by the OpenCode
TUI; peer range `>=0.6.6`). The root click layer attaches `renderer.root.onMouseUp`
— a slot the host does not configure in 0.8.0 (its own mouse handling sits on child
renderables). The slot is single and has no getter, so if a future host version does
configure it, the plugin's assignment would override it — a known, documented risk
(R1 in the spec): report it as an issue if a future OpenCode release loses mouse
behavior in the session view.

### Opt-out

Disable all click behavior (no root click layer, no prompt injection — `doc` fences
stay visible as standard code blocks, their lines become inert):

```jsonc
{
  "plugins": [
    { "package": "/absolute/path/to/opencode-plugin-docs-open", "options": { "clickable": false } }
  ]
}
```

**Note (opencode 2.2.5)**: the host does not propagate `options` to plugins yet
(`context.options` is empty at runtime) — the opt-out is wired and documented but
**not effective on 2.2.5**. Re-tested at each host bump.

## Architecture

Strict clean architecture, one folder per layer, two parts in one package:

| Layer | Path | Role |
|---|---|---|
| Domain | `src/domain/` | pure functions: path extraction, dedupe, recency sort, option format, the idempotent prompt instruction, click policy + path candidate extraction/resolution |
| Application | `src/application/` | use cases (`listSessionDocs`, `openSessionDoc`, `injectDocInstruction`, `openClickedPath`) + driven ports (`SessionRefSource`, `DocOpener`, `AgentSystemSource`, `ScreenReader`, `PathProbe`) |
| Adapters | `src/adapters/` | OpenCode wiring: messages → references, `xdg-open` opener, agent editor, the screen-row reader, the fs existence probe, the root click layer |
| Server part | `src/server.ts` | `agent.transform` → idempotent instruction injection |
| TUI part | `src/tui.ts` | `/docs` command + root click layer (composition root) |

Unit tests sit at the domain, application and mapping seams (fakes over the ports).
The TUI click chain (root layer → `xdg-open` spawn) is additionally covered by a
headless harness (`pnpm test:harness`, bun — the OpenTUI native FFI is unavailable
on node), plus manual acceptance.

## Develop

```sh
pnpm install
pnpm test          # vitest
pnpm test:harness  # bun — headless click chain
pnpm run typecheck # tsc --noEmit
```

## Spec & decisions

The public repo ships a condensed spec, [SPEC.md](./SPEC.md): the scope, the
accepted decisions (cited by name, D1–D12), the acceptance criteria and the
documented limitations. The full development spec (French, with the decision
journal) is deliberately kept outside the public repo.

## Maintainership

Single maintainer in v0 (see the git history for the identity). Issues are the
primary channel; PRs are merged by the maintainer — the contribution flow is
defined at the first PR.

## License

[MIT](./LICENSE) — copyright ailonn lighner
