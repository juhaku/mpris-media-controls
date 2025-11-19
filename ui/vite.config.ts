import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import tailwindcss from "@tailwindcss/vite";

const isProd = process.env.IS_PROD === "true";

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
        name: "Media Controls",
        short_name: "Media Controls",
        id: isProd ? "https://tower:4433/" : "http://tower:5465/",
        start_url: isProd ? "https://tower:4433/" : "http://tower:5465/",
        display: "standalone",
        icons: [
          {
            src: "./public/mpris.svg",
            sizes: "any",
          },
        ],
      },
    }),
    tailwindcss(),
  ],
});
