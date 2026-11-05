/**
 * Pure functions for the `doc` fence prompt instruction (v2, decision
 * instruction-scope) — no TUI, no IO.
 *
 * Contract: opencode-docs-spec.md v2 (AC-11) + v4 (D11 citation-relative).
 */

/**
 * Stable guard: the first line of the instruction. `hasDocInstruction`
 * matches on it so a re-run of the transform never stacks a second copy.
 * The first line never changes across versions (D11): only the body is
 * allowed to evolve, so a prompt carrying a previous version is recognized
 * and left alone (cross-version idempotence).
 */
const MARKER = "Document citations: when you cite or refer to document files"

/**
 * Instruction appended to agents' system prompts: cite documents in `doc`
 * fences, one path per line — relative to the working directory when the
 * file is inside it (D11). The TUI opens the document lines of those fences
 * (and of any running text) with a single left click through the root click
 * layer; the fences render as the host's standard code block (D2a).
 */
export const DOC_FENCE_INSTRUCTION = [
  MARKER + " (notes, specs, reports, PDFs, images, spreadsheets...), list their paths in a fenced code block with language `doc`, one path per line, so the user can open them with one click:",
  "```doc",
  "docs/file.md",
  "```",
  "Prefer paths relative to your current working directory (for example docs/file.md); use an absolute path or ~/ only when the file is outside it. Only list paths of real files that exist. Never use `doc` fences for code, logs or any other content.",
].join("\n")

/** Is the instruction already present in a system prompt? */
export function hasDocInstruction(system: string | undefined): boolean {
  return system?.includes(MARKER) ?? false
}

/** Append the instruction to a system prompt (idempotent). */
export function withDocInstruction(system: string): string {
  if (hasDocInstruction(system)) return system
  return `${system}\n\n${DOC_FENCE_INSTRUCTION}`
}
