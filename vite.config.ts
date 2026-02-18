import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  build: {
    // Suppress Vercel sourcemap warnings; we don't need prod sourcemaps
    sourcemap: mode !== 'production',
    // Reduce noisy large chunk warnings in CI logs
    chunkSizeWarningLimit: 1200,
  },
}));
