import { readFileSync } from "node:fs";
import { build } from "esbuild";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

// Bundles everything into a single dist/server.mjs, so Claude Desktop needs no node_modules.
await build({
  entryPoints: ["src/server.js"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "dist/server.mjs",
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
  },
  // The reported MCP server version (see src/version.js).
  define: { __PKG_VERSION__: JSON.stringify(version) },
  logLevel: "info",
});
