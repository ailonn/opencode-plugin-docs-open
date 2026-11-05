import { spawn } from "node:child_process"
import type { DocOpener } from "../application/ports.js"

/**
 * Open paths with the system viewer (default `xdg-open`) — no shell, the path
 * is passed as a single argv entry (spaces, accents and apostrophes stay
 * intact, no interpolation).
 *
 * The promise settles when the viewer process *exits* (decision "toast on exit",
 * D10): a non-zero exit (e.g. the file was removed between listing and open —
 * `xdg-open` exits 4) rejects with the code, a kill by signal rejects, and a
 * spawn error (viewer missing — ENOENT) rejects with a clear message. Settling
 * on `spawn` instead would report success for both cases (the `spawn` event
 * fires even when the exec fails). `detached` + `unref` are kept: the viewer
 * must outlive the TUI and must not pin the event loop.
 */
export function xdgOpener(bin = "xdg-open"): DocOpener {
  return {
    open: (path) =>
      new Promise<void>((resolve, reject) => {
        let settled = false
        const child = spawn(bin, [path], { stdio: "ignore", detached: true })
        child.unref()
        child.once("error", (error: NodeJS.ErrnoException) => {
          if (settled) return
          settled = true
          reject(error.code === "ENOENT" ? new Error(`viewer not found: ${bin}`) : error)
        })
        child.once("close", (code, signal) => {
          if (settled) return
          settled = true
          if (code === 0) return resolve()
          if (signal) return reject(new Error(`${bin} terminated by signal ${signal}`))
          reject(new Error(`${bin} exited with code ${code}`))
        })
      }),
  }
}
