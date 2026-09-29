import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Both servers proxy /v1 to the FastAPI backend, so the browser never needs CORS.
const proxy = { "/v1": "http://127.0.0.1:8000" };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy },
  // `npm run build && npm run preview` serves the production build, e.g. behind a
  // temporary Cloudflare quick tunnel for remote demos (*.trycloudflare.com).
  preview: { port: 4173, proxy, allowedHosts: [".trycloudflare.com"] },
});
