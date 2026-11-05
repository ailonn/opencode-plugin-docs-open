import { describe, expect, it } from "vitest"
import {
  DOC_SUFFIXES,
  dedupePaths,
  extractDocPaths,
  formatDocOption,
  rankDocs,
  sortByRecency,
  type DocEntry,
  type SessionRef,
} from "../src/domain/docs-paths.js"

describe("extractDocPaths", () => {
  it("returns the path of a read tool call on a .md file", () => {
    const refs: SessionRef[] = [{ kind: "tool", tool: "read", path: "/tmp/u/notes/ODJ.md" }]
    expect(extractDocPaths(refs)).toEqual([{ path: "/tmp/u/notes/ODJ.md", seen: 0 }])
  })

  it("returns paths from write and edit tool calls", () => {
    const refs: SessionRef[] = [
      { kind: "tool", tool: "write", path: "/tmp/u/docs/spec.odt" },
      { kind: "tool", tool: "edit", path: "/tmp/u/docs/spec.odt" },
    ]
    const paths = extractDocPaths(refs).map((e) => e.path)
    expect(paths).toContain("/tmp/u/docs/spec.odt")
  })

  it("extracts document paths from a shell command line", () => {
    const refs: SessionRef[] = [
      { kind: "tool", tool: "shell", path: "pdftotext \"/tmp/u/docs/annual report final.pdf\" /tmp/out" },
    ]
    expect(extractDocPaths(refs).map((e) => e.path)).toContain("/tmp/u/docs/annual report final.pdf")
  })

  it("extracts document paths from assistant message text", () => {
    const refs: SessionRef[] = [
      { kind: "message", text: "see notes/2026-10-28-meeting-agenda.md for the detail" },
    ]
    expect(extractDocPaths(refs).map((e) => e.path)).toContain("notes/2026-10-28-meeting-agenda.md")
  })

  it("assigns seen indices in order of appearance", () => {
    const refs: SessionRef[] = [
      { kind: "message", text: "d'abord notes/a.md" },
      { kind: "tool", tool: "read", path: "/tmp/b.pdf" },
      { kind: "message", text: "puis notes/c.odt" },
    ]
    const entries = extractDocPaths(refs)
    expect(entries.map((e) => e.path)).toEqual(["notes/a.md", "/tmp/b.pdf", "notes/c.odt"])
    expect(entries.map((e) => e.seen)).toEqual([0, 1, 2])
  })

  it("keeps the last occurrence per raw path (seen = last position — D12)", () => {
    const refs: SessionRef[] = [
      { kind: "message", text: "d'abord notes/a.md" },
      { kind: "tool", tool: "read", path: "/tmp/b.pdf" },
      { kind: "message", text: "et encore notes/a.md" },
    ]
    const entries = extractDocPaths(refs)
    expect(entries.map((e) => e.path)).toEqual(["notes/a.md", "/tmp/b.pdf"])
    expect(entries.map((e) => e.seen)).toEqual([2, 1])
  })

  it("excludes non-document suffixes (.ts, .json, .sh)", () => {
    const refs: SessionRef[] = [
      { kind: "tool", tool: "read", path: "/repo/src/app.ts" },
      { kind: "tool", tool: "read", path: "/repo/package.json" },
      { kind: "message", text: "the script setup.sh ran" },
    ]
    expect(extractDocPaths(refs)).toEqual([])
  })

  it("returns an empty array when the session cites no document", () => {
    expect(extractDocPaths([])).toEqual([])
    expect(extractDocPaths([{ kind: "message", text: "rien de documentique ici" }])).toEqual([])
  })

  it("uses exactly the documented suffixes", () => {
    expect([...DOC_SUFFIXES].sort()).toEqual(
      [".docx", ".md", ".odt", ".pdf", ".png", ".pptx", ".svg", ".txt", ".xlsx"].sort(),
    )
  })
})

describe("dedupePaths", () => {
  it("keeps one entry per path — last occurrence wins (LRU contract, D12)", () => {
    const entries: DocEntry[] = [
      { path: "/a/ODJ.md", seen: 0 },
      { path: "/b/cr.pdf", seen: 1 },
      { path: "/a/ODJ.md", seen: 2 },
    ]
    expect(dedupePaths(entries)).toEqual([
      { path: "/a/ODJ.md", seen: 2 },
      { path: "/b/cr.pdf", seen: 1 },
    ])
  })
})

describe("sortByRecency", () => {
  it("sorts most recently seen first", () => {
    const entries: DocEntry[] = [
      { path: "/a.md", seen: 0 },
      { path: "/b.md", seen: 2 },
      { path: "/c.md", seen: 1 },
    ]
    expect(sortByRecency(entries).map((e) => e.path)).toEqual(["/b.md", "/c.md", "/a.md"])
  })

  it("does not mutate the input", () => {
    const entries: DocEntry[] = [
      { path: "/a.md", seen: 0 },
      { path: "/b.md", seen: 1 },
    ]
    sortByRecency(entries)
    expect(entries.map((e) => e.path)).toEqual(["/a.md", "/b.md"])
  })
})

describe("rankDocs (D11 + D12)", () => {
  it("resolves every path against the session root and home", () => {
    const docs = rankDocs(
      [
        { path: "notes/a.md", seen: 0 },
        { path: "~/b.pdf", seen: 1 },
        { path: "/abs/c.odt", seen: 2 },
      ],
      "/tmp/session",
      "/tmp/u",
    )
    expect(docs).toEqual([
      { path: "/abs/c.odt", resolved: "/abs/c.odt", seen: 2 },
      { path: "~/b.pdf", resolved: "/tmp/u/b.pdf", seen: 1 },
      { path: "notes/a.md", resolved: "/tmp/session/notes/a.md", seen: 0 },
    ])
  })

  it("dedupes by resolved path — last occurrence wins", () => {
    const docs = rankDocs(
      [
        { path: "notes/a.md", seen: 0 },
        { path: "/tmp/session/notes/a.md", seen: 3 },
      ],
      "/tmp/session",
      "/tmp/u",
    )
    expect(docs).toEqual([
      { path: "/tmp/session/notes/a.md", resolved: "/tmp/session/notes/a.md", seen: 3 },
    ])
  })

  it("sorts most recently seen first (LRU)", () => {
    const docs = rankDocs(
      [
        { path: "a.md", seen: 0 },
        { path: "b.md", seen: 1 },
        { path: "c.md", seen: 2 },
      ],
      "/tmp/session",
      "/tmp/u",
    )
    expect(docs.map((d) => d.resolved)).toEqual([
      "/tmp/session/c.md",
      "/tmp/session/b.md",
      "/tmp/session/a.md",
    ])
  })
})

describe("formatDocOption", () => {
  it("formats 'file-name — parent-folder'", () => {
    expect(formatDocOption("/tmp/u/notes/meetings/my note.md")).toEqual({
      title: "my note.md — meetings",
      value: "/tmp/u/notes/meetings/my note.md",
    })
  })

  it("keeps spaces, accents and apostrophes intact in value", () => {
    const p = "/tmp/u/notes/meetings/naïve café's meeting notes.pdf"
    expect(formatDocOption(p).value).toBe(p)
  })

  it("stays defined for a root-level file", () => {
    const r = formatDocOption("/report.pdf")
    expect(r.value).toBe("/report.pdf")
    expect(r.title).toContain("report.pdf")
  })
})
