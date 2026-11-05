import { describe, expect, it } from "vitest"
import type { SessionMessageAssistant, SessionMessageInfo } from "@opencode/client"
import { refsFromMessages } from "../src/adapters/session-refs.js"

function user(text: string): SessionMessageInfo {
  return { id: "msg_u", type: "user", time: { created: 1 }, text }
}

// Test fakes: `content` is typed as a non-empty tuple by the generated
// schema; the mapper under test only reads parts, so the boundary is cast.
function assistant(parts: readonly unknown[]): SessionMessageInfo {
  return {
    id: "msg_a",
    type: "assistant",
    time: { created: 1 },
    agent: "general",
    model: { id: "m", providerID: "p" },
    content: parts as SessionMessageAssistant["content"],
  }
}

describe("refsFromMessages", () => {
  it("maps a user message to a message ref", () => {
    expect(refsFromMessages([user("voir notes/a.md")])).toEqual([{ kind: "message", text: "voir notes/a.md" }])
  })

  it("maps assistant text parts to message refs", () => {
    const refs = refsFromMessages([assistant([{ type: "text", text: "voir notes/a.md" }])])
    expect(refs).toEqual([{ kind: "message", text: "voir notes/a.md" }])
  })

  it("maps read/write/edit tool parts to tool refs with the path", () => {
    const refs = refsFromMessages([
      assistant([
        { type: "tool", id: "t1", name: "read", state: { status: "completed", input: { path: "/a.md" }, content: [] } },
        { type: "tool", id: "t2", name: "write", state: { status: "completed", input: { path: "/b.odt" }, content: [] } },
        { type: "tool", id: "t3", name: "edit", state: { status: "completed", input: { path: "/c.pdf" }, content: [] } },
      ]),
    ])
    expect(refs).toEqual([
      { kind: "tool", tool: "read", path: "/a.md" },
      { kind: "tool", tool: "write", path: "/b.odt" },
      { kind: "tool", tool: "edit", path: "/c.pdf" },
    ])
  })

  it("maps a shell tool part to a shell ref with the command line", () => {
    const refs = refsFromMessages([
      assistant([
        {
          type: "tool",
          id: "t1",
          name: "shell",
          state: { status: "completed", input: { command: 'pdftotext "/docs/r.pdf" /tmp/o' }, content: [] },
        },
      ]),
    ])
    expect(refs).toEqual([{ kind: "tool", tool: "shell", path: 'pdftotext "/docs/r.pdf" /tmp/o' }])
  })

  it("treats a streaming tool state (partial input string) as free text", () => {
    const refs = refsFromMessages([
      assistant([
        { type: "tool", id: "t1", name: "shell", state: { status: "streaming", input: "cat /a.md" }, time: { created: 1 } },
      ]),
    ])
    expect(refs).toEqual([{ kind: "message", text: "cat /a.md" }])
  })

  it("ignores unknown tool names and non-user/assistant messages", () => {
    const refs = refsFromMessages([
      assistant([
        { type: "tool", id: "t1", name: "websearch", state: { status: "completed", input: { query: "x.md" }, content: [] } },
        { type: "reasoning", text: "thinking about /hidden.md" },
      ]),
    ])
    expect(refs).toEqual([])
  })
})
