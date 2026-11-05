import { describe, expect, it } from "vitest"
import { injectDocInstruction } from "../src/application/inject-doc-instruction.js"
import type { AgentSystemRef, AgentSystemSource } from "../src/application/ports.js"
import { DOC_FENCE_INSTRUCTION, withDocInstruction } from "../src/domain/doc-instruction.js"

type Update = [string, string]

function fakeSource(agents: AgentSystemRef[], updates: Update[]): AgentSystemSource {
  return {
    agents: async () => agents,
    updateSystem: async (id, system) => {
      updates.push([id, system])
    },
  }
}

describe("injectDocInstruction", () => {
  it("injects the instruction into every agent that has a system", async () => {
    const updates: Update[] = []
    const source = fakeSource(
      [
        { id: "a", system: "System A" },
        { id: "b", system: "System B" },
      ],
      updates,
    )
    const count = await injectDocInstruction(source, true)
    expect(count).toBe(2)
    expect(updates).toEqual([
      ["a", `System A\n\n${DOC_FENCE_INSTRUCTION}`],
      ["b", `System B\n\n${DOC_FENCE_INSTRUCTION}`],
    ])
  })

  it("skips agents without a system (never invents a prompt)", async () => {
    const updates: Update[] = []
    const source = fakeSource([{ id: "a" }, { id: "b", system: "B" }], updates)
    const count = await injectDocInstruction(source, true)
    expect(count).toBe(1)
    expect(updates.map(([id]) => id)).toEqual(["b"])
  })

  it("skips agents with an empty or whitespace-only system (never invents a prompt — AC-23)", async () => {
    const updates: Update[] = []
    const source = fakeSource(
      [
        { id: "a", system: "" },
        { id: "b", system: "   " },
        { id: "c", system: "C" },
      ],
      updates,
    )
    const count = await injectDocInstruction(source, true)
    expect(count).toBe(1)
    expect(updates.map(([id]) => id)).toEqual(["c"])
  })

  it("is idempotent: an agent already carrying the instruction is not updated again", async () => {
    const updates: Update[] = []
    const source = fakeSource([{ id: "a", system: withDocInstruction("System A") }], updates)
    const count = await injectDocInstruction(source, true)
    expect(count).toBe(0)
    expect(updates).toEqual([])
  })

  it("injects nothing when disabled (plugin option clickable: false)", async () => {
    const updates: Update[] = []
    const source = fakeSource([{ id: "a", system: "A" }], updates)
    const count = await injectDocInstruction(source, false)
    expect(count).toBe(0)
    expect(updates).toEqual([])
  })
})
