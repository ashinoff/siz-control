import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During local development the frontend runs on :5173 and proxies /api calls
// to the FastAPI backend on :8000. In production the frontend is built to
// static files and talks to the API via VITE_API_URL.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
