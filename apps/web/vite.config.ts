import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import rootPackage from "../../package.json";
import { createDevLiveSearchPlugin } from "./src/dev/liveSearchPlugin";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(import.meta.dirname, "../.."), "");
  return {
    root: import.meta.dirname,
    envDir: resolve(import.meta.dirname, "../.."),
    base: env.VITE_APP_BASE_PATH || "/pingpong-busu/",
    plugins: [
      react(),
      createDevLiveSearchPlugin({
        enabled:
          env.CRAWL_LIVE === "true" &&
          env.CRAWLER_SOURCE_ASTREE_ENABLED === "true",
        timeoutMs: Number(env.CRAWLER_REQUEST_TIMEOUT_MS || 8000),
        cooldownSeconds: Number(env.CRAWLER_COOLDOWN_SECONDS || 21600),
        userAgent: env.CRAWLER_USER_AGENT || `BUSU/${rootPackage.version}`,
      }),
    ],
    server: { port: 5173 },
  };
});
