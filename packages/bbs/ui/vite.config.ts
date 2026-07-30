import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";

// Served by @ursamu/bbs at /admin/bbs-app/ (standalone).
// In-console BBS lives in @ursamu/web at /admin/bbs.
export default defineConfig({
  plugins: [vue()],
  base: "/admin/bbs-app/",
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:4203",
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
