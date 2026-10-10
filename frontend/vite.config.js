import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  resolve: {
    // permite importar "@/components/..." em vez de "../../components/..."
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon-180x180.png", "icon.svg"],
      manifest: {
        name: "AxiiGains",
        short_name: "AxiiGains",
        description: "Seu app de treinos personalizado",
        lang: "pt-BR",
        theme_color: "#0B0616",
        background_color: "#0B0616",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Nunca guardar respostas da API no cache: os dados mudam o tempo todo
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
  server: {
    proxy: {
      // o backend já usa o prefixo /api, então só repassamos
      "/api": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
});
