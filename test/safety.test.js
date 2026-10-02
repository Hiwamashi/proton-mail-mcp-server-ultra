import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertAttachable } from "../src/safety.js";
import { fileAttachments } from "../src/tools/compose.js";

// os.tmpdir() is /var/... on macOS, a symlink to /private/var: roots must be compared by real path.
let base;
let docs;
let outside;
let home;

before(async () => {
  base = await mkdtemp(join(tmpdir(), "safety-"));
  home = join(base, "home");
  docs = join(home, "Documents");
  outside = join(base, "outside");
  await mkdir(join(docs, "sub"), { recursive: true });
  await mkdir(join(docs, ".hidden"), { recursive: true });
  await mkdir(join(home, ".ssh"), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(docs, "Angebot.pdf"), "pdf");
  await writeFile(join(docs, "sub", "a.txt"), "a");
  await writeFile(join(docs, ".env"), "SECRET=1");
  await writeFile(join(docs, ".hidden", "b.txt"), "b");
  await writeFile(join(home, ".ssh", "id_ed25519"), "key");
  await writeFile(join(outside, "report.csv"), "x");
  await writeFile(join(outside, "secret.txt"), "s");
  await symlink(join(outside, "secret.txt"), join(docs, "link.txt"));
  await symlink(join(home, ".ssh"), join(docs, "sshlink"));
});

after(() => rm(base, { recursive: true, force: true }));

test("accepts a file inside a root and returns its real path", async () => {
  const real = await assertAttachable(join(docs, "Angebot.pdf"), [docs], home);
  assert.equal(real, await realpath(join(docs, "Angebot.pdf")));
  assert.equal(await assertAttachable(join(docs, "sub", "a.txt"), [docs], home), await realpath(join(docs, "sub", "a.txt")));
});

test("expands ~ using the given home", async () => {
  assert.ok(await assertAttachable("~/Documents/Angebot.pdf", [docs], home));
});

test("refuses ~/.ssh key outside roots and inside hidden segment", async () => {
  await assert.rejects(assertAttachable(join(home, ".ssh", "id_ed25519"), [docs], home), /refused/);
  await assert.rejects(assertAttachable(join(home, ".ssh", "id_ed25519"), [home], home), /refused/);
  await assert.rejects(assertAttachable("~/.ssh/id_ed25519", "*", home), /refused/);
});

test("refuses hidden file and hidden directory below a root", async () => {
  await assert.rejects(assertAttachable(join(docs, ".env"), [docs], home), /refused/);
  await assert.rejects(assertAttachable(join(docs, ".hidden", "b.txt"), [docs], home), /refused/);
});

test("refuses .. traversal out of the root", async () => {
  await assert.rejects(assertAttachable(join(docs, "..", "..", "outside", "report.csv"), [docs], home), /refused/);
  await assert.rejects(assertAttachable(join(docs, "sub", "..", "..", ".ssh", "id_ed25519"), [docs], home), /refused/);
});

test("refuses a symlink escaping the root", async () => {
  await assert.rejects(assertAttachable(join(docs, "link.txt"), [docs], home), /refused/);
  await assert.rejects(assertAttachable(join(docs, "sshlink", "id_ed25519"), [docs], home), /refused/);
});

test("refuses a directory", async () => {
  await assert.rejects(assertAttachable(join(docs, "sub"), [docs], home), /refused/);
});

test("refuses relative paths", async () => {
  await assert.rejects(assertAttachable("Documents/Angebot.pdf", [docs], home), /absolute/);
});

test("missing file keeps the not found error", async () => {
  await assert.rejects(assertAttachable(join(docs, "nope.pdf"), [docs], home), /not found/);
});

test("error names the path, the allowed directories and the variable", async () => {
  const target = join(outside, "report.csv");
  await assert.rejects(assertAttachable(target, [docs], home), (err) => {
    assert.ok(err.message.includes(target));
    assert.ok(err.message.includes(docs));
    assert.ok(err.message.includes("PROTON_MCP_ATTACHMENT_ROOTS"));
    return true;
  });
});

test("wildcard disables the root check but not hidden or file-type checks", async () => {
  assert.ok(await assertAttachable(join(outside, "report.csv"), "*", home));
  await assert.rejects(assertAttachable(join(docs, ".env"), "*", home), /refused/);
  await assert.rejects(assertAttachable(outside, "*", home), /refused/);
});

test("an array entry '*' is a literal path, not a wildcard", async () => {
  await assert.rejects(assertAttachable(join(outside, "report.csv"), ["*", docs], home), /refused/);
});

test("non-existent and relative roots are ignored", async () => {
  await assert.rejects(assertAttachable(join(docs, "Angebot.pdf"), [join(base, "missing"), "docs"], home), /refused/);
  assert.ok(await assertAttachable(join(docs, "Angebot.pdf"), [join(base, "missing"), docs], home));
});

test("a root given via a symlinked path matches by real path", async () => {
  const alias = join(base, "alias");
  await symlink(docs, alias);
  assert.ok(await assertAttachable(join(alias, "Angebot.pdf"), [docs], home));
  assert.ok(await assertAttachable(join(docs, "Angebot.pdf"), [alias], home));
});

test("a sibling directory sharing the root's name prefix is not inside the root", async () => {
  const sibling = join(home, "Documents-evil");
  await mkdir(sibling, { recursive: true });
  await writeFile(join(sibling, "x.txt"), "x");
  await assert.rejects(assertAttachable(join(sibling, "x.txt"), [docs], home), /refused/);
});

test("fileAttachments rejects a refused path before anything else can happen", async () => {
  // Default roots do not include the temp dir, so this file is refused.
  await assert.rejects(fileAttachments([join(outside, "report.csv")]), /refused/);
  await assert.rejects(fileAttachments(["relative.txt"]), /absolute/);
});
