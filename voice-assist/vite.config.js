import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    https: process.env.VITE_HTTPS === "true",
    port: 5173,
  },
});
