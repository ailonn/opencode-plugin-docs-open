import type { CliRenderer } from "@opentui/core"
import type { ScreenReader } from "../application/ports.js"

/**
 * Screen reader for the v3 click-to-open feature (spec v3).
 *
 * The click handler reads the row under the cursor from the renderer's
 * current buffer — the same cell grid (row-major) and the same coordinate
 * space as `getLinkAt`. The char plane is core's internal representation,
 * not a stable contract: besides empty (0) and codepoint cells it holds
 * *packed cell tags* (values above 0x10FFFF) for wide-glyph lead/continuation
 * cells and special cells. Decoding must survive every cell kind (risk R5).
 */

/** The rendered cell grid (`withBuffers`) — the structural subset the decoder needs. */
export interface RowCells {
  readonly char: Uint32Array
  readonly width: number
  readonly height: number
}

/**
 * Pure decoding of one rendered row.
 *
 * `y < 0 || y >= height` → null (out of bounds). Per column, row-major
 * (cell index = y * width + x), one character per cell so the string index
 * stays aligned with the screen column: 0 → space · packed cell tag
 * (c > 0x10FFFF, not a codepoint) → space · otherwise
 * `String.fromCodePoint(c)`.
 */
export function decodeRow(cells: RowCells, y: number): string | null {
  if (y < 0 || y >= cells.height) return null
  const { char, width } = cells
  let row = ""
  for (let x = 0; x < width; x++) {
    const code = char[y * width + x]
    row += code === 0 || code > 0x10ffff ? " " : String.fromCodePoint(code)
  }
  return row
}

/**
 * Builds the `ScreenReader` port on the renderer's current buffer. An
 * unreadable buffer (render phase, per risk R2) yields null — a silent
 * no-op downstream.
 */
export function opentuiScreenReader(renderer: CliRenderer): ScreenReader {
  return {
    readRow(y) {
      try {
        return renderer.currentRenderBuffer.withBuffers((cells) => decodeRow(cells, y))
      } catch {
        return null
      }
    },
  }
}
