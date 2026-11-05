import { describe, expect, it } from "vitest"
import { agentSystemSource } from "../src/adapters/agent-instruction.js"

interface FakeAgent {
  id: string
  system?: string
}

function fakeEditor(agents: FakeAgent[]) {
  const calls: Array<{ id: string; fn: (agent: FakeAgent) => void }> = []
  const editor = {
    list: () => agents,
    update: (id: string, fn: (agent: FakeAgent) => void) => {
      calls.push({ id, fn })
    },
  }
  return { editor, calls }
}

describe("agentSystemSource", () => {
  it("lists agents reduced to id + system", async () => {
    const { editor } = fakeEditor([{ id: "a", system: "S", name: "build" } as FakeAgent])
    const source = agentSystemSource(editor)
    expect(await source.agents()).toEqual([{ id: "a", system: "S" }])
  })

  it("updateSystem delegates to the editor mutator with the new system", async () => {
    const agent: FakeAgent = { id: "a", system: "S" }
    const { editor, calls } = fakeEditor([agent])
    const source = agentSystemSource(editor)
    await source.updateSystem("a", "NEW")
    expect(calls.map((c) => c.id)).toEqual(["a"])
    calls[0].fn(agent)
    expect(agent.system).toBe("NEW")
  })
})
