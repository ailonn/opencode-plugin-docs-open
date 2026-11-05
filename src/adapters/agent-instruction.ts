import type { AgentSystemSource } from "../application/ports.js"

/**
 * Minimal structural shape of the server `AgentEditor` (`@opencode/plugin`) —
 * declared structurally so the adapter and its tests never import the
 * framework. The real editor is assignable to this shape.
 */
export interface AgentEditorLike {
  list(): readonly { id: string; system?: string }[]
  update(id: string, update: (agent: { id: string; system?: string }) => void): void
}

/** Implements the `AgentSystemSource` port on an agent editor. */
export function agentSystemSource(editor: AgentEditorLike): AgentSystemSource {
  return {
    agents: async () => editor.list().map((agent) => ({ id: agent.id, system: agent.system })),
    updateSystem: async (id, system) =>
      editor.update(id, (agent) => {
        agent.system = system
      }),
  }
}
