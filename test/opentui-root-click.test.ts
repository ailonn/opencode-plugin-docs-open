import { describe, expect, it, vi } from "vitest"
import { attachRootClick, toClickContext } from "../src/adapters/opentui-root-click.js"

const NO_MODIFIERS = { shift: false, alt: false, ctrl: false }

describe("toClickContext", () => {
  it("maps every field, including all three modifiers", () => {
    const ctx = toClickContext({
      button: 2,
      x: 11,
      y: 4,
      modifiers: { shift: true, alt: true, ctrl: true },
      isDragging: true,
      selection: { isStart: true, behavior: "cell" },
      linkAt: "https://example.com/doc",
      targetIsEditor: true,
    })
    expect(ctx).toEqual({
      button: 2,
      x: 11,
      y: 4,
      modifiers: { shift: true, alt: true, ctrl: true },
      gestureRelease: true,
      freshCellSelection: true,
      linkAt: "https://example.com/doc",
      targetIsEditor: true,
    })
  })

  it("isDragging undefined → gestureRelease true (untracked release = a plain click — host 2.2.5/core 0.8.2 leaves the flag unset after a motion event)", () => {
    const ctx = toClickContext({
      button: 0, x: 0, y: 0, modifiers: NO_MODIFIERS,
      isDragging: undefined, selection: null, linkAt: null, targetIsEditor: false,
    })
    expect(ctx.gestureRelease).toBe(true)
  })

  it("isDragging true → gestureRelease true", () => {
    const ctx = toClickContext({
      button: 0, x: 0, y: 0, modifiers: NO_MODIFIERS,
      isDragging: true, selection: null, linkAt: null, targetIsEditor: false,
    })
    expect(ctx.gestureRelease).toBe(true)
  })

  it("isDragging false → gestureRelease false (an explicit drag end is still excluded)", () => {
    const ctx = toClickContext({
      button: 0, x: 0, y: 0, modifiers: NO_MODIFIERS,
      isDragging: false, selection: null, linkAt: null, targetIsEditor: false,
    })
    expect(ctx.gestureRelease).toBe(false)
  })

  it("no selection → freshCellSelection false", () => {
    const ctx = toClickContext({
      button: 0, x: 0, y: 0, modifiers: NO_MODIFIERS,
      isDragging: undefined, selection: null, linkAt: null, targetIsEditor: false,
    })
    expect(ctx.freshCellSelection).toBe(false)
  })

  it("fresh cell selection (isStart + behavior \"cell\") → freshCellSelection true", () => {
    const ctx = toClickContext({
      button: 0, x: 0, y: 0, modifiers: NO_MODIFIERS,
      isDragging: true, selection: { isStart: true, behavior: "cell" }, linkAt: null, targetIsEditor: false,
    })
    expect(ctx.freshCellSelection).toBe(true)
  })

  it("selection with behavior \"line\" → freshCellSelection false", () => {
    const ctx = toClickContext({
      button: 0, x: 0, y: 0, modifiers: NO_MODIFIERS,
      isDragging: true, selection: { isStart: true, behavior: "line" }, linkAt: null, targetIsEditor: false,
    })
    expect(ctx.freshCellSelection).toBe(false)
  })

  it("selection moved (isStart false) → freshCellSelection false", () => {
    const ctx = toClickContext({
      button: 0, x: 0, y: 0, modifiers: NO_MODIFIERS,
      isDragging: true, selection: { isStart: false, behavior: "cell" }, linkAt: null, targetIsEditor: false,
    })
    expect(ctx.freshCellSelection).toBe(false)
  })

  it("propagates linkAt and targetIsEditor", () => {
    const ctx = toClickContext({
      button: 0, x: 1, y: 2, modifiers: NO_MODIFIERS,
      isDragging: undefined, selection: null, linkAt: "file:///tmp/notes/plan.md", targetIsEditor: true,
    })
    expect(ctx.linkAt).toBe("file:///tmp/notes/plan.md")
    expect(ctx.targetIsEditor).toBe(true)
  })
})

describe("attachRootClick", () => {
  // Structural fake renderer — only what attachRootClick consumes.
  interface FakeMouseEvent {
    button: number
    x: number
    y: number
    modifiers: { shift: boolean; alt: boolean; ctrl: boolean }
    isDragging?: boolean
    target: unknown
  }
  interface FakeRenderer {
    root: { onMouseUp?: (event: FakeMouseEvent) => void }
    getSelection(): { isStart: boolean; behavior: string } | null
    getLinkAt(x: number, y: number): string | null
  }
  function fakeRenderer(overrides: Partial<Omit<FakeRenderer, "root">> = {}): FakeRenderer {
    return { root: {}, getSelection: () => null, getLinkAt: () => null, ...overrides }
  }
  type AttachRenderer = Parameters<typeof attachRootClick>[0]

  it("sets the typed onMouseUp prop on renderer.root and maps the event", () => {
    const renderer = fakeRenderer()
    const handle = vi.fn()
    attachRootClick(renderer as unknown as AttachRenderer, handle)
    expect(typeof renderer.root.onMouseUp).toBe("function")
    renderer.root.onMouseUp!({
      button: 0, x: 5, y: 2, modifiers: NO_MODIFIERS, isDragging: true, target: null,
    })
    expect(handle).toHaveBeenCalledTimes(1)
    expect(handle).toHaveBeenCalledWith({
      button: 0, x: 5, y: 2,
      modifiers: NO_MODIFIERS,
      gestureRelease: true,
      freshCellSelection: false,
      linkAt: null,
      targetIsEditor: false,
    })
  })

  it("reads the selection state and the link at the cursor position", () => {
    const getLinkAt = vi.fn(() => "https://example.com")
    const renderer = fakeRenderer({
      getSelection: () => ({ isStart: true, behavior: "cell" }),
      getLinkAt,
    })
    const handle = vi.fn()
    attachRootClick(renderer as unknown as AttachRenderer, handle)
    renderer.root.onMouseUp!({
      button: 0, x: 7, y: 3, modifiers: NO_MODIFIERS, isDragging: undefined, target: null,
    })
    expect(getLinkAt).toHaveBeenCalledWith(7, 3)
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({ linkAt: "https://example.com", freshCellSelection: true, gestureRelease: true }),
    )
  })

  it("detach resets the onMouseUp prop to undefined", () => {
    const renderer = fakeRenderer()
    const detach = attachRootClick(renderer as unknown as AttachRenderer, vi.fn())
    expect(typeof renderer.root.onMouseUp).toBe("function")
    detach()
    expect(renderer.root.onMouseUp).toBeUndefined()
  })

  it("drops a duplicate release at the same (x, y, button) within the window (host double-dispatch, observed 1 ms apart)", () => {
    let clock = 0
    const renderer = fakeRenderer()
    const handle = vi.fn()
    attachRootClick(renderer as unknown as AttachRenderer, handle, { now: () => clock })
    const ev: FakeMouseEvent = {
      button: 0, x: 5, y: 2, modifiers: NO_MODIFIERS, isDragging: true, target: null,
    }
    renderer.root.onMouseUp!(ev)
    clock = 1
    renderer.root.onMouseUp!(ev)
    expect(handle).toHaveBeenCalledTimes(1)
  })

  it("passes two releases at the same position once the dedupe window has elapsed", () => {
    let clock = 0
    const renderer = fakeRenderer()
    const handle = vi.fn()
    attachRootClick(renderer as unknown as AttachRenderer, handle, { now: () => clock })
    const ev: FakeMouseEvent = {
      button: 0, x: 5, y: 2, modifiers: NO_MODIFIERS, isDragging: true, target: null,
    }
    renderer.root.onMouseUp!(ev)
    clock = 250
    renderer.root.onMouseUp!(ev)
    expect(handle).toHaveBeenCalledTimes(2)
  })

  it("does not dedupe a different button or position within the window", () => {
    let clock = 0
    const renderer = fakeRenderer()
    const handle = vi.fn()
    attachRootClick(renderer as unknown as AttachRenderer, handle, { now: () => clock })
    const base: FakeMouseEvent = {
      button: 0, x: 5, y: 2, modifiers: NO_MODIFIERS, isDragging: true, target: null,
    }
    renderer.root.onMouseUp!(base)
    clock = 1
    renderer.root.onMouseUp!({ ...base, button: 2 })
    clock = 2
    renderer.root.onMouseUp!({ ...base, x: 6 })
    clock = 3
    renderer.root.onMouseUp!({ ...base, y: 3 })
    expect(handle).toHaveBeenCalledTimes(4)
  })
})
