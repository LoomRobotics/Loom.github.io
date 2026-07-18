import { defineConfig, type Plugin } from "vite";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

// The journey deploys under /next/ (staging) until JOURNEY_AT_ROOT=1 flips it to /.
// Legacy pages (technical.html, devlog.html, assets/, images/) live at the dist root,
// copied verbatim by tools/assemble-dist.mjs — they are never bundled.
const atRoot = !!process.env.JOURNEY_AT_ROOT;

const repoRoot = resolve(import.meta.dirname, "..");

const MIME: Record<string, string> = {
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".ico": "image/x-icon",
};

// Dev-only: serve the legacy repo-root /assets/* and /images/* so root-absolute
// brand references (brand.css, wordmark) resolve in `vite dev` exactly as they
// will in the assembled dist.
function serveLegacyAssets(): Plugin {
  return {
    name: "loom-serve-legacy-assets",
    apply: "serve",
    configureServer(server) {
      // Dev-only verification endpoint: the page POSTs base64 frames here so
      // captures land on disk without huge strings crossing tool boundaries.
      server.middlewares.use("/__capture", (req, res) => {
        const name = (new URL(req.url ?? "/", "http://x").searchParams.get("name") ?? "capture")
          .replace(/[^a-z0-9_-]/gi, "");
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", async () => {
          const { mkdirSync, writeFileSync } = await import("node:fs");
          const dir = resolve(import.meta.dirname, "captures");
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, `${name}.jpg`), Buffer.from(body, "base64"));
          res.end("ok");
        });
      });
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0] ?? "";
        if (!url.startsWith("/assets/") && !url.startsWith("/images/")) return next();
        const file = join(repoRoot, decodeURIComponent(url));
        if (!existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("Content-Type", MIME[extname(file).toLowerCase()] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  base: atRoot ? "/" : "/next/",
  plugins: [serveLegacyAssets()],
  build: {
    outDir: "dist-vite",
    assetsDir: "app",
    emptyOutDir: true,
    target: "es2022",
  },
});
