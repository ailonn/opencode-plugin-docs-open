import { Plugin } from "@opencode/plugin"
import { agentSystemSource } from "./adapters/agent-instruction.js"
import { injectDocInstruction } from "./application/inject-doc-instruction.js"

/**
 * opencode-plugin-docs-open — server part (v2, decision instruction-scope).
 *
 * Injects the `doc` fence instruction — cite documents in a `doc` code fence,
 * one path per line — into the system prompts of the agents that carry one.
 * The TUI part opens the document lines of those fences through the root click
 * layer (the fences render as the host's standard code block — passthrough, D2a).
 *
 * Idempotent (the transform may run several times) and opt-out: the plugin
 * option `clickable: false` disables the injection entirely. Agents without a
 * system prompt are skipped — a prompt is never invented.
 */
export default Plugin.define({
  id: "opencode-plugin-docs-open",
  async setup(ctx) {
    const registration = await ctx.agent.transform((editor) => {
      void injectDocInstruction(agentSystemSource(editor), ctx.options.clickable !== false)
    })
    return () => registration.dispose()
  },
})
