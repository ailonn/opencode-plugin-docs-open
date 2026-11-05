/**
 * Pure functions for the v3 "click a doc path in running text to open it"
 * feature — no TUI, no IO.
 *
 * Contract: opencode-docs-spec.md v0.4, section "v3" + Appendix A
 * (AC-13…AC-20).
 */

import { isDocPath } from "./docs-paths.js"

/** Mouse modifiers at the click. */
export interface ClickModifiers {
  readonly shift: boolean
  readonly alt: boolean
  readonly ctrl: boolean
}

/**
 * Structural snapshot of the state at mouse release, mapped from the TUI
 * event by the adapters — the domain never sees a TUI type.
 */
export interface ClickContext {
  /** 0 = left button. */
  readonly button: number
  /** Column under the cursor (screen row/col space). */
  readonly x: number
  /** Row under the cursor. */
  readonly y: number
  readonly modifiers: ClickModifiers
  /**
   * The release is not an explicit end-of-drag. The host sets its drag flag
   * `true` when the press started a selection gesture and leaves it unset on
   * other releases — unset therefore counts as a plain click; only an
   * explicit `false` is excluded (a moved selection is already excluded by
   * `freshCellSelection`).
   */
  readonly gestureRelease: boolean
  /** `getSelection()`: isStart && behavior === "cell" (pointer never moved). */
  readonly freshCellSelection: boolean
  /** `getLinkAt(x, y)` — a link already registered by the host, if any. */
  readonly linkAt: string | null
  /** The click landed on the composer (an editor renderable). */
  readonly targetIsEditor: boolean
}

/**
 * A plain left click on non-editor text, no modifiers, not a registered
 * link (the host's own "simple click" semantics).
 */
export function shouldHandleClick(ctx: ClickContext): boolean {
  return (
    ctx.button === 0 &&
    !ctx.modifiers.shift &&
    !ctx.modifiers.alt &&
    !ctx.modifiers.ctrl &&
    ctx.gestureRelease &&
    ctx.freshCellSelection &&
    ctx.linkAt === null &&
    !ctx.targetIsEditor
  )
}

/** Path token characters: unicode letters/digits + `._~/-'`. */
const TOKEN_CHAR_RE = /^[\p{L}\p{N}._~\/'-]$/u

/** Trailing sentence punctuation, stripped before the suffix check. */
const TRAILING_PUNCTUATION = new Set([".", ",", ";", ":", "!", ")", "?"])

/**
 * The maximal path token around column `col` of the rendered row, or null.
 * Charset: unicode letters/digits + `._~/-'` · requires at least one `/` ·
 * must end with a document suffix (trailing sentence punctuation stripped
 * before the suffix check).
 */
export function extractPathCandidate(row: string, col: number): string | null {
  if (col < 0 || col >= row.length || !TOKEN_CHAR_RE.test(row[col])) return null

  let start = col
  while (start > 0 && TOKEN_CHAR_RE.test(row[start - 1])) start--
  let end = col
  while (end + 1 < row.length && TOKEN_CHAR_RE.test(row[end + 1])) end++

  let token = row.slice(start, end + 1)
  while (token.length > 0 && TRAILING_PUNCTUATION.has(token.charAt(token.length - 1))) {
    token = token.slice(0, -1)
  }

  if (!token.includes("/")) return null
  return isDocPath(token) ? token : null
}

// `resolveDocPath` lives in `./path-resolve.js` (shared with the `/docs`
// dialog — D11); import it from there.
