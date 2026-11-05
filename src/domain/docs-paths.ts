/**
 * Pure functions for opencode-docs — no TUI, no IO.
 *
 * Contract: opencode-docs-spec.md (AC-1, AC-3, AC-4, AC-5, AC-21, AC-22) —
 * extraction, dedupe, LRU recency sort, option format. The TUI layer
 * (dialog, spawn xdg-open) is validated by manual acceptance (see spec,
 * testing strategy).
 */

import { resolveDocPath } from "./path-resolve.js"

/** Document suffixes — a path is a "document" only if it carries one (both sources). */
export const DOC_SUFFIXES = [
  ".md",
  ".pdf",
  ".docx",
  ".odt",
  ".pptx",
  ".xlsx",
  ".txt",
  ".png",
  ".svg",
] as const

/** One session reference, in session order (tool calls and messages interleaved). */
export type SessionRef =
  | { kind: "tool"; tool: "read" | "write" | "edit" | "shell"; path: string }
  | { kind: "message"; text: string }

/** A document path and the position of its **last** appearance in the session (recency — LRU, D12). */
export interface DocEntry {
  path: string
  seen: number
}

/** A dialog document: the cited form (last occurrence — display) + resolved absolute path (open) + last position. */
export interface RankedDoc {
  path: string
  resolved: string
  seen: number
}

const SUFFIX_ALT = DOC_SUFFIXES.map((s) => s.slice(1).replace(/\./g, "\\."))

/** Quoted segment: "..." or '...' — handles spaces inside the path. */
const QUOTED_RE = /["']([^"'\n]+)["']/g

/**
 * Bare path token: starts after a boundary (line start, whitespace, `=`, `:`,
 * `(`, `"`), contains no whitespace/quotes/shell separators, ends with a
 * document suffix. The lookahead keeps trailing punctuation (`.`, `)`) out of
 * the match.
 */
const BARE_RE = new RegExp(
  "(?<=^|[\\s=:\"(])([^\\s\"'`<>()|;,&]+\\.(?:" + SUFFIX_ALT.join("|") + "))(?=$|[\\s\"'`<>()|;,&:.)])",
  "gi",
)

/** A path is a document only if it carries one of DOC_SUFFIXES (case-insensitive). */
export function isDocPath(path: string): boolean {
  const lower = path.toLowerCase()
  return (DOC_SUFFIXES as readonly string[]).some((s) => lower.endsWith(s))
}

/**
 * Candidate path tokens from free text (shell command line, assistant or user
 * message): quoted segments first (spaces allowed), then bare tokens.
 */
export function pathTokens(text: string): string[] {
  const tokens: string[] = []
  for (const m of text.matchAll(QUOTED_RE)) tokens.push(m[1])
  const stripped = text.replace(QUOTED_RE, " ")
  for (const m of stripped.matchAll(BARE_RE)) tokens.push(m[1])
  return tokens
}

/**
 * Extract document paths from tool calls and message text.
 * - tool refs: the `path` field directly (for `shell`, a command line — tokens
 *   are extracted from it);
 * - message refs: path tokens in the text;
 * - a path is a document only if it carries a DOC_SUFFIXES suffix;
 * - duplicates keep the **last** appearance (LRU contract, D12 — `seen` =
 *   position of the last occurrence, so re-citing a document bumps it up);
 * - result is in order of first appearance.
 */
export function extractDocPaths(refs: SessionRef[]): DocEntry[] {
  const firstOrder: string[] = []
  const lastSeen = new Map<string, number>()
  let seen = 0
  for (const ref of refs) {
    const candidates =
      ref.kind === "tool" ? (ref.tool === "shell" ? pathTokens(ref.path) : [ref.path]) : pathTokens(ref.text)
    for (const candidate of candidates) {
      if (!isDocPath(candidate)) continue
      if (!lastSeen.has(candidate)) firstOrder.push(candidate)
      lastSeen.set(candidate, seen++)
    }
  }
  return firstOrder.map((path) => ({ path, seen: lastSeen.get(path)! }))
}

/** Keep one entry per path — last occurrence wins (LRU contract, D12). */
export function dedupePaths(entries: DocEntry[]): DocEntry[] {
  const byPath = new Map<string, DocEntry>()
  for (const entry of entries) {
    const existing = byPath.get(entry.path)
    if (existing && existing.seen >= entry.seen) continue
    byPath.set(entry.path, entry)
  }
  return [...byPath.values()]
}

/** Most recently seen first (returns a new array). */
export function sortByRecency(entries: DocEntry[]): DocEntry[] {
  return [...entries].sort((a, b) => b.seen - a.seen)
}

/**
 * Dialog ranking (D11 + D12): resolve every entry against the session root
 * and home (`resolveDocPath` — the same rule as the click flow), dedupe by
 * **resolved** path (last occurrence wins — a file cited relatively and
 * absolutely is one document), most recently seen first.
 */
export function rankDocs(entries: readonly DocEntry[], sessionRoot: string, home: string): RankedDoc[] {
  const byResolved = new Map<string, RankedDoc>()
  for (const entry of entries) {
    const resolved = resolveDocPath(entry.path, sessionRoot, home)
    const existing = byResolved.get(resolved)
    if (existing && existing.seen >= entry.seen) continue
    byResolved.set(resolved, { path: entry.path, resolved, seen: entry.seen })
  }
  return [...byResolved.values()].sort((a, b) => b.seen - a.seen)
}

/** Dialog option: `file-name — parent-folder` (value = the path, intact). */
export function formatDocOption(path: string): { title: string; value: string } {
  const normalized = path.endsWith("/") ? path.slice(0, -1) : path
  const index = normalized.lastIndexOf("/")
  const name = index === -1 ? normalized : normalized.slice(index + 1)
  const parentPath = index <= 0 ? "" : normalized.slice(0, index).replace(/\/+$/, "")
  const parent = parentPath.split("/").pop() ?? ""
  return { title: parent ? `${name} — ${parent}` : name, value: path }
}
