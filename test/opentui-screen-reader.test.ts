import { describe, expect, it } from "vitest"
import { decodeRow, opentuiScreenReader, type RowCells } from "../src/adapters/opentui-screen-reader.js"

/** Builds a row-major grid (cell index = y * width + x) from per-row codepoint rows. */
function cells(rows: number[][]): RowCells {
  return { char: new Uint32Array(rows.flat()), width: rows[0].length, height: rows.length }
}

describe("decodeRow", () => {
  it("decodes an ASCII row", () => {
    expect(decodeRow(cells([[97, 98, 99]]), 0)).toBe("abc")
  })

  it("decodes accented BMP characters (fromCharCode path)", () => {
    // é = 0xE9, à = 0xE0
    expect(decodeRow(cells([[0xe9, 32, 0xe0]]), 0)).toBe("é à")
  })

  it("preserves astral codepoints (fromCodePoint path)", () => {
    expect(decodeRow(cells([[97, 0x1f600, 98]]), 0)).toBe("a😀b")
  })

  it("renders empty cells (0) as spaces", () => {
    expect(decodeRow(cells([[97, 0, 98]]), 0)).toBe("a b")
  })

  it("decodes each row from its own row-major slice", () => {
    const grid = cells([[97, 98], [99, 100]])
    expect(decodeRow(grid, 0)).toBe("ab")
    expect(decodeRow(grid, 1)).toBe("cd")
  })

  it("returns null for out-of-bounds rows", () => {
    const grid = cells([[97, 98]])
    expect(decodeRow(grid, -1)).toBeNull()
    expect(decodeRow(grid, 1)).toBeNull()
  })

  it("stops at width: extra cells beyond width * height are ignored", () => {
    const grid: RowCells = { char: new Uint32Array([97, 98, 99, 100]), width: 2, height: 1 }
    expect(decodeRow(grid, 0)).toBe("ab")
  })

  it("decodes the 0x10FFFF boundary codepoint", () => {
    expect(decodeRow(cells([[0x10ffff]]), 0)).toBe("\u{10ffff}")
  })

  it("maps core's packed cell tags (above 0x10FFFF) to one space per cell", () => {
    // the char plane stores wide-glyph lead/continuation and special cells as
    // internal tags (e.g. 0x840100fe / 0xc40100fe), not codepoints
    expect(decodeRow(cells([[0x840100fe, 0xc40100fe, 97, 98]]), 0)).toBe("  ab")
  })
})

describe("opentuiScreenReader", () => {
  // Structural fake — the adapter only consumes currentRenderBuffer.withBuffers.
  function fakeRenderer(buffer: unknown): Parameters<typeof opentuiScreenReader>[0] {
    return { currentRenderBuffer: buffer } as unknown as Parameters<typeof opentuiScreenReader>[0]
  }

  it("reads the rendered row through withBuffers", () => {
    const buffer = {
      withBuffers: (cb: (cells: RowCells) => string | null) => cb(cells([[110, 111]])),
    }
    expect(opentuiScreenReader(fakeRenderer(buffer)).readRow(0)).toBe("no")
  })

  it("returns null when the buffer is unreadable (render phase, risk R2)", () => {
    const buffer = { withBuffers: () => { throw new Error("buffer not available") } }
    expect(opentuiScreenReader(fakeRenderer(buffer)).readRow(0)).toBeNull()
  })
})
