/**
 * Headless reproduction of the v3 click-to-open incident (live session log, 2026-11-04):
 * a real TUI renders a doc path, a plain left click lands on the token, the
 * policy passes — but the opener is never called because the screen reader
 * returns null for a rendered row.
 *
 * Runs on the @opentui/core/testing harness: a real native renderer + a mock
 * mouse driving the native event pipeline (pressDown/release → real
 * Selection → bubbling to renderer.root.onMouseUp), the same code path as
 * the TUI. Bun only — the OpenTUI native FFI is unavailable on node.
 * Excluded from the vitest (node) suite; run with: bun test test/harness
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { createTestRenderer, type TestRenderer } from "@opentui/core/testing"
import { BoxRenderable, TextRenderable, type CliRenderer } from "@opentui/core"
import { opentuiScreenReader } from "../../src/adapters/opentui-screen-reader.js"
import { attachRootClick } from "../../src/adapters/opentui-root-click.js"
import { openClickedPath } from "../../src/application/open-clicked-path.js"
import type { OpenClickedPathDeps } from "../../src/application/open-clicked-path.js"

const LINE = "voir /tmp/u/notes/a.md ok"
// "/tmp/u/notes/a.md" spans columns 5..21; column 10 sits inside the token.
const COL = 10
const EXPECTED = "/tmp/u/notes/a.md"

setDefaultTimeout(30000)

interface Fixture extends TestRenderer {
  readonly dispose: () => Promise<void>
}

async function renderLine(): Promise<Fixture> {
  const setup = await createTestRenderer({ width: 80, height: 24 })
  setup.renderer.root.add(new TextRenderable(setup.renderer, { content: LINE }))
  await setup.renderOnce()
  return setup
}

/**
 * A scene like the real TUI: a bordered message block whose rows carry a
 * special glyph (✦), CJK (wide: 2 cells each) and emoji. Core stores such
 * cells in the char plane as internal packed tags (values above 0x10FFFF).
 */
const RICH_ROWS = ["日本語 /tmp/u/notes/a.md", "emoji 😀 📄 🚀 row", "plain /tmp/u/notes/a.md row"]

async function renderRich(): Promise<Fixture> {
  const setup = await createTestRenderer({ width: 80, height: 24 })
  const box = new BoxRenderable(setup.renderer, {
    border: true,
    flexDirection: "column",
    width: 78,
    height: 20,
    padding: 1,
  })
  setup.renderer.root.add(box)
  for (const content of RICH_ROWS) box.add(new TextRenderable(setup.renderer, { content }))
  await setup.renderOnce()
  return setup
}

function wiring(
  renderer: CliRenderer,
  opened: string[],
  errors: string[],
  probeExists: (p: string) => boolean,
): OpenClickedPathDeps {
  return {
    screen: opentuiScreenReader(renderer),
    probe: { exists: probeExists },
    opener: {
      open: (p: string) => {
        opened.push(p)
        return Promise.resolve()
      },
    },
    sessionRoot: "/root",
    home: "/tmp/u",
    onError: (m: string) => errors.push(m),
  }
}

describe("v3 click-to-open (headless native harness)", () => {
  test("the screen reader returns the rendered row at idle (between frames)", async () => {
    const fixture = await renderLine()
    try {
      const row = opentuiScreenReader(fixture.renderer).readRow(0)
      expect(row?.length).toBe(80)
      expect(row?.trim()).toBe(LINE)
    } finally {
      await fixture.dispose()
    }
  })

  test("the screen reader bounds-checks rows and reads blank rows", async () => {
    const fixture = await renderLine()
    try {
      const screen = opentuiScreenReader(fixture.renderer)
      expect(screen.readRow(-1)).toBeNull()
      expect(screen.readRow(24)).toBeNull()
      expect(screen.readRow(23)?.trim()).toBe("")
    } finally {
      await fixture.dispose()
    }
  })

  test("a plain click on the rendered path opens the document", async () => {
    const fixture = await renderLine()
    const opened: string[] = []
    const errors: string[] = []
    try {
      const deps = wiring(fixture.renderer, opened, errors, (p) => p === EXPECTED)
      attachRootClick(fixture.renderer, openClickedPath(deps))
      await fixture.mockMouse.click(COL, 0, 0)
      expect(opened).toEqual([EXPECTED])
      expect(errors).toEqual([])
    } finally {
      await fixture.dispose()
    }
  })

  test("a ctrl click on the path does not open (AC-16)", async () => {
    const fixture = await renderLine()
    const opened: string[] = []
    const errors: string[] = []
    try {
      const deps = wiring(fixture.renderer, opened, errors, (p) => p === EXPECTED)
      attachRootClick(fixture.renderer, openClickedPath(deps))
      await fixture.mockMouse.click(COL, 0, 0, { modifiers: { ctrl: true } })
      expect(opened).toEqual([])
      expect(errors).toEqual([])
    } finally {
      await fixture.dispose()
    }
  })

  test("a click outside any path token does not open", async () => {
    const fixture = await renderLine()
    const opened: string[] = []
    const errors: string[] = []
    try {
      const deps = wiring(fixture.renderer, opened, errors, (p) => p === EXPECTED)
      attachRootClick(fixture.renderer, openClickedPath(deps))
      // column 2 = the "i" of "voir"
      await fixture.mockMouse.click(2, 0, 0)
      expect(opened).toEqual([])
      expect(errors).toEqual([])
    } finally {
      await fixture.dispose()
    }
  })

  test("a click on a path that does not exist on disk does not open", async () => {
    const fixture = await renderLine()
    const opened: string[] = []
    const errors: string[] = []
    try {
      const deps = wiring(fixture.renderer, opened, errors, () => false)
      attachRootClick(fixture.renderer, openClickedPath(deps))
      await fixture.mockMouse.click(COL, 0, 0)
      expect(opened).toEqual([])
      expect(errors).toEqual([])
    } finally {
      await fixture.dispose()
    }
  })

  test("the screen reader reads rows with wide glyphs (CJK, emoji) — the incident", async () => {
    const fixture = await renderRich()
    try {
      const screen = opentuiScreenReader(fixture.renderer)
      // the root places the box at y:1 — content rows are y:2..4
      const cjkRow = screen.readRow(2) // "日本語 /tmp/u/notes/a.md"
      expect(cjkRow?.length).toBe(80)
      expect(cjkRow?.includes("/tmp/u/notes/a.md")).toBe(true)
      // 3 CJK chars = 6 cells (2..7) + space (8): the path starts at cell 9
      expect(cjkRow?.charAt(9)).toBe("/")
      const emojiRow = screen.readRow(3) // "emoji 😀 📄 🚀 row"
      expect(emojiRow?.length).toBe(80)
      expect(emojiRow?.includes("row")).toBe(true)
    } finally {
      await fixture.dispose()
    }
  })

  test("a plain click on a path preceded by CJK opens at the right column", async () => {
    const fixture = await renderRich()
    const opened: string[] = []
    const errors: string[] = []
    try {
      const deps = wiring(fixture.renderer, opened, errors, (p) => p === EXPECTED)
      attachRootClick(fixture.renderer, openClickedPath(deps))
      // the path spans cells 9..26 of row 2
      await fixture.mockMouse.click(17, 2, 0)
      expect(opened).toEqual([EXPECTED])
      expect(errors).toEqual([])
    } finally {
      await fixture.dispose()
    }
  })
})
