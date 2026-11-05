import { resolve } from "node:path"

/**
 * Pure resolution of a cited path against the session — no TUI, no IO.
 *
 * Shared by the click flow and the `/docs` dialog (decision "citation-relative",
 * D11: one resolution rule, no import cycle between the two domain modules).
 *
 * Contract: opencode-docs-spec.md v0.4, section "v3" (AC-14) + D11.
 */

/**
 * Resolves the candidate against the session: absolute as-is, `~/` against
 * the home directory, relative against the session root. Pure string
 * manipulation (node:path), no IO.
 */
export function resolveDocPath(candidate: string, sessionRoot: string, home: string): string {
  if (candidate.startsWith("/")) return resolve(candidate)
  if (candidate === "~" || candidate.startsWith("~/")) {
    return resolve(home, candidate.replace(/^~\/?/, ""))
  }
  return resolve(sessionRoot, candidate)
}
