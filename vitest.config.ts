import { defineConfig } from "vitest/config"

/**
 * The unit suite runs on node. `test/harness/` drives the native OpenTUI
 * renderer through the @opentui/core/testing harness, whose FFI is only
 * available on bun — it runs separately: `bun test test/harness`.
 */
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "test/harness/**"],
  },
})
