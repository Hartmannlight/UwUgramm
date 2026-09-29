import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5193,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8013" },
  },
  build: {
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
});
