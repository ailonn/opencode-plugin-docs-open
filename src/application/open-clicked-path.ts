import { extractPathCandidate, shouldHandleClick, type ClickContext } from "../domain/path-click.js"
import { resolveDocPath } from "../domain/path-resolve.js"
import type { DocOpener, PathProbe, ScreenReader } from "./ports.js"

/** Dependencies of the v3 click-to-open flow (driven ports + data). */
export interface OpenClickedPathDeps {
  readonly screen: ScreenReader
  readonly probe: PathProbe
  readonly opener: DocOpener
  /** The displayed session's working root (relative paths resolve against it). */
  readonly sessionRoot: string
  /** The user's home directory (`~/` candidates). */
  readonly home: string
  /** Reports a failed open (a toast in the TUI wiring). */
  readonly onError: (message: string) => void
}

/**
 * Builds the mouse-release handler for "click a doc path in running text to
 * open it". Flow: shouldHandleClick → screen.readRow(y) →
 * extractPathCandidate(row, x) → resolveDocPath → probe.exists →
 * opener.open (rejection → onError). Silent no-op on every guard failure.
 *
 * Contract: opencode-docs-spec.md v0.4, section "v3" (AC-13…AC-20).
 */
export function openClickedPath(deps: OpenClickedPathDeps): (ctx: ClickContext) => void {
  return (ctx: ClickContext) => {
    if (!shouldHandleClick(ctx)) return
    const row = deps.screen.readRow(ctx.y)
    if (row === null) return
    const candidate = extractPathCandidate(row, ctx.x)
    if (candidate === null) return
    const resolved = resolveDocPath(candidate, deps.sessionRoot, deps.home)
    if (!deps.probe.exists(resolved)) return
    deps.opener.open(resolved).catch((err: unknown) => {
      deps.onError(err instanceof Error ? err.message : String(err))
    })
  }
}
