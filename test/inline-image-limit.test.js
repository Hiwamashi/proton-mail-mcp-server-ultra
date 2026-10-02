import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG } from "../src/config.js";
import { attachmentToContent } from "../src/attachments.js";

const image = (bytes, filename = "photo.png") => {
  const content = Buffer.alloc(bytes, 1);
  return { filename, contentType: "image/png", size: bytes, content };
};

async function withDir(fn) {
  const directory = await mkdtemp(join(tmpdir(), "proton-mcp-img-"));
  try {
    await fn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("default limit is 1 MiB", () => {
  assert.equal(CONFIG.maxInlineImageBytes, 1048576);
});

test("200 KB image is returned inline", async () => {
  await withDir(async (directory) => {
    const blocks = await attachmentToContent(image(200 * 1024), { uid: 1, index: 0, maxInlineImageBytes: 1048576, directory });
    assert.equal(blocks.length, 2);
    assert.equal(blocks[1].type, "image");
    assert.equal(blocks[1].mimeType, "image/png");
    assert.deepEqual(await readdir(directory), []);
  });
});

test("3 MB image is saved with an inline-limit message", async () => {
  await withDir(async (directory) => {
    const blocks = await attachmentToContent(image(3 * 1024 * 1024), { uid: 1, index: 0, maxInlineImageBytes: 1048576, directory });
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, "text");
    assert.match(blocks[0].text, /exceeds the inline limit of 1\.0 MB/);
    assert.ok(blocks[0].text.includes(join(directory, "photo.png")));
    assert.deepEqual(await readdir(directory), ["photo.png"]);
  });
});

test("image exactly at the limit stays inline", async () => {
  await withDir(async (directory) => {
    const blocks = await attachmentToContent(image(1000), { uid: 1, index: 0, maxInlineImageBytes: 1000, directory });
    assert.equal(blocks[1].type, "image");
  });
});

test("save: true still saves a small image", async () => {
  await withDir(async (directory) => {
    const blocks = await attachmentToContent(image(100), { uid: 1, index: 0, save: true, directory });
    assert.match(blocks[0].text, /Saved to:/);
    assert.deepEqual(await readdir(directory), ["photo.png"]);
  });
});
