import path from "node:path";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
      exclude: ["net", "assert", "vm"],
    }),
  ],
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      // Frontend app source (until Phase 0: move to apps/web/src/app and remove desktop)
      "@": path.resolve(__dirname, "../../fincept-terminal-desktop/src"),
      "net": path.resolve(__dirname, "../../fincept-terminal-desktop/src/polyfills/net-shim.ts"),
      "node:net": path.resolve(__dirname, "../../fincept-terminal-desktop/src/polyfills/net-shim.ts"),
      "assert": path.resolve(__dirname, "../../fincept-terminal-desktop/src/polyfills/assert-shim.ts"),
      "node:assert": path.resolve(__dirname, "../../fincept-terminal-desktop/src/polyfills/assert-shim.ts"),
      "vm": path.resolve(__dirname, "../../fincept-terminal-desktop/src/polyfills/vm-shim.ts"),
      "node:vm": path.resolve(__dirname, "../../fincept-terminal-desktop/src/polyfills/vm-shim.ts"),
      "ws": path.resolve(__dirname, "../../fincept-terminal-desktop/src/polyfills/ws-shim.ts"),
      // Tauri shims (web: no Rust, bridge to FastAPI)
      "@tauri-apps/api/core": path.resolve(__dirname, "./src/shims/tauri-core.ts"),
      "@tauri-apps/api/event": path.resolve(__dirname, "./src/shims/tauri-event.ts"),
      "@tauri-apps/api/path": path.resolve(__dirname, "./src/shims/tauri-path.ts"),
      "@tauri-apps/plugin-dialog": path.resolve(__dirname, "./src/shims/tauri-dialog.ts"),
      "@tauri-apps/plugin-fs": path.resolve(__dirname, "./src/shims/tauri-fs.ts"),
      "@tauri-apps/plugin-http": path.resolve(__dirname, "./src/shims/tauri-http.ts"),
      "@tauri-apps/plugin-shell": path.resolve(__dirname, "./src/shims/tauri-shell.ts"),
      "@tauri-apps/plugin-opener": path.resolve(__dirname, "./src/shims/tauri-opener.ts"),
      "@tauri-apps/plugin-process": path.resolve(__dirname, "./src/shims/tauri-process.ts"),
      "@tauri-apps/plugin-updater": path.resolve(__dirname, "./src/shims/tauri-updater.ts"),
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
    global: "globalThis",
  },
});
