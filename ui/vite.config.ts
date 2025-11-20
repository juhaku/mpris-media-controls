import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import tailwindcss from "@tailwindcss/vite";

const isProd = process.env.NODE_ENV === "production";

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: "0.0.0.0",
    allowedHosts: ["tower"],
  },
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: {
        enabled: true,
      },
      manifest: {
        name: isProd ? "Media Controls" : "Media Controls dev",
        short_name: isProd ? "Media Controls" : "Media Controls dev",
        id: isProd ? "http://tower:4433/" : "http://tower:5173/",
        start_url: isProd ? "http://tower:4433/" : "http://tower:5173/",
        display: "standalone",
        icons: [
          {
            src: "./public/mpris.svg",
            sizes: "any",
          },
        ],
        screenshots: [
          {
            src: "./screenshots/1b.png",
            form_factor: "narrow",
            type: "image/png",
            sizes: "400x867",
            label: "Playing video",
            platform: "ios",
          },
          {
            src: "./screenshots/2b.png",
            form_factor: "narrow",
            type: "image/png",
            sizes: "400x867",
            label: "Seek video",
            platform: "ios",
          },
        ],
      },
    }),
    tailwindcss(),
  ],
});
