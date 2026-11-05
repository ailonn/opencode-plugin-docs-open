import { describe, expect, it } from "vitest"
import { listSessionDocs, openSessionDoc } from "../src/application/list-session-docs.js"
import type { SessionRefSource } from "../src/application/ports.js"
import type { SessionRef } from "../src/domain/docs-paths.js"

const SESSION_ROOT = "/tmp/session"
const HOME = "/tmp/u"

function fakeSource(refs: SessionRef[]): SessionRefSource {
  return { refs: async () => refs }
}

function fakeOpener() {
  const opened: string[] = []
  return {
    opened,
    open: async (path: string) => {
      opened.push(path)
    },
  }
}

describe("listSessionDocs", () => {
  it("returns formatted options, last cited first (LRU — D12), resolved values (D11)", async () => {
    const refs: SessionRef[] = [
      { kind: "message", text: "voir notes/a.md" },
      { kind: "tool", tool: "read", path: "/tmp/b.pdf" },
      { kind: "message", text: "et aussi notes/a.md" },
    ]
    const options = await listSessionDocs(fakeSource(refs), "ses_1", SESSION_ROOT, HOME)
    expect(options).toEqual([
      { title: "a.md — notes", value: "/tmp/session/notes/a.md" },
      { title: "b.pdf — tmp", value: "/tmp/b.pdf" },
    ])
  })

  it("dedupes the same path cited twice", async () => {
    const refs: SessionRef[] = [
      { kind: "tool", tool: "read", path: "/a/ODJ.md" },
      { kind: "tool", tool: "edit", path: "/a/ODJ.md" },
    ]
    const options = await listSessionDocs(fakeSource(refs), "ses_1", SESSION_ROOT, HOME)
    expect(options).toEqual([{ title: "ODJ.md — a", value: "/a/ODJ.md" }])
  })

  it("dedupes the same file cited relatively and absolutely (resolved dedupe — D11)", async () => {
    const refs: SessionRef[] = [
      { kind: "message", text: "voir notes/a.md" },
      { kind: "tool", tool: "read", path: "/tmp/session/notes/a.md" },
    ]
    const options = await listSessionDocs(fakeSource(refs), "ses_1", SESSION_ROOT, HOME)
    expect(options).toEqual([{ title: "a.md — notes", value: "/tmp/session/notes/a.md" }])
  })

  it("resolves ~/ citations against the home directory", async () => {
    const refs: SessionRef[] = [{ kind: "message", text: "voir ~/notes/c.odt" }]
    const options = await listSessionDocs(fakeSource(refs), "ses_1", SESSION_ROOT, HOME)
    expect(options).toEqual([{ title: "c.odt — notes", value: "/tmp/u/notes/c.odt" }])
  })

  it("returns an empty list when the session cites no document", async () => {
    expect(await listSessionDocs(fakeSource([]), "ses_1", SESSION_ROOT, HOME)).toEqual([])
    expect(
      await listSessionDocs(
        fakeSource([{ kind: "message", text: "rien de documentique" }]),
        "ses_1",
        SESSION_ROOT,
        HOME,
      ),
    ).toEqual([])
  })

  it("asks the source for the given session", async () => {
    const asked: string[] = []
    const source: SessionRefSource = {
      refs: async (sessionID) => {
        asked.push(sessionID)
        return []
      },
    }
    await listSessionDocs(source, "ses_42", SESSION_ROOT, HOME)
    expect(asked).toEqual(["ses_42"])
  })
})

describe("openSessionDoc", () => {
  it("delegates to the opener with the exact path", async () => {
    const opener = fakeOpener()
    await openSessionDoc(opener, { title: "a.md — notes", value: "notes/a.md" })
    expect(opener.opened).toEqual(["notes/a.md"])
  })

  it("propagates the opener failure (refusal case)", async () => {
    const failing = { open: async () => { throw new Error("xdg-open absent") } }
    await expect(openSessionDoc(failing, { title: "x.md — x", value: "/x.md" })).rejects.toThrow(
      "xdg-open absent",
    )
  })
})
