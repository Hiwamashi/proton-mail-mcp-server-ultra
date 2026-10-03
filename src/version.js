import { createRequire } from "node:module";

// Version reported to MCP clients. The build injects __PKG_VERSION__ from package.json; running from
// src/ (tests, development) reads package.json directly.
/* global __PKG_VERSION__ */
export const SERVER_VERSION =
  typeof __PKG_VERSION__ !== "undefined" ? __PKG_VERSION__ : createRequire(import.meta.url)("../package.json").version;
