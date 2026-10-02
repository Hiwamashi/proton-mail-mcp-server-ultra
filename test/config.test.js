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
