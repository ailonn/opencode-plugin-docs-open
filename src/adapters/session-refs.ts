import type { SessionMessageInfo } from "@opencode/client"
import type { SessionRef } from "../domain/docs-paths.js"

const PATH_TOOLS = new Set(["read", "write", "edit"])

/**
 * Map OpenCode session messages to session references (domain shape).
 *
 * - user messages → free text (paths are extracted by the domain);
 * - assistant parts: text → free text; tool → the `path` field of read/write/
 *   edit, or the `command` line of shell; a streaming tool state carries a
 *   partial input string, treated as free text;
 * - every other message kind is ignored.
 */
export function refsFromMessages(messages: readonly SessionMessageInfo[]): SessionRef[] {
  const refs: SessionRef[] = []
  for (const message of messages) {
    if (message.type === "user") {
      refs.push({ kind: "message", text: message.text })
      continue
    }
    if (message.type !== "assistant") continue
    for (const part of message.content) {
      if (part.type === "text") {
        refs.push({ kind: "message", text: part.text })
        continue
      }
      if (part.type !== "tool") continue
      const input = part.state?.input
      if (typeof input === "string") {
        refs.push({ kind: "message", text: input })
        continue
      }
      if (!input || typeof input !== "object") continue
      if (part.name === "shell") {
        const command = input.command
        refs.push({ kind: "tool", tool: "shell", path: typeof command === "string" ? command : "" })
      } else if (PATH_TOOLS.has(part.name)) {
        const path = input.path
        refs.push({
          kind: "tool",
          tool: part.name as "read" | "write" | "edit",
          path: typeof path === "string" ? path : "",
        })
      }
    }
  }
  return refs
}
