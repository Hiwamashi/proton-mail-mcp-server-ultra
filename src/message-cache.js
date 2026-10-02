import { CONFIG } from "./config.js";

// Bounded in-memory cache of parsed messages: LRU by bytes plus a TTL. Never persisted to disk.
// IMAP message content is immutable for a given UIDVALIDITY + UID, so entries only go stale when
// the message is moved, deleted or replaced – write handlers call invalidate() for that.
// maxBytes <= 0 disables the cache.
export class MessageCache {
  constructor({ maxBytes, ttlMs, now = Date.now }) {
    this.maxBytes = maxBytes;
    this.ttlMs = ttlMs;
    this.now = now;
    this.entries = new Map(); // insertion order = LRU order (oldest first)
    this.totalBytes = 0;
  }

  static key(folder, uidValidity, uid) {
    return `${folder}|${uidValidity}|${uid}`;
  }

  get enabled() {
    return this.maxBytes > 0;
  }

  get size() {
    return this.entries.size;
  }

  get(folder, uidValidity, uid) {
    if (!this.enabled) return undefined;
    const key = MessageCache.key(folder, uidValidity, uid);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) {
      this.#remove(key);
      return undefined;
    }
    // Re-insert to mark as most recently used.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  // Returns true when the entry was stored. Entries above half the budget are not cached.
  set(folder, uidValidity, uid, value, bytes) {
    if (!this.enabled || !(bytes >= 0) || bytes > this.maxBytes / 2) return false;
    const key = MessageCache.key(folder, uidValidity, uid);
    this.#remove(key);
    this.#evictExpired();
    while (this.entries.size > 0 && this.totalBytes + bytes > this.maxBytes) {
      this.#remove(this.entries.keys().next().value);
    }
    const ttl = this.ttlMs > 0 ? this.ttlMs : 0;
    this.entries.set(key, { value, bytes, expires: this.now() + ttl, folder, uid: String(uid) });
    this.totalBytes += bytes;
    return true;
  }

  // Drops every entry for folder + uid, whatever the UIDVALIDITY was.
  invalidate(folder, uid) {
    const wanted = String(uid);
    for (const [key, entry] of this.entries) {
      if (entry.folder === folder && entry.uid === wanted) this.#remove(key);
    }
  }

  clear() {
    this.entries.clear();
    this.totalBytes = 0;
  }

  #remove(key) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.totalBytes -= entry.bytes;
  }

  #evictExpired() {
    const now = this.now();
    for (const [key, entry] of this.entries) if (entry.expires <= now) this.#remove(key);
  }
}

export const messageCache = new MessageCache({ maxBytes: CONFIG.cacheMaxBytes, ttlMs: CONFIG.cacheTtlMs });
