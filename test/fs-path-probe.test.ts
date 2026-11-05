import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { fsPathProbe } from "../src/adapters/fs-path-probe.js"

describe("fsPathProbe (D10: regular files only)", () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "fs-probe-"))
    writeFileSync(join(dir, "real.md"), "doc")
    mkdirSync(join(dir, "dir.md"))
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  const probe = fsPathProbe()

  it("is true for a regular file", () => {
    expect(probe.exists(join(dir, "real.md"))).toBe(true)
  })

  it("is false for a directory carrying a document suffix", () => {
    expect(probe.exists(join(dir, "dir.md"))).toBe(false)
  })

  it("is false for a missing path", () => {
    expect(probe.exists(join(dir, "missing.md"))).toBe(false)
  })
})
