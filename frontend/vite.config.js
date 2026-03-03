import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  preview: {
    allowedHosts: ["app.nsevenshop.by", "spelling-frontend.onrender.com"]
  }
});

