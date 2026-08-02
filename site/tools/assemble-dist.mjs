/**
 * Assembles the final GitHub Pages artifact in site/dist:
 *   - legacy pages + assets copied verbatim from the repo root (never bundled)
 *   - the Vite build (site/dist-vite) placed at /next/ (staging) or / (cutover)
 *
 * Cutover is controlled by JOURNEY_AT_ROOT=1, which also preserves the legacy
 * home as home-legacy.html for one release. Rollback = unset the flag.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const site = dirname(dirname(fileURLToPath(import.meta.url)));
const repo = dirname(site);
const viteOut = join(site, "dist-vite");
const out = join(site, "dist");
const atRoot = !!process.env.JOURNEY_AT_ROOT;

if (!existsSync(viteOut)) {
  console.error("assemble-dist: missing dist-vite — run `vite build` first");
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// Legacy statics, copied verbatim. assets/sass is .gitignored (absent in CI);
// skip it locally so local dist matches the CI artifact.
const skip = [`assets${sep}sass`];
const copyFilter = (src) => !skip.some((s) => src.includes(s));

for (const f of ["technical.html", "devlog.html", "CNAME"]) {
  cpSync(join(repo, f), join(out, f));
}
cpSync(join(repo, "assets"), join(out, "assets"), { recursive: true, filter: copyFilter });
cpSync(join(repo, "images"), join(out, "images"), { recursive: true });

if (atRoot) {
  cpSync(join(repo, "index.html"), join(out, "home-legacy.html"));
  cpSync(viteOut, out, { recursive: true });
  // /next/ was the staging channel through the whole build; anyone holding
  // that link (or a bookmark) should land on the real thing, not a 404.
  mkdirSync(join(out, "next"), { recursive: true });
  writeFileSync(
    join(out, "next", "index.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Loom Robotics</title>
    <link rel="canonical" href="https://loom-robotics.com/" />
    <meta name="robots" content="noindex" />
    <meta http-equiv="refresh" content="0; url=/" />
  </head>
  <body>
    <p>The preview channel is now the live site. <a href="/">Continue</a>.</p>
  </body>
</html>
`
  );
} else {
  cpSync(join(repo, "index.html"), join(out, "index.html"));
  cpSync(viteOut, join(out, "next"), { recursive: true });
}

// Pages must not run Jekyll over the artifact.
writeFileSync(join(out, ".nojekyll"), "");

console.log(
  `assemble-dist: journey at ${atRoot ? "/ (CUTOVER, legacy home kept as /home-legacy.html)" : "/next/ (staging)"}`
);
