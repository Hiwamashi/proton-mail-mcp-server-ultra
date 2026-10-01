import { build } from "esbuild";

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
  logLevel: "info",
});
