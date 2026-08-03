import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * Bundles vue into a single ESM file so the admin host can
 * dynamic-import it without an import map.
 *
 * Output: ../dist/host-entry.js
 * Copy to a plugin admin/ folder or serve under /admin/<id>/.
 */
export default defineConfig({
  build: {
    outDir: resolve(__dirname, "../dist"),
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/entry.ts"),
      formats: ["es"],
      fileName: () => "host-entry.js",
    },
    rollupOptions: {
      // Bundle vue so the demo works with a plain dynamic import()
      external: [],
    },
    minify: true,
    target: "esnext",
  },
});
