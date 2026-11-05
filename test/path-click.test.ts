import { describe, expect, it } from "vitest"
import { extractPathCandidate, shouldHandleClick, type ClickContext } from "../src/domain/path-click.js"
import { resolveDocPath } from "../src/domain/path-resolve.js"

function makeCtx(overrides: Partial<ClickContext> = {}): ClickContext {
  return {
    button: 0,
    x: 10,
    y: 2,
    modifiers: { shift: false, alt: false, ctrl: false },
    gestureRelease: true,
    freshCellSelection: true,
    linkAt: null,
    targetIsEditor: false,
    ...overrides,
  }
}

describe("extractPathCandidate", () => {
  it("extracts an absolute path mid-line", () => {
    expect(extractPathCandidate("voir /tmp/u/notes/a.md ok", 10)).toBe("/tmp/u/notes/a.md")
  })

  it("extracts a path at the start of the line", () => {
    expect(extractPathCandidate("/tmp/u/notes/a.md ok", 0)).toBe("/tmp/u/notes/a.md")
  })

  it("extracts a path at the end of the line", () => {
    const row = "see /tmp/u/notes/a.md"
    expect(extractPathCandidate(row, row.length - 1)).toBe("/tmp/u/notes/a.md")
  })

  it("strips trailing sentence punctuation before the suffix check", () => {
    expect(extractPathCandidate("see /x/y.md.", 10)).toBe("/x/y.md")
    expect(extractPathCandidate("(file /x/y.pdf)", 11)).toBe("/x/y.pdf")
    expect(extractPathCandidate("see /x/y.docx;", 9)).toBe("/x/y.docx")
  })

  it("rejects a bare filename without any slash", () => {
    expect(extractPathCandidate("note.md", 3)).toBeNull()
  })

  it("rejects non-document suffixes", () => {
    expect(extractPathCandidate("/x/y.ts", 4)).toBeNull()
    expect(extractPathCandidate("/x/y.md.bak", 6)).toBeNull()
  })

  it("matches the document suffix case-insensitively, keeping the original case", () => {
    expect(extractPathCandidate("/x/y.MD", 4)).toBe("/x/y.MD")
  })

  it("keeps unicode letters and apostrophes in the token", () => {
    const row = "/x/café-notes-José's.md"
    expect(extractPathCandidate(row, 8)).toBe(row)
  })

  it("keeps internal dots (versioned names)", () => {
    const row = "/x/v1.2.md"
    expect(extractPathCandidate(row, 5)).toBe(row)
  })

  it("stops at parentheses (token boundaries)", () => {
    expect(extractPathCandidate("(/tmp/m/a.md) there", 9)).toBe("/tmp/m/a.md")
  })

  it("returns null when the column is on a space or out of bounds", () => {
    const row = "see /x/y.md"
    expect(extractPathCandidate(row, 3)).toBeNull()
    expect(extractPathCandidate(row, row.length)).toBeNull()
    expect(extractPathCandidate(row, -1)).toBeNull()
  })

  it("returns null for a spaced path (documented v3.0 limitation — the token stops at the space)", () => {
    expect(extractPathCandidate("voir /tmp/m/ma note.md ici", 16)).toBeNull()
  })
})

describe("resolveDocPath", () => {
  it("resolves an absolute path as-is (normalized)", () => {
    expect(resolveDocPath("/x/../y.md", "/root/sess", "/tmp/u")).toBe("/y.md")
  })

  it("resolves a relative path against the session root", () => {
    expect(resolveDocPath("notes/a.md", "/root/sess", "/tmp/u")).toBe("/root/sess/notes/a.md")
  })

  it("resolves ~/ against the home directory", () => {
    expect(resolveDocPath("~/bin/a.md", "/root/sess", "/tmp/u")).toBe("/tmp/u/bin/a.md")
  })
})

describe("shouldHandleClick", () => {
  it("handles a plain left click outside the editor with no link", () => {
    expect(shouldHandleClick(makeCtx())).toBe(true)
  })

  it("does not handle the middle button", () => {
    expect(shouldHandleClick(makeCtx({ button: 1 }))).toBe(false)
  })

  it("does not handle the right button", () => {
    expect(shouldHandleClick(makeCtx({ button: 2 }))).toBe(false)
  })

  it("does not handle a ctrl-modified click", () => {
    expect(shouldHandleClick(makeCtx({ modifiers: { shift: false, alt: false, ctrl: true } }))).toBe(
      false,
    )
  })

  it("does not handle an alt-modified click", () => {
    expect(shouldHandleClick(makeCtx({ modifiers: { shift: false, alt: true, ctrl: false } }))).toBe(
      false,
    )
  })

  it("does not handle a shift-modified click", () => {
    expect(shouldHandleClick(makeCtx({ modifiers: { shift: true, alt: false, ctrl: false } }))).toBe(
      false,
    )
  })

  it("does not handle a release that is not a gesture release", () => {
    expect(shouldHandleClick(makeCtx({ gestureRelease: false }))).toBe(false)
  })

  it("does not handle a release without a fresh cell selection", () => {
    expect(shouldHandleClick(makeCtx({ freshCellSelection: false }))).toBe(false)
  })

  it("does not handle a click on a link registered by the host", () => {
    expect(shouldHandleClick(makeCtx({ linkAt: "https://x" }))).toBe(false)
  })

  it("does not handle a click in the editor (composer)", () => {
    expect(shouldHandleClick(makeCtx({ targetIsEditor: true }))).toBe(false)
  })
})
