import { hasDocInstruction, withDocInstruction } from "../domain/doc-instruction.js"
import type { AgentSystemSource } from "./ports.js"

/**
 * Inject the `doc` fence instruction into the system prompts of the agents
 * that carry one (decision instruction-scope: all agents).
 * - agents without a system, or with an empty/whitespace-only one, are
 *   skipped — never invent a prompt (the rule holds for the empty string too,
 *   AC-23);
 * - idempotent: an agent already carrying the instruction is left alone
 *   (the transform may run several times);
 * - `enabled === false` (plugin option `clickable: false`) → no-op.
 *
 * Returns the number of agents updated.
 */
export async function injectDocInstruction(source: AgentSystemSource, enabled: boolean): Promise<number> {
  if (!enabled) return 0
  let updated = 0
  for (const agent of await source.agents()) {
    if (!agent.system?.trim() || hasDocInstruction(agent.system)) continue
    await source.updateSystem(agent.id, withDocInstruction(agent.system))
    updated++
  }
  return updated
}
