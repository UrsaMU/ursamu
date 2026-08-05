import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Emit unhashed staff-theme.css for plugins (GET /admin/staff-theme.css). */
function emitStaffTheme(): Plugin {
  const themePath = resolve(
    __dirname,
    "src/assets/staff-theme.css",
  );
  return {
    name: "emit-staff-theme",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "staff-theme.css",
        source: readFileSync(themePath, "utf8"),
      });
    },
  };
}

// Staff console is served at /admin/ by @ursamu/web.
export default defineConfig({
  plugins: [vue(), emitStaffTheme()],
  base: "/admin/",
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4203",
        changeOrigin: true,
      },
      "/admin/ws": {
        target: "ws://localhost:4203",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: resolve(__dirname, "../dist"),
    emptyOutDir: true,
    sourcemap: true,
    assetsDir: "assets",
  },
});
