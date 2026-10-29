import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "Quest Qlub",
        short_name: "Quest Qlub",
        description: "Quest Qlubは、学びの「楽しい！」をつなげる記事プラットフォームです。",
        theme_color: "#bf783a",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        scope: "/",
        lang: "ja",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        shortcuts: [
          {
            name: "記事を探す",
            short_name: "記事を探す",
            description: "Quest Qlubで新しい記事を探す",
            url: "/search",
            icons: [{ src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" }],
          },
          {
            name: "ダッシュボード",
            short_name: "ダッシュボード",
            description: "ライターダッシュボードを開く",
            url: "/writer-dash",
            icons: [{ src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" }],
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp}"],
        globIgnores: ["**/pwa-*.png"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "supabase-images-cache",
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 365 * 24 * 60 * 60,
              },
            },
          },
        ],
      },
    }),
  ],
  appType: "spa",
});
