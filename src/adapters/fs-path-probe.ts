import { existsSync, statSync } from "node:fs"
import type { PathProbe } from "../application/ports.js"

/**
 * `PathProbe` adapter on `node:fs` (spec v3): the existence guard — a resolved
 * path that is not a **regular file** stays silent (no toast, no open). A
 * directory carrying a document suffix is not a document (D10).
 */
export function fsPathProbe(): PathProbe {
  return {
    exists: (absolutePath) => existsSync(absolutePath) && statSync(absolutePath).isFile(),
  }
}
