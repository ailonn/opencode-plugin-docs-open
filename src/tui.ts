import { homedir } from "node:os"
import { Plugin } from "@opencode/plugin/tui"
import { listSessionDocs, openSessionDoc } from "./application/list-session-docs.js"
import { openClickedPath } from "./application/open-clicked-path.js"
import type { SessionRefSource } from "./application/ports.js"
import type { SessionRef } from "./domain/docs-paths.js"
import { refsFromMessages } from "./adapters/session-refs.js"
import { xdgOpener } from "./adapters/xdg-opener.js"
// D13 (2026-11-05) — the nested TUI adapters are imported with the `.ts`
// spelling on purpose. The host's runtime rewrite covers the plugin entry
// file only: a `.js` specifier resolves a path that does not exist on disk
// (the real file is `.ts`), the realpathSync failure is silently caught,
// the file loads natively untransformed, and its bare `@opentui/core`
// import resolves to the plugin's own copy — the double instance behind
// the D2a crash ("remove expects a renderable child object",
// anomalyco/opencode#62051). With `.ts` the path exists, the rewrite
// covers the file, and the host core is single. (Bun loads `.ts`
// specifiers natively — the bun harness is unaffected.)
import { docBlockRenderer } from "./adapters/doc-block.ts"
import { attachRootClick } from "./adapters/opentui-root-click.ts"
import { fsPathProbe } from "./adapters/fs-path-probe.js"
import { opentuiScreenReader } from "./adapters/opentui-screen-reader.ts"
import { sessionWorkingDirectory } from "./domain/session-root.js"

/**
 * opencode-plugin-docs-open — TUI part.
 *
 * Surfaces:
 * - `/docs` (v1, D11/D12): lists the documents cited in the current session
 *   (tool calls + messages) in a select dialog — last cited first (LRU), the
 *   same file cited in several forms appears once, and relative/`~/` citations
 *   are resolved to absolute paths (same rule as the click flow); choosing one
 *   opens it with the system viewer (`xdg-open`);
 * - click-to-open (v3): doc paths cited in the messages — running text and
 *   `doc` fences — are clickable: a left click opens the document, through
 *   the root click layer (spec v3);
 * - `doc` code fences (v2 citation format, kept): rendered by the plugin's
 *   custom renderer — doc lines in link style (theme markdown.linkText),
 *   hover underline, left click opens (decisions « fence », « hover/clic »).
 *   Reactivated 2026-11-05 (D13, decision "renderer-reactivation"): the D2a
 *   crash (double core instance — the host rewrite covers the entry file
 *   only, nested `.js` specifiers load natively) is fixed by the `.ts`
 *   spelling on the nested TUI imports above. Documented fallback if the
 *   host loader ever regresses: passthrough (D9, git history).
 * No slot, no global keybinding (spec: AC-7).
 */
export default Plugin.define({
  id: "opencode-plugin-docs-open",
  setup(context) {
    const opener = xdgOpener()

    // D13 — the `doc` fence is rendered by the plugin's custom renderer
    // again: core primitives on `context.renderer` (D2 — no solid
    // renderer context), link style from the host theme. The fence's
    // click handler stops propagation so the root click layer below does
    // not re-open the same line (AC-17).
    context.markdown.registerCodeBlockRenderer(
      "doc",
      docBlockRenderer(
        opener,
        context.theme,
        (message) =>
          context.ui.toast.show({ message: `Cannot open document (${message})`, variant: "error" }),
        context.renderer,
      ),
    )

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "opencode-docs.docs",
          title: "Open a document cited in this session",
          group: "Docs",
          slash: { name: "docs" },
          run: async () => {
            const route = context.ui.router.current()
            if (route.type !== "session") {
              context.ui.toast.show({ message: "Open a session first", variant: "warning" })
              return
            }
            const sessionID = route.sessionID
            await context.data.session.message.sync(sessionID).catch(() => undefined)
            const refs: SessionRef[] = refsFromMessages(context.data.session.message.list(sessionID))
            const source: SessionRefSource = { refs: async () => refs }
            // D11: the dialog resolves with the same rule as the click flow —
            // session root and home are read at open time.
            const sessionRoot = sessionWorkingDirectory(
              context.data.session.get(sessionID),
              context.data.session.root(sessionID),
            )
            const options = await listSessionDocs(source, sessionID, sessionRoot, homedir())
            if (options.length === 0) {
              context.ui.toast.show({ message: "No documents cited in this session" })
              return
            }
            const picked = await context.ui.dialog.select({
              title: "Session documents",
              options: options.map((option) => ({ title: option.title, value: option.value })),
            })
            if (!picked) return
            // D10: probe before opening — a file removed between the listing
            // and the selection is reported (the watched viewer exit is the
            // backstop for the race window).
            if (!fsPathProbe().exists(picked)) {
              context.ui.toast.show({
                message: `Cannot open document (file not found: ${picked})`,
                variant: "error",
              })
              return
            }
            try {
              await openSessionDoc(opener, { title: "", value: picked })
            } catch (error) {
              context.ui.toast.show({
                message: `Cannot open document (${error instanceof Error ? error.message : String(error)})`,
                variant: "error",
              })
            }
          },
        },
      ],
    }))

    // v3 — click-to-open on doc paths in running text (spec v3)
    if (context.options.clickable === false) {
      return
    }
    const detach = attachRootClick(context.renderer, (ctx) => {
      const route = context.ui.router.current()
      if (route.type !== "session") {
        return
      }
      // The service is built per click (a pure object, negligible cost) so
      // the session root always follows the session currently shown
      // (tab switch).
      const screen = opentuiScreenReader(context.renderer)
      // D1: on host 2.2.5 `session.root()` returns the session id — the
      // working directory is `SessionInfo.location.directory`.
      const sessionRoot = sessionWorkingDirectory(
        context.data.session.get(route.sessionID),
        context.data.session.root(route.sessionID),
      )
      const home = homedir()
      const probe = fsPathProbe()
      openClickedPath({
        screen,
        probe,
        opener,
        sessionRoot,
        home,
        onError: (message) => context.ui.toast.show({ message, variant: "error" }),
      })(ctx)
    })
    // Cleanup — the TUI plugin API (Plugin.define) accepts a returned
    // cleanup: it detaches the root mouse listener when the plugin
    // deactivates (hot reload / TUI exit).
    return detach
  },
})
