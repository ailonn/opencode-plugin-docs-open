import { EditBufferRenderable, type CliRenderer, type MouseEvent } from "@opentui/core"
import type { ClickContext } from "../domain/path-click.js"

/**
 * Root click layer for the v3 click-to-open feature (spec v3, option C).
 *
 * Mouse releases bubble up to `renderer.root`; a single `onMouseUp` handler
 * there sees every click in the app. The handler only maps the raw TUI state
 * to the domain's `ClickContext` — the policy (which clicks act) lives in
 * the domain/application layer, not here.
 */

/** Raw TUI state at mouse release, as read from the renderer (no TUI type leaks into the mapping). */
export interface RawClickInput {
  readonly button: number
  readonly x: number
  readonly y: number
  readonly modifiers: { readonly shift: boolean; readonly alt: boolean; readonly ctrl: boolean }
  readonly isDragging: boolean | undefined
  readonly selection: { readonly isStart: boolean; readonly behavior: string } | null
  readonly linkAt: string | null
  readonly targetIsEditor: boolean
}

/** Pure mapping from raw TUI state to the domain's `ClickContext`. */
export function toClickContext(input: RawClickInput): ClickContext {
  return {
    button: input.button,
    x: input.x,
    y: input.y,
    modifiers: input.modifiers,
    // Host semantics (core 0.8.2, verified in source): the flag is `true` when
    // the press started a selection gesture, and *unset* on every other release
    // — including plain clicks that follow a motion/hover event (the press is
    // then not tracked as a gesture start). Unset therefore means "plain
    // click", not "drag": only an explicit `false` (a finished drag) is
    // excluded. The drag case itself is already covered by
    // `freshCellSelection` (a moved selection is not fresh). Treating unset
    // as "not a click" silently killed ~half of real user clicks (a physical
    // mouse always sends motion before the press — 2026-11-04 live diagnosis).
    gestureRelease: input.isDragging !== false,
    freshCellSelection: input.selection != null && input.selection.isStart && input.selection.behavior === "cell",
    linkAt: input.linkAt,
    targetIsEditor: input.targetIsEditor,
  }
}

/** Wiring options (clock and dedupe window are injectable for tests). */
export interface AttachOptions {
  /** Clock. Defaults to `Date.now`. */
  readonly now?: () => number
  /**
   * Dedupe window (ms) for identical `(x, y, button)` releases. The host
   * double-dispatches a single release in some states (observed 1 ms apart
   * after motion events — 2026-11-04 live diagnosis); a physical double
   * click is already excluded downstream by `freshCellSelection` (word
   * selection). Defaults to 250.
   */
  readonly dedupeMs?: number
}

/**
 * Attaches the root mouse-release handler and returns its detach.
 *
 * Defensive (risk R1): `onMouseUp` is a single slot on `renderer.root`; the
 * host (core 0.8.0) does not configure it at this level (its own handler
 * sits on the app-root box, a child — verified in source). The slot has no
 * getter, so detaching is a blind reset to `undefined`.
 *
 * Identical releases within the dedupe window are dropped (host
 * double-dispatch — see `AttachOptions.dedupeMs`).
 */
export function attachRootClick(
  renderer: CliRenderer,
  handle: (ctx: ClickContext) => void,
  options: AttachOptions = {},
): () => void {
  const now = options.now ?? Date.now
  const dedupeMs = options.dedupeMs ?? 250
  let last: { x: number; y: number; button: number; ms: number } | null = null
  renderer.root.onMouseUp = (event: MouseEvent) => {
    const t = now()
    if (
      last !== null &&
      last.x === event.x &&
      last.y === event.y &&
      last.button === event.button &&
      t - last.ms < dedupeMs
    ) {
      return
    }
    last = { x: event.x, y: event.y, button: event.button, ms: t }
    const selection = renderer.getSelection()
    const linkAt = renderer.getLinkAt(event.x, event.y)
    const targetIsEditor = event.target instanceof EditBufferRenderable
    const ctx = toClickContext({
      button: event.button,
      x: event.x,
      y: event.y,
      modifiers: event.modifiers,
      isDragging: event.isDragging,
      selection,
      linkAt,
      targetIsEditor,
    })
    handle(ctx)
  }
  return () => {
    renderer.root.onMouseUp = undefined
  }
}
