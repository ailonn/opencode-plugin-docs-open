/**
 * D13 contract (2026-11-05, decision "renderer-reactivation") — the `doc`
 * fence is rendered by the plugin's custom renderer again.
 *
 * D2a history: the custom renderer crashed the host on block replacement —
 * the host's `remove` does a strict `instanceof` of its own Renderable
 * class, and the nested TUI adapters loaded natively (their `.js` import
 * specifiers resolve to a path that does not exist on disk — the host's
 * rewrite covers only the entry file) resolved `@opentui/core` to the
 * plugin's own copy. D13 fix: the nested TUI imports carry the `.ts`
 * spelling (the path exists on disk → the host rewrite covers them →
 * single host core). The passthrough (D9) remains the documented fallback.
 *
 * The first two tests are the wiring-level contract of the reactivation,
 * including the D2a regression guard (`.ts` specifiers). The double-instance
 * crash itself is only visible in a real TUI — the harness's test renderer
 * is the plugin's own core copy (no cross-copy there): TUI re-acceptance,
 * each host bump.
 *
 * These tests run the real `tui.ts` `setup` with a test renderer and a fake
 * plugin context: the wiring-level contract (the adapters and the click
 * policy are covered by their own suites). The third test drives a real
 * mouse click through the full chain and catches the spawn with the
 * acceptance `fake-xdg-open` on PATH — the same practice as the manual
 * acceptance. Bun only — the OpenTUI native FFI is unavailable on node.
 * Run with: bun test test/harness
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { TextRenderable } from "@opentui/core"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join, resolve } from "node:path"
import plugin from "../../src/tui.js"

setDefaultTimeout(30000)

const FAKE_XDG_OPEN = resolve(import.meta.dir, "../../acceptance/fake-xdg-open")

/** The TUI adapters the entry must import with the `.ts` spelling (D2a/D13). */
const TUI_ADAPTERS = ["doc-block", "opentui-root-click", "opentui-screen-reader"]

/**
 * Minimal fake plugin context — only the fields `setup` touches:
 * `renderer` (the real test renderer), `keymap.layer`,
 * `markdown.registerCodeBlockRenderer` (spied — language + render fn),
 * `options`, `data.session` (the click closure reads the working
 * directory from it), `theme` (the renderer reads the link/muted colors).
 * `ui` is not invoked on the success path.
 */
function fakeContext(
  renderer: { readonly root: { add: (r: unknown) => void; onMouseUp: unknown } },
  registered: Record<string, unknown>,
) {
  return {
    renderer,
    ui: {
      toast: { show: () => {} },
      router: { current: () => ({ type: "session", sessionID: "test" }) },
      dialog: { select: async () => null },
    },
    keymap: { layer: (fn: () => unknown) => fn() },
    markdown: {
      registerCodeBlockRenderer: (language: string, render: unknown) => {
        registered[language] = render
      },
    },
    options: {},
    data: {
      session: {
        get: () => ({ location: { directory: "/tmp" } }),
        root: () => "test",
      },
    },
    theme: { markdown: { linkText: "#0000ff" }, text: { muted: "#888888" } },
  } as never
}

describe("fence reactivation (D13 — custom renderer registered, .ts nested specifiers)", () => {
  test("setup registers the custom renderer for the `doc` fence", async () => {
    const setup = await createTestRenderer({ width: 80, height: 24 })
    try {
      const registered: Record<string, unknown> = {}
      const detach = await plugin.setup(fakeContext(setup.renderer, registered))
      expect(Object.keys(registered), "D13: the custom renderer is registered again").toEqual(["doc"])
      expect(typeof registered["doc"]).toBe("function")
      if (typeof detach === "function") await detach()
    } finally {
      await setup.dispose()
    }
  })

  test("the TUI entry imports the TUI adapters with the .ts spelling (D2a: a .js specifier resolves a nonexistent path → native load → double core → crash)", () => {
    const src = readFileSync(resolve(import.meta.dir, "../../src/tui.ts"), "utf8")
    for (const name of TUI_ADAPTERS) {
      expect(
        src,
        `src/tui.ts must import ./adapters/${name}.ts (the .js spelling loads the file natively — D2a crash)`,
      ).toContain(`from "./adapters/${name}.ts"`)
    }
  })

  test("a left click on a doc line in running text opens it through the root click layer", async () => {
    // A real document on disk (the fs probe is the real existsSync) and a
    // fake xdg-open at the head of PATH (the spawn is real, the open is not).
    const dir = mkdtempSync(join(tmpdir(), "docs-reactivation-"))
    const doc = join(dir, "a.md")
    writeFileSync(doc, "ok")
    const log = join(dir, "xdg.log")
    // The same practice as the acceptance setup: a temp bin dir whose
    // `xdg-open` symlinks the acceptance fake.
    const bin = join(dir, "bin")
    mkdirSync(bin)
    symlinkSync(FAKE_XDG_OPEN, join(bin, "xdg-open"))
    const oldPath = process.env.PATH
    const oldLog = process.env.FAKE_XDG_OPEN_LOG
    process.env.PATH = bin + delimiter + (oldPath ?? "")
    process.env.FAKE_XDG_OPEN_LOG = log
    const setup = await createTestRenderer({ width: 80, height: 24 })
    try {
      // A rendered row carrying the doc path in running text — the root
      // layer sees the screen buffer (the fence case is covered by the
      // renderer's own harness, test/harness/doc-block.test.ts).
      setup.renderer.root.add(new TextRenderable(setup.renderer, { content: `voir ${doc} ok` }))
      await setup.renderOnce()
      const detach = await plugin.setup(fakeContext(setup.renderer, {}))
      const row = setup.captureCharFrame().split("\n")[0]
      const at = row.indexOf(doc)
      expect(at).toBeGreaterThan(0)
      await setup.mockMouse.click(at + 5, 0, 0)
      // The opener spawns detached and the click handler does not await it —
      // poll the fake's log for the exact call.
      const end = Date.now() + 5000
      let content = ""
      while (Date.now() < end) {
        content = existsSync(log) ? readFileSync(log, "utf8") : ""
        if (content.includes(doc)) break
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 50))
      }
      expect(content).toBe(`call argc=1\n${doc}\n---\n`)
      if (typeof detach === "function") await detach()
    } finally {
      await setup.dispose()
      process.env.PATH = oldPath
      process.env.FAKE_XDG_OPEN_LOG = oldLog
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
