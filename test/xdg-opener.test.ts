import { chmodSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { xdgOpener } from "../src/adapters/xdg-opener.js"

/** A temporary executable standing in for the system viewer (D10: the exit code is observable). */
function fakeViewer(exitCode: number | undefined): string {
  const dir = mkdtempSync(join(tmpdir(), "fake-viewer-"))
  const bin = join(dir, "viewer")
  writeFileSync(bin, `#!/usr/bin/env node\n${exitCode === undefined ? "" : `process.exit(${exitCode})`}\n`)
  chmodSync(bin, 0o755)
  return bin
}

describe("xdgOpener (D10 toast-sortie)", () => {
  it("resolves when the viewer exits 0", async () => {
    await expect(xdgOpener(fakeViewer(0)).open("/tmp/doc.md")).resolves.toBeUndefined()
  })

  it("rejects with the exit code when the viewer exits non-zero (file gone: xdg-open exits 4)", async () => {
    await expect(xdgOpener(fakeViewer(4)).open("/tmp/gone.md")).rejects.toThrow(/exited with code 4/)
  })

  it("rejects with a clear message when the viewer is missing (ENOENT)", async () => {
    await expect(xdgOpener("/nonexistent/viewer").open("/tmp/doc.md")).rejects.toThrow(
      /viewer not found/,
    )
  })
})
