declare global {
  interface Window {
    __TAURI__?: unknown;
    global?: Window;
    process?: {
      env: Record<string, string>;
      browser: boolean;
      cwd: () => string;
    };
    module?: { exports: Record<string, unknown> };
  }
}

window.__TAURI__ = undefined;
window.global = window;
window.process = {
  env: { NODE_ENV: import.meta.env.MODE },
  browser: true,
  cwd: () => "/",
};
window.module = { exports: {} };

export {};
