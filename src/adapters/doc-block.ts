import {
  BoxRenderable,
  createTextAttributes,
  TextRenderable,
  type CliRenderer,
  type MouseEvent,
  type Renderable,
} from "@opentui/core"
import type { ResolvedTheme } from "@opencode/theme/tui"
import type { DocOpener } from "../application/ports.js"
import { hasDocLine, parseDocBlock, type DocBlockLine } from "../domain/doc-block.js"

/**
 * Renderer for `doc` fence blocks (v2 — decisions « fence », « hover/clic »).
 *
 * The markdown code block renderer returns a Renderable that replaces the
 * default code block. The block is built with `@opentui/core` primitives
 * (`BoxRenderable` / `TextRenderable`) on the host renderer — the 4th
 * factory argument (`context.renderer` in tui.ts) — the same pattern as the
 * host's own custom renderers.
 *
 * It must NOT be built with the `@opentui/solid` reconciler: its renderer
 * registry is a SolidJS context per module instance, and the host renders
 * the plugin callback from its own bundled copy. The plugin's own solid
 * import never receives the host's RendererContext, so `createElement`
 * throws "No renderer found" (D2 — the real TUI crashed on a doc fence,
 * 2026-11-04 acceptance, instance #2).
 *
 * Behavior (spec AC-8…AC-10, AC-12):
 * - a line is a document (isDocPath) → link style (theme `markdown.linkText`),
 *   full width; hover = underline; left click (button 0) = open;
 * - a non-document line → plain muted text, not clickable;
 * - a block with no document line → the default code block rendering.
 *
 * The mouse chain runs on the typed `onMouse*` properties — the core
 * dispatch (`Renderable.processMouseEvent`) only invokes them (the v2
 * `"on:mouseUp"` props were dead in a real TUI), and the click handler
 * stops propagation so the v3 root click layer does not re-open the same
 * path (spec AC-17).
 */

/** Structural subset of the markdown renderer context this adapter consumes. */
interface DocBlockContext {
  defaultRender: () => Renderable | null
}

/** Structural subset of the marked code token this adapter consumes. */
interface DocCodeToken {
  text: string
}

const UNDERLINE = createTextAttributes({ underline: true })

/**
 * Builds the `doc` code block renderer.
 * @param opener opens a document path (the `xdg-open` adapter)
 * @param theme the resolved TUI theme (link color, muted text)
 * @param onOpenError reports a failed open (toast)
 * @param renderer the host TUI renderer the renderables are built on
 *   (`context.renderer`) — the plugin must not bring its own renderer
 *   instance (D2)
 */
export function docBlockRenderer(
  opener: DocOpener,
  theme: ResolvedTheme,
  onOpenError: (message: string) => void,
  renderer: CliRenderer,
) {
  const openLine = (path: string) => {
    opener.open(path).catch((error: unknown) =>
      onOpenError(error instanceof Error ? error.message : String(error)),
    )
  }

  const renderDocLine = (path: string): Renderable => {
    const label = new TextRenderable(renderer, {
      content: path,
      fg: theme.markdown.linkText,
    })
    const setUnderline = (hover: boolean) => {
      const current = label.attributes ?? 0
      label.attributes = hover ? current | UNDERLINE : current & ~UNDERLINE
      label.requestRender()
    }
    const row = new BoxRenderable(renderer, {
      width: "100%",
      onMouseUp: (event: MouseEvent) => {
        // The fence owns its release: stop bubbling to renderer.root so the
        // v3 root click layer does not re-open the same path (spec AC-17).
        event.stopPropagation()
        if (event.button === 0) openLine(path)
      },
      onMouseOver: () => setUnderline(true),
      onMouseOut: () => setUnderline(false),
    })
    row.add(label)
    return row
  }

  const renderLine = (line: DocBlockLine): Renderable => {
    if (line.path === undefined) {
      return new TextRenderable(renderer, {
        content: line.text,
        fg: theme.text.muted,
      })
    }
    return renderDocLine(line.path)
  }

  return (token: DocCodeToken, context: DocBlockContext): Renderable | undefined | null => {
    const lines = parseDocBlock(token.text)
    if (!hasDocLine(lines)) return context.defaultRender()
    const block = new BoxRenderable(renderer, {
      width: "100%",
      flexDirection: "column",
    })
    for (const line of lines) block.add(renderLine(line))
    return block
  }
}
