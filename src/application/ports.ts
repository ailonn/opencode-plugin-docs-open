import type { SessionRef } from "../domain/docs-paths.js"

/**
 * Driven ports — contracts the application needs; adapters implement them.
 * The application never imports a TUI, a client, or the OS.
 */

/** Provides the session's references (tool calls + messages) in session order. */
export interface SessionRefSource {
  refs(sessionID: string): Promise<SessionRef[]>
}

/** Opens a document path with the system viewer. Failures propagate. */
export interface DocOpener {
  open(path: string): Promise<void>
}

/** One agent, as far as instruction injection cares (v2). */
export interface AgentSystemRef {
  id: string
  system?: string
}

/** Edits agents' system prompts (driven port, v2; the server adapter implements it). */
export interface AgentSystemSource {
  agents(): Promise<AgentSystemRef[]>
  updateSystem(id: string, system: string): Promise<void>
}

/** v3: one rendered screen row at release time (null = buffer unreadable). */
export interface ScreenReader {
  readRow(y: number): string | null
}

/** v3: existence probe for resolved absolute paths. */
export interface PathProbe {
  exists(absolutePath: string): boolean
}
