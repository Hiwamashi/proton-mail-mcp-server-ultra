import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { parseMode, parseAttachmentRoots } from "../src/config.js";

const HOME = "/home/u";
const DIR = "/home/u/Downloads/Proton-Anhänge";

test("parseMode accepts the three valid modes", () => {
  for (const m of ["read-only", "drafts", "full"]) assert.equal(parseMode(m), m);
});

test("parseMode defaults to drafts when unset or empty", () => {
  assert.equal(parseMode(undefined), "drafts");
  assert.equal(parseMode(""), "drafts");
  assert.equal(parseMode("  "), "drafts");
});

test("parseMode rejects unknown values and names all valid modes", () => {
  assert.throws(() => parseMode("bogus"), (err) => {
    for (const m of ["read-only", "drafts", "full"]) assert.match(err.message, new RegExp(m));
    assert.match(err.message, /bogus/);
    return true;
  });
});

test("attachment roots default list", () => {
  const expected = [join(HOME, "Downloads"), join(HOME, "Documents"), join(HOME, "Desktop"), DIR];
  assert.deepEqual(parseAttachmentRoots(undefined, DIR, HOME), expected);
  assert.deepEqual(parseAttachmentRoots("", DIR, HOME), expected);
  assert.deepEqual(parseAttachmentRoots(" , ,", DIR, HOME), expected);
});

test("attachment roots expand ~, trim and drop empty entries", () => {
  assert.deepEqual(parseAttachmentRoots(" ~/a , ,/abs/b,~ ", DIR, HOME), [join(HOME, "a"), "/abs/b", HOME]);
});

test("attachment roots: single * means unrestricted", () => {
  assert.equal(parseAttachmentRoots("*", DIR, HOME), "*");
  assert.equal(parseAttachmentRoots(" * ", DIR, HOME), "*");
});

test("message cache and large-message settings have their documented defaults", async () => {
  const { CONFIG } = await import("../src/config.js");
  for (const key of ["PROTON_MCP_CACHE_MAX_BYTES", "PROTON_MCP_CACHE_TTL_MS", "PROTON_MCP_PARTIAL_FETCH_BYTES", "PROTON_MCP_MAX_INLINE_IMAGE_BYTES"]) {
    if (process.env[key]) return; // an explicit override makes the default check meaningless
  }
  assert.equal(CONFIG.cacheMaxBytes, 67108864);
  assert.equal(CONFIG.cacheTtlMs, 600000);
  assert.equal(CONFIG.partialFetchBytes, 5242880);
  assert.equal(CONFIG.maxInlineImageBytes, 1048576);
});
