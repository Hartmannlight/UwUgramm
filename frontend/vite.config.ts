import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { cp } from "node:fs/promises";
import { resolve } from "node:path";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const appMode = env.VITE_APP_MODE || (mode === "static" ? "local" : "cloud");
  if (!["local", "cloud"].includes(appMode))
    throw new Error("VITE_APP_MODE must be local or cloud");
  return {
    base: env.VITE_BASE_PATH || "/",
    define: { "import.meta.env.VITE_APP_MODE": JSON.stringify(appMode) },
    worker: { format: "es" },
    plugins: [
      react(),
      {
        name: "local-python-assets",
        apply: "build",
        async closeBundle() {
          if (appMode === "local")
            await cp(resolve(".local/python"), resolve("dist/python"), {
              recursive: true,
            });
        },
        transformIndexHtml() {
          if (appMode !== "local") return [];
          return [
            {
              tag: "meta",
              attrs: {
                "http-equiv": "Content-Security-Policy",
                content:
                  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
              },
              injectTo: "head-prepend",
            },
          ];
        },
      },
    ],
    server: {
      port: 5193,
      strictPort: true,
      proxy: { "/api": "http://127.0.0.1:8013" },
    },
    build: {
      assetsInlineLimit: 0,
      rollupOptions: {
        output: {
          manualChunks: {
            editor: [
              "@uiw/react-codemirror",
              "@codemirror/lang-python",
              "@codemirror/autocomplete",
              "@codemirror/view",
              "@codemirror/state",
            ],
          },
        },
      },
    },
  };
});
