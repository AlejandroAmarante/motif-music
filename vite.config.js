import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Motif is offline-first: the service worker only caches the app shell
// (JS/CSS/HTML/icons). Audio files stay on the user's disk and are opened
// live through the File System Access API — we never cache or copy media.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.svg"],
      manifest: {
        name: "Motif — Local-First Music",
        short_name: "Motif",
        description:
          "Your library, not a subscription. Local-first music player and discovery.",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          {
            src: "/icons/icon-192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/icons/icon-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/icons/icon-maskable.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // App shell only — no runtime caching of arbitrary origins,
        // since Motif has no streaming backend to cache against.
        globPatterns: ["**/*.{js,css,html,svg}"],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
