/**
 * The session's working directory, as a pure string decision — no TUI, no
 * client type leaks into the domain.
 *
 * The host exposes the session working directory on
 * `SessionInfo.location.directory` (an absolute path). Older hosts exposed it
 * (incorrectly, as the session id) through `session.root()`. This picks the
 * real directory when present and falls back to the legacy value otherwise,
 * so relative doc paths resolve against the directory the session actually
 * runs in (AC-14 / defect D1).
 */

/** The structural subset of a session the resolver needs (location may be absent). */
export interface SessionLocation {
  readonly location?: { readonly directory?: string }
}

/**
 * Returns the session working directory: `location.directory` when it is a
 * non-empty string, otherwise the legacy fallback (e.g. `session.root()`).
 */
export function sessionWorkingDirectory(session: SessionLocation | undefined, fallback: string): string {
  const dir = session?.location?.directory
  return typeof dir === "string" && dir.length > 0 ? dir : fallback
}
