import { describe, expect, it } from "vitest"
import { openClickedPath, type OpenClickedPathDeps } from "../src/application/open-clicked-path.js"
import type { ClickContext } from "../src/domain/path-click.js"

function makeCtx(overrides: Partial<ClickContext> = {}): ClickContext {
  return {
    button: 0,
    x: 10,
    y: 2,
    modifiers: { shift: false, alt: false, ctrl: false },
    gestureRelease: true,
    freshCellSelection: true,
    linkAt: null,
    targetIsEditor: false,
    ...overrides,
  }
}

function makeDeps(opts: {
  rows?: Record<number, string | null>
  exists?: (path: string) => boolean
  open?: (path: string) => Promise<void>
  sessionRoot?: string
  home?: string
}) {
  const log = {
    readRowCalls: [] as number[],
    probeCalls: [] as string[],
    opened: [] as string[],
    errors: [] as string[],
  }
  const rows = opts.rows ?? {}
  const deps: OpenClickedPathDeps = {
    screen: {
      readRow(y: number) {
        log.readRowCalls.push(y)
        return Object.prototype.hasOwnProperty.call(rows, y) ? (rows[y] as string | null) : null
      },
    },
    probe: {
      exists(path: string) {
        log.probeCalls.push(path)
        return (opts.exists ?? (() => true))(path)
      },
    },
    opener: {
      open: opts.open ?? (async (path: string) => {
        log.opened.push(path)
      }),
    },
    sessionRoot: opts.sessionRoot ?? "/root/sess",
    home: opts.home ?? "/tmp/u",
    onError(message: string) {
      log.errors.push(message)
    },
  }
  return { deps, log }
}

describe("openClickedPath", () => {
  it("opens an absolute doc path with the exact path", async () => {
    const { deps, log } = makeDeps({ rows: { 2: "voir /tmp/u/notes/a.md ok" } })
    openClickedPath(deps)(makeCtx({ x: 10, y: 2 }))
    await Promise.resolve()
    expect(log.opened).toEqual(["/tmp/u/notes/a.md"])
    expect(log.errors).toEqual([])
  })

  it("resolves a relative doc path against the session root", async () => {
    const { deps, log } = makeDeps({ rows: { 2: "voir notes/a.md" }, sessionRoot: "/root/sess" })
    openClickedPath(deps)(makeCtx({ x: 10, y: 2 }))
    await Promise.resolve()
    expect(log.opened).toEqual(["/root/sess/notes/a.md"])
  })

  it("stays silent when the resolved path does not exist", () => {
    const { deps, log } = makeDeps({
      rows: { 2: "voir /tmp/u/notes/a.md" },
      exists: () => false,
    })
    openClickedPath(deps)(makeCtx({ x: 10, y: 2 }))
    expect(log.probeCalls).toEqual(["/tmp/u/notes/a.md"])
    expect(log.opened).toEqual([])
    expect(log.errors).toEqual([])
  })

  it("reports the error message when the opener rejects", async () => {
    const { deps, log } = makeDeps({
      rows: { 2: "voir /tmp/u/notes/a.md" },
      open: async () => {
        throw new Error("xdg-open: not found")
      },
    })
    openClickedPath(deps)(makeCtx({ x: 10, y: 2 }))
    await Promise.resolve()
    expect(log.errors).toHaveLength(1)
    expect(log.errors[0]).toContain("xdg-open: not found")
  })

  it("never reads the screen for a policy-invalid click (ctrl)", () => {
    const { deps, log } = makeDeps({ rows: { 2: "voir /tmp/u/notes/a.md" } })
    openClickedPath(deps)(makeCtx({ modifiers: { shift: false, alt: false, ctrl: true } }))
    expect(log.readRowCalls).toEqual([])
    expect(log.opened).toEqual([])
    expect(log.errors).toEqual([])
  })

  it("does nothing when the screen row is unreadable", () => {
    const { deps, log } = makeDeps({ rows: {} })
    openClickedPath(deps)(makeCtx({ x: 10, y: 2 }))
    expect(log.probeCalls).toEqual([])
    expect(log.opened).toEqual([])
    expect(log.errors).toEqual([])
  })

  it("does nothing when the click is on a bare filename (no candidate)", () => {
    const { deps, log } = makeDeps({ rows: { 2: "voir note.md" } })
    openClickedPath(deps)(makeCtx({ x: 9, y: 2 }))
    expect(log.probeCalls).toEqual([])
    expect(log.opened).toEqual([])
    expect(log.errors).toEqual([])
  })

  it("never reports an error on success", async () => {
    const { deps, log } = makeDeps({ rows: { 2: "voir /tmp/u/notes/a.md" } })
    openClickedPath(deps)(makeCtx({ x: 10, y: 2 }))
    await Promise.resolve()
    expect(log.opened).toEqual(["/tmp/u/notes/a.md"])
    expect(log.errors).toEqual([])
  })
})
