# Phase 0 — Final cleanup (optional)

This document describes the optional final step to remove the `fincept-terminal-desktop/` folder entirely so the repo contains only `apps/web` and `apps/api`.

**Current state:** The web app (`apps/web`) loads the React UI from `fincept-terminal-desktop/src` via Vite aliases. The FastAPI backend (`apps/api`) implements the invoke bridge and no longer depends on Rust.

**To run without the desktop folder:**

1. Copy the frontend source into the web app:
   ```bash
   cp -r fincept-terminal-desktop/src apps/web/src/app
   ```
2. Update `apps/web/src/main.tsx` to import the app entry:
   ```ts
   import "./shims/runtime-globals";
   import "./app/main";
   ```
3. Update `apps/web/vite.config.ts` so that the `"@"` alias points to `path.resolve(__dirname, "src/app")` and polyfill paths point to `./src/app/polyfills/...`.
4. Remove any remaining imports of `fincept-terminal-desktop` in the copied tree (e.g. `tauri-cors-config` can be a no-op shim in web).
5. Delete the desktop folder, then run `pnpm run dev:web` and `pnpm run dev:api` from the repo root.

Until this is done, the repo still contains `fincept-terminal-desktop/` for the frontend source; Rust/Tauri/Bun are not used when running the web stack.
