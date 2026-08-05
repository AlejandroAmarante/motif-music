import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/motif-music/",

  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // The app registers the service worker itself, in
      // src/state/UpdateContext.jsx (via virtual:pwa-register/react), so it
      // can expose manual "Check for Updates" + "Automatically check for
      // updates" controls in Settings. Leaving this on would register a
      // second, independent instance of the same worker.
      injectRegister: false,
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

        // Important for GitHub Pages
        start_url: "/motif-music/",
        scope: "/motif-music/",

        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
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
