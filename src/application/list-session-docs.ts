import { extractDocPaths, formatDocOption, rankDocs } from "../domain/docs-paths.js"
import type { DocOpener, SessionRefSource } from "./ports.js"

/** Dialog-ready option: `title` for display (the cited form), `value` = the resolved absolute path. */
export interface DocOption {
  title: string
  value: string
}

/**
 * List the documents cited in a session, deduplicated by resolved path, last
 * cited first (LRU), formatted for a selection dialog — the option value is
 * the resolved absolute path (D11: the same rule as the click flow), so
 * relative and `~/` citations open at the right file.
 */
export async function listSessionDocs(
  source: SessionRefSource,
  sessionID: string,
  sessionRoot: string,
  home: string,
): Promise<DocOption[]> {
  const entries = extractDocPaths(await source.refs(sessionID))
  return rankDocs(entries, sessionRoot, home).map((doc) => ({
    title: formatDocOption(doc.path).title,
    value: doc.resolved,
  }))
}

/**
 * Open one document. Failures propagate — the driving adapter decides how to
 * report them (e.g. a toast).
 */
export async function openSessionDoc(opener: DocOpener, option: DocOption): Promise<void> {
  await opener.open(option.value)
}
