/**
 * D2 regression — the doc block must render without a @opentui/solid
 * renderer context.
 *
 * In the real TUI the host renders the custom renderable through its own
 * module instance. The plugin's own @opentui/solid copy never receives the
 * host's RendererContext, so `createElement` threw "No renderer found"
 * (host 2.2.5: an assistant-emitted `doc` fence with a doc line crashed the
 * TUI — 2026-11-04 acceptance, instance #2). The adapter must build the
 * renderable with @opentui/core primitives directly (the same pattern the
 * host's own custom renderers use), driven by the host renderer passed as
 * the 4th factory argument (`context.renderer` in tui.ts).
 *
 * These tests run the callback with a bare test renderer and NO solid tree
 * around it — the exact TUI condition. Bun only (OpenTUI native FFI).
 * Run with: bun test test/harness
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { createTextAttributes, type Renderable } from "@opentui/core"
import { docBlockRenderer } from "../../src/adapters/doc-block.js"
import { attachRootClick } from "../../src/adapters/opentui-root-click.js"
import { openClickedPath } from "../../src/application/open-clicked-path.js"
import type { OpenClickedPathDeps } from "../../src/application/open-clicked-path.js"

const PATH = "/tmp/u/plan.md"
const UNDERLINE = createTextAttributes({ underline: true })
const theme = { markdown: { linkText: "#0000ff" }, text: { muted: "#888888" } } as never

setDefaultTimeout(30000)

function openerSpy() {
  const calls: string[] = []
  return { calls, open: (p: string) => calls.push(p) && Promise.resolve() }
}

/** Locate a text inside the captured char frame; returns 0-based (x, y). */
function locate(frame: string, text: string): { x: number; y: number } | null {
  const lines = frame.split("\n")
  for (let y = 0; y < lines.length; y++) {
    const x = lines[y].indexOf(text)
    if (x >= 0) return { x, y }
  }
  return null
}

/** Find the span carrying `text` in a captured spans frame (for attributes). */
function spanFor(frame: ReturnType<TestRendererSetup["captureSpans"]>, text: string) {
  for (const line of frame.lines) {
    for (const span of line.spans) {
      if (span.text.includes(text)) return span
    }
  }
  return null
}

async function withBlock(body: string, run: (setup: TestRendererSetup) => Promise<void>) {
  const setup = await createTestRenderer({ width: 80, height: 24 })
  const opener = openerSpy()
  const errors: string[] = []
  try {
    const render = docBlockRenderer(opener, theme, (m: string) => errors.push(m), setup.renderer)
    const renderable = render({ text: body }, { defaultRender: () => null })
    expect(renderable, "the doc fence must return a renderable (D2: no 'No renderer found')").toBeTruthy()
    setup.renderer.root.add(renderable as Renderable)
    await setup.renderOnce()
    await run(setup)
  } finally {
    await setup.dispose()
  }
  return { opener, errors }
}

describe("doc block (D2: built for the TUI, no solid renderer context)", () => {
  test("renders the doc fence with the core primitives (the crash case)", async () => {
    await withBlock(`${PATH}\ntexte libre`, async (setup) => {
      const frame = setup.captureCharFrame()
      expect(frame).toContain(PATH)
      expect(frame).toContain("texte libre")
    })
  })

  test("a left click on a doc line opens the path and stops propagation (the v3 root layer must not re-open it)", async () => {
    const rootEvents: number[] = []
    const { opener } = await withBlock(`${PATH}\ntexte libre`, async (setup) => {
      setup.renderer.root.onMouseUp = (e) => {
        rootEvents.push(e.button)
      }
      const at = locate(setup.captureCharFrame(), PATH)
      expect(at).not.toBeNull()
      await setup.mockMouse.click(at!.x + 2, at!.y, 0)
    })
    expect(opener.calls).toEqual([PATH])
    // the root must not see the release (stopPropagation on the row)
    expect(rootEvents).toEqual([])
  })

  test("a non-left click stops propagation but does not open", async () => {
    const { opener } = await withBlock(PATH, async (setup) => {
      const at = locate(setup.captureCharFrame(), PATH)
      await setup.mockMouse.click(at!.x + 2, at!.y, 2)
    })
    expect(opener.calls).toEqual([])
  })

  test("hovering a doc line underlines it, leaving clears the underline", async () => {
    await withBlock(`${PATH}\ntexte libre`, async (setup) => {
      const at = locate(setup.captureCharFrame(), PATH)
      await setup.mockMouse.moveTo(at!.x + 2, at!.y)
      await setup.renderOnce()
      let span = spanFor(setup.captureSpans(), PATH)
      expect(span?.attributes & UNDERLINE).toBeTruthy()
      await setup.mockMouse.moveTo(40, 20)
      await setup.renderOnce()
      span = spanFor(setup.captureSpans(), PATH)
      expect(span?.attributes & UNDERLINE).toBeFalsy()
    })
  })

  test("a non-document line is not clickable (no opener, the release bubbles to the root)", async () => {
    const rootEvents: number[] = []
    const { opener } = await withBlock(`${PATH}\ntexte libre`, async (setup) => {
      setup.renderer.root.onMouseUp = (e) => {
        rootEvents.push(e.button)
      }
      const at = locate(setup.captureCharFrame(), "texte libre")
      expect(at).not.toBeNull()
      await setup.mockMouse.click(at!.x + 2, at!.y, 0)
    })
    expect(opener.calls).toEqual([])
    expect(rootEvents).toContain(0)
  })

  test("a block without doc lines returns the default rendering untouched", async () => {
    const setup = await createTestRenderer({ width: 80, height: 24 })
    try {
      const render = docBlockRenderer(openerSpy(), theme, () => {}, setup.renderer)
      const fake = { marker: "default" } as unknown as Renderable
      const out = render({ text: "juste du texte" }, { defaultRender: () => fake })
      expect(out).toBe(fake)
    } finally {
      await setup.dispose()
    }
  })

  test("AC-17: the v3 root click layer does not double-open a doc line", async () => {
    const setup = await createTestRenderer({ width: 80, height: 24 })
    const opener = openerSpy()
    const rootOpened: string[] = []
    try {
      const render = docBlockRenderer(opener, theme, () => {}, setup.renderer)
      const block = render({ text: `${PATH}\ntexte libre` }, { defaultRender: () => null })
      setup.renderer.root.add(block as Renderable)
      await setup.renderOnce()
      const deps: OpenClickedPathDeps = {
        screen: { readRow: () => null },
        probe: { exists: (p) => p === PATH },
        opener: {
          open: (p) => {
            rootOpened.push(p)
            return Promise.resolve()
          },
        },
        sessionRoot: "/root",
        home: "/home/u",
        onError: () => {},
      }
      attachRootClick(setup.renderer, openClickedPath(deps))
      const at = locate(setup.captureCharFrame(), PATH)
      await setup.mockMouse.click(at!.x + 2, at!.y, 0)
      expect(opener.calls).toEqual([PATH])
      expect(rootOpened).toEqual([])
    } finally {
      await setup.dispose()
    }
  })
})
