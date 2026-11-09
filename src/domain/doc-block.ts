/**
 * Pure functions for `doc` fence blocks (v2) — no TUI, no IO.
 *
 * Contract: opencode-docs-spec.md v2 (AC-8, AC-10) — a `doc` fence body is one
 * path per line; a line is a document only if it carries a DOC_SUFFIXES
 * suffix (see docs-paths.ts). The TUI rendering (link style, hover, click →
 * xdg-open) is validated by manual PO acceptance.
 */
import { isDocPath } from "./docs-paths.js"

/** One line of a `doc` fence: display text + resolved document path (if any). */
export interface DocBlockLine {
  text: string
  path?: string
}

/**
 * Parse the body of a `doc` fence (the content between the fences, as handed
 * by the markdown parser — the fence markers are not part of it).
 * - lines are trimmed; CRLF-safe;
 * - blank / whitespace-only lines are dropped;
 * - a line is a document (`path` set) iff it carries a document suffix.
 */
export function parseDocBlock(text: string): DocBlockLine[] {
  const lines: DocBlockLine[] = []
  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim()
    if (trimmed === "") continue
    lines.push(isDocPath(trimmed) ? { text: trimmed, path: trimmed } : { text: trimmed })
  }
  return lines
}

/** True when at least one line is a document path (the block is worth custom rendering). */
export function hasDocLine(lines: DocBlockLine[]): boolean {
  return lines.some((line) => line.path !== undefined)
}
