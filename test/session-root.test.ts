import { describe, expect, it } from "vitest"
import { sessionWorkingDirectory } from "../src/domain/session-root.js"

describe("sessionWorkingDirectory (D1 / AC-14)", () => {
  it("uses the session location.directory (the host's session working directory)", () => {
    expect(
      sessionWorkingDirectory(
        { location: { directory: "/tmp/docs-session" } },
        "ses_fallback",
      ),
    ).toBe("/tmp/docs-session")
  })

  it("falls back to the legacy root when the session has no location", () => {
    expect(sessionWorkingDirectory({}, "ses_fallback")).toBe("ses_fallback")
  })

  it("falls back when the session is unknown", () => {
    expect(sessionWorkingDirectory(undefined, "ses_fallback")).toBe("ses_fallback")
  })

  it("falls back on an empty directory", () => {
    expect(
      sessionWorkingDirectory({ location: { directory: "" } }, "ses_fallback"),
    ).toBe("ses_fallback")
  })
})
