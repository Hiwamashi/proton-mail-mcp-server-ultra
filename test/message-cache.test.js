import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MessageCache } from "../src/message-cache.js";
import { loadMessage, NotFoundError } from "../src/connections.js";
import { messageCache } from "../src/message-cache.js";

function clock(start = 1000) {
  const c = { t: start, now: () => c.t };
  return c;
}

test("get returns what set stored", () => {
  const cache = new MessageCache({ maxBytes: 1000, ttlMs: 1000 });
  assert.equal(cache.set("INBOX", 1, 5, "a", 100), true);
  assert.equal(cache.get("INBOX", 1, 5), "a");
  assert.equal(cache.get("INBOX", 2, 5), undefined, "other UIDVALIDITY is a different key");
  assert.equal(cache.get("Archive", 1, 5), undefined);
});

test("evicts least recently used entries by bytes", () => {
  const cache = new MessageCache({ maxBytes: 1000, ttlMs: 1000 });
  cache.set("F", 1, 1, "a", 400);
  cache.set("F", 1, 2, "b", 400);
  cache.get("F", 1, 1); // a is now more recent than b
  cache.set("F", 1, 3, "c", 400);
  assert.equal(cache.get("F", 1, 2), undefined);
  assert.equal(cache.get("F", 1, 1), "a");
  assert.equal(cache.get("F", 1, 3), "c");
  assert.equal(cache.totalBytes, 800);
});

test("entries expire after the TTL", () => {
  const c = clock();
  const cache = new MessageCache({ maxBytes: 1000, ttlMs: 500, now: c.now });
  cache.set("F", 1, 1, "a", 10);
  c.t += 499;
  assert.equal(cache.get("F", 1, 1), "a");
  c.t += 1;
  assert.equal(cache.get("F", 1, 1), undefined);
  assert.equal(cache.totalBytes, 0);
});

test("entries larger than half the budget are not cached", () => {
  const cache = new MessageCache({ maxBytes: 1000, ttlMs: 1000 });
  assert.equal(cache.set("F", 1, 1, "big", 501), false);
  assert.equal(cache.get("F", 1, 1), undefined);
  assert.equal(cache.set("F", 1, 2, "ok", 500), true);
});

test("maxBytes 0 disables the cache", () => {
  const cache = new MessageCache({ maxBytes: 0, ttlMs: 1000 });
  assert.equal(cache.enabled, false);
  assert.equal(cache.set("F", 1, 1, "a", 1), false);
  assert.equal(cache.get("F", 1, 1), undefined);
});

test("invalidate drops all UIDVALIDITY variants of folder + uid only", () => {
  const cache = new MessageCache({ maxBytes: 1000, ttlMs: 1000 });
  cache.set("F", 1, 7, "a", 10);
  cache.set("F", 2, 7, "b", 10);
  cache.set("F", 1, 8, "c", 10);
  cache.set("G", 1, 7, "d", 10);
  cache.invalidate("F", 7);
  assert.equal(cache.get("F", 1, 7), undefined);
  assert.equal(cache.get("F", 2, 7), undefined);
  assert.equal(cache.get("F", 1, 8), "c");
  assert.equal(cache.get("G", 1, 7), "d");
  assert.equal(cache.totalBytes, 20);
});

test("clear empties the cache", () => {
  const cache = new MessageCache({ maxBytes: 1000, ttlMs: 1000 });
  cache.set("F", 1, 1, "a", 10);
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(cache.totalBytes, 0);
});

// loadMessage uses the shared singleton; give it explicit settings so the tests do not depend on the
// PROTON_MCP_CACHE_* environment (a cache size of 0 would disable it).
const savedCache = { maxBytes: messageCache.maxBytes, ttlMs: messageCache.ttlMs };
beforeEach(() => {
  messageCache.maxBytes = 1024 * 1024;
  messageCache.ttlMs = 60000;
  messageCache.clear();
});
afterEach(() => {
  messageCache.clear();
  Object.assign(messageCache, savedCache);
});

const SOURCE = Buffer.from(
  "From: a@example.com\r\nTo: b@example.com\r\nSubject: Hello\r\nContent-Type: text/plain\r\n\r\nBody text\r\n"
);

// Stub imapflow client: counts fetches and serves one message (uid 5).
function stubClient({ uidValidity = 1 } = {}) {
  const calls = { source: 0, flags: 0 };
  let flags = new Set(["\\Seen"]);
  const client = {
    mailbox: { uidValidity },
    calls,
    setFlags: (f) => (flags = new Set(f)),
    async fetchOne(seq, query) {
      if (seq !== "5") return false;
      if (query.source) {
        calls.source++;
        return { uid: 5, source: SOURCE, flags };
      }
      calls.flags++;
      return { uid: 5, flags };
    },
  };
  return client;
}

test("read_email + three get_attachment: source fetched once, flags every time", async () => {
  messageCache.clear();
  const client = stubClient();
  const first = await loadMessage(client, "INBOX", 5);
  assert.equal(first.parsed.subject, "Hello");
  for (let i = 0; i < 3; i++) {
    const hit = await loadMessage(client, "INBOX", 5);
    assert.equal(hit.parsed, first.parsed);
  }
  assert.equal(client.calls.source, 1);
  assert.equal(client.calls.flags, 3);
  messageCache.clear();
});

test("cache hits return fresh flags", async () => {
  messageCache.clear();
  const client = stubClient();
  const first = await loadMessage(client, "INBOX", 5);
  assert.deepEqual(first.flags, ["\\Seen"]);
  client.setFlags(["\\Draft", "\\Flagged"]);
  const hit = await loadMessage(client, "INBOX", 5);
  assert.deepEqual(hit.flags, ["\\Draft", "\\Flagged"]);
  messageCache.clear();
});

test("a different UIDVALIDITY misses the cache", async () => {
  messageCache.clear();
  const a = stubClient({ uidValidity: 1 });
  const b = stubClient({ uidValidity: 2 });
  await loadMessage(a, "INBOX", 5);
  await loadMessage(b, "INBOX", 5);
  assert.equal(b.calls.source, 1);
  messageCache.clear();
});

test("invalidate forces a new source fetch", async () => {
  messageCache.clear();
  const client = stubClient();
  await loadMessage(client, "INBOX", 5);
  messageCache.invalidate("INBOX", 5);
  await loadMessage(client, "INBOX", 5);
  assert.equal(client.calls.source, 2);
  messageCache.clear();
});

test("missing message throws NotFoundError with the usual text, on miss and on hit", async () => {
  messageCache.clear();
  const client = stubClient();
  await assert.rejects(() => loadMessage(client, "INBOX", 9), (err) => {
    assert.ok(err instanceof NotFoundError);
    assert.equal(err.message, 'No message with UID 9 in folder "INBOX". UIDs are per folder – check the folder name.');
    return true;
  });
  // Cached, then gone on the server: the flags fetch finds nothing and the entry is dropped.
  await loadMessage(client, "INBOX", 5);
  const orig = client.fetchOne;
  client.fetchOne = async (seq, query) => (query.source ? orig(seq, query) : false);
  await assert.rejects(() => loadMessage(client, "INBOX", 5), NotFoundError);
  assert.equal(messageCache.get("INBOX", 1, 5), undefined);
  messageCache.clear();
});
