/**
 * D2a contract (2026-11-04, decision "fence-passthrough") —
 * the `doc` fence is passthrough: the plugin registers NO custom code block
 * renderer.
 *
 * Why: the host parents plugin renderables in its own tree, and its `remove`
 * does a strict `instanceof` of its own Renderable class (extracted from the
 * host 2.2.5 binary; the latest core 0.8.2 ships the same check) — a plugin
 * with its own `@opentui/core` copy crashes the host on every block
 * replacement (every token change during streaming): "remove expects a
 * renderable child object". The host's own core is unreachable from a plugin
 * (the `opentui:runtime-module:` scheme is not served by the runtime loader —
 * probe-verified). So the fence renders as the host's standard code block,
 * and its doc lines stay clickable through the v3 root click layer (verified
 * in production — acceptance A4).
 *
 * These tests run the real `tui.ts` `setup` with a test renderer and a fake
 * plugin context: the wiring-level contract (the adapters and the click
 * policy are covered by their own suites). The second test drives a real
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

/**
 * Minimal fake plugin context — only the fields `setup` touches:
 * `renderer` (the real test renderer), `keymap.layer`, `markdown.registerCodeBlockRenderer`
 * (spied), `options`, `data.session` (the click closure reads the working
 * directory from it). `ui` is not invoked on the success path.
 */
function fakeContext(
  renderer: { readonly root: { add: (r: unknown) => void; onMouseUp: unknown } },
  registered: string[],
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
      registerCodeBlockRenderer: (language: string) => {
        registered.push(language)
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

describe("fence passthrough (D2a — no custom code block renderer)", () => {
  test("setup registers no custom code block renderer (a registered one crashes the host)", async () => {
    const setup = await createTestRenderer({ width: 80, height: 24 })
    try {
      const registered: string[] = []
      const detach = await plugin.setup(fakeContext(setup.renderer, registered))
      expect(registered, "D2a: a registered custom renderer crashes the host on block replacement").toEqual([])
      if (typeof detach === "function") await detach()
    } finally {
      await setup.dispose()
    }
  })

  test("a left click on a doc line opens it through the root click layer (the passthrough wiring)", async () => {
    // A real document on disk (the fs probe is the real existsSync) and a
    // fake xdg-open at the head of PATH (the spawn is real, the open is not).
    const dir = mkdtempSync(join(tmpdir(), "docs-passthrough-"))
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
      // A rendered row carrying the doc path — whatever renders it in the
      // real TUI (running text or the host's standard code block for a `doc`
      // fence), the root layer sees the same screen buffer.
      setup.renderer.root.add(new TextRenderable(setup.renderer, { content: `voir ${doc} ok` }))
      await setup.renderOnce()
      const detach = await plugin.setup(fakeContext(setup.renderer, []))
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
