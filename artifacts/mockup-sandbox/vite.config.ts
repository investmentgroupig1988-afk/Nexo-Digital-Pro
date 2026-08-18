import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { cartographer } from "@replit/vite-plugin-cartographer";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin";

function getPort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;

  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid PORT value: "${value}"`);
  }

  return port;
}

function getBasePath(value: string | undefined): string {
  if (!value) return "/";
  const basePath = value.trim();
  if (!basePath.startsWith("/")) {
    throw new Error("BASE_PATH must start with '/'.");
  }
  return basePath.endsWith("/") ? basePath : `${basePath}/`;
}

const workspaceRoot = path.resolve(import.meta.dirname, "../..");

function getProxyTarget(value: string | undefined): string {
  const target = value?.trim() || "http://127.0.0.1:5000";
  const parsed = new URL(target);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("VITE_API_PROXY_TARGET must be an absolute http(s) URL.");
  }
  return parsed.toString().replace(/\/$/, "");
}

export default defineConfig(({ mode }) => {
  // Vite only exposes VITE_* variables. API credentials remain server-only.
  const viteEnv = loadEnv(mode, workspaceRoot, "VITE_");
  const port = getPort(viteEnv.VITE_PORT ?? process.env.PORT, 5173);
  const basePath = getBasePath(process.env.BASE_PATH);

  return {
    base: basePath,
    envDir: workspaceRoot,
    plugins: [
      mockupPreviewPlugin(),
      react(),
      tailwindcss(),
      runtimeErrorOverlay(),
      ...(process.env.NODE_ENV !== "production" &&
      process.env.REPL_ID !== undefined
        ? [
            cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
      },
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist"),
      emptyOutDir: true,
    },
    server: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
      proxy: {
        "/api": {
          target: getProxyTarget(viteEnv.VITE_API_PROXY_TARGET),
          changeOrigin: true,
        },
      },
      fs: {
        strict: true,
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
