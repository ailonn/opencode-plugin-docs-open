import { describe, expect, it } from "vitest"
import { hasDocLine, parseDocBlock } from "../src/domain/doc-block.js"

// The adapter itself (renderable construction + mouse wiring) is covered by
// the bun native harness — test/harness/doc-block.test.ts: the OpenTUI FFI is
// unavailable on node, and the adapter must be exercised against a real
// renderer (the D2 regression — no solid renderer context — is only visible
// there).

describe("parseDocBlock", () => {
  it("splits a doc fence body into one line per entry, paths kept intact", (
    ) => {
    const lines = parseDocBlock("/tmp/notes/plan.md\n/tmp/notes/cr.pdf")
    expect(lines).toEqual([
      { text: "/tmp/notes/plan.md", path: "/tmp/notes/plan.md" },
      { text: "/tmp/notes/cr.pdf", path: "/tmp/notes/cr.pdf" },
    ])
  })

  it("keeps non-document lines as display-only entries (path undefined)", () => {
    const lines = parseDocBlock("voir ci-dessous\n/tmp/notes/plan.md")
    expect(lines).toEqual([
      { text: "voir ci-dessous", path: undefined },
      { text: "/tmp/notes/plan.md", path: "/tmp/notes/plan.md" },
    ])
  })

  it("a path without a document suffix is display-only", () => {
    const lines = parseDocBlock("/tmp/notes/plan.md.bak")
    expect(lines).toEqual([{ text: "/tmp/notes/plan.md.bak", path: undefined }])
  })

  it("document suffix matching is case-insensitive, path kept as-is", () => {
    const lines = parseDocBlock("/tmp/NOTES/PLAN.MD")
    expect(lines).toEqual([{ text: "/tmp/NOTES/PLAN.MD", path: "/tmp/NOTES/PLAN.MD" }])
  })

  it("ignore empty and whitespace-only lines", () => {
    const lines = parseDocBlock("\n/tmp/notes/plan.md\n   \n")
    expect(lines).toEqual([{ text: "/tmp/notes/plan.md", path: "/tmp/notes/plan.md" }])
  })

  it("trims surrounding whitespace on lines", () => {
    const lines = parseDocBlock("  /tmp/notes/plan.md  ")
    expect(lines).toEqual([{ text: "/tmp/notes/plan.md", path: "/tmp/notes/plan.md" }])
  })

  it("handles CRLF line endings", () => {
    const lines = parseDocBlock("/a.md\r\n/b.pdf\r\n")
    expect(lines).toEqual([
      { text: "/a.md", path: "/a.md" },
      { text: "/b.pdf", path: "/b.pdf" },
    ])
  })

  it("returns an empty array for an empty body", () => {
    expect(parseDocBlock("")).toEqual([])
  })
})

describe("hasDocLine", () => {
  it("is true when at least one line is a document path", () => {
    expect(hasDocLine(parseDocBlock("texte\n/a.md"))).toBe(true)
  })

  it("is false when no line is a document path", () => {
    expect(hasDocLine(parseDocBlock("texte\n/b.txt.bak"))).toBe(false)
  })

  it("is false for an empty block", () => {
    expect(hasDocLine(parseDocBlock(""))).toBe(false)
  })
})
