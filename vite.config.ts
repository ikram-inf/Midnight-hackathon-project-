import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// WebLLM needs SharedArrayBuffer, which needs these two headers in dev & prod.
// Without them, the model will fail to load with a cross-origin isolation error.
export default defineConfig({
  base: "/Midnight-hackathon-project-/",
  plugins: [react()],
  server: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
});