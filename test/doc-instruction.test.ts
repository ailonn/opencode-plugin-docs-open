import { describe, expect, it } from "vitest"
import { DOC_FENCE_INSTRUCTION, hasDocInstruction, withDocInstruction } from "../src/domain/doc-instruction.js"

describe("DOC_FENCE_INSTRUCTION", () => {
  it("shows the doc fence with one path per line", () => {
    expect(DOC_FENCE_INSTRUCTION).toContain("```doc")
    expect(DOC_FENCE_INSTRUCTION).toMatch(/one path per line/i)
  })

  it("prefers paths relative to the working directory (D11)", () => {
    expect(DOC_FENCE_INSTRUCTION).toContain(
      "Prefer paths relative to your current working directory",
    )
  })

  it("shows a relative example in the fence", () => {
    expect(DOC_FENCE_INSTRUCTION.split("\n")).toContain("docs/file.md")
  })

  it("never re-injects a prompt carrying the previous instruction version (stable first-line marker — cross-version lock)", () => {
    const legacy = [
      "Document citations: when you cite or refer to document files (notes, specs, reports, PDFs, images, spreadsheets...), list their paths in a fenced code block with language `doc`, one path per line, so the user can open them with one click:",
      "```doc",
      "/path/to/file.md",
      "```",
      "Only list paths of real files that exist. Never use `doc` fences for code, logs or any other content.",
    ].join("\n")
    const system = `You are a helpful assistant.\n\n${legacy}`
    expect(withDocInstruction(system)).toBe(system)
  })
})

describe("hasDocInstruction", () => {
  it("is false for undefined, empty and plain system prompts", () => {
    expect(hasDocInstruction(undefined)).toBe(false)
    expect(hasDocInstruction("")).toBe(false)
    expect(hasDocInstruction("You are a helpful assistant.")).toBe(false)
  })

  it("is true when the instruction is present", () => {
    expect(hasDocInstruction(`You are a helpful assistant.\n\n${DOC_FENCE_INSTRUCTION}`)).toBe(true)
  })
})

describe("withDocInstruction", () => {
  it("appends the instruction to the system prompt, separated by a blank line", () => {
    expect(withDocInstruction("You are a helpful assistant.")).toBe(
      `You are a helpful assistant.\n\n${DOC_FENCE_INSTRUCTION}`,
    )
  })

  it("is idempotent: a system prompt already carrying the instruction is returned unchanged", () => {
    const once = withDocInstruction("You are a helpful assistant.")
    expect(withDocInstruction(once)).toBe(once)
  })
})
