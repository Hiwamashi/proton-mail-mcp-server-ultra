import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import { CONFIG } from "./config.js";
import { messageCache } from "./message-cache.js";
import { loadPartially, downloadPart } from "./partial-fetch.js";

// The IMAP connection is reused across tool calls and closed after an idle period.
// A stale Bridge connection gets exactly one reconnect attempt – but only for operations that
// are safe to repeat. Writes (append, delete) must not run twice after a lost response.

let imapClient = null;
let imapClientPromise = null;
let imapIdleTimer = null;

function unrefTimer(timer) {
  if (timer && typeof timer.unref === "function") timer.unref();
}

function createImapClient() {
  const client = new ImapFlow({
    host: CONFIG.host,
    port: CONFIG.imapPort,
    secure: false,
    auth: { user: CONFIG.username, pass: CONFIG.password },
    tls: { rejectUnauthorized: false }, // Bridge uses a self-signed cert
    logger: false,
  });
  // An unhandled 'error' event would crash the process; 'close' handles cleanup.
  client.on("error", () => {});
  client.on("close", () => {
    if (imapClient === client) {
      imapClient = null;
      imapClientPromise = null;
    }
  });
  return client;
}

// Test seam: tests replace the client and transport factories with fakes, so the connection and
// retry logic runs without a Bridge. Production code never calls these setters.
let imapClientFactory = createImapClient;
let smtpTransportFactory = () => createSmtpTransport();

export function setImapClientFactory(factory) {
  resetImapClient();
  imapClientFactory = factory || createImapClient;
}

export function setSmtpTransportFactory(factory) {
  smtpTransportFactory = factory || (() => createSmtpTransport());
}

function isRetryableImapError(error) {
  const message = `${error?.message || error || ""}`;
  return /not connected|connection.*closed|socket.*closed|socket.*destroyed|timed out|ECONNRESET|EPIPE|User is authenticated but not connected/i.test(
    message
  );
}

// "Mailbox does not exist" from SELECT, APPEND and the like (imapflow sets serverResponseCode).
export function isMissingMailboxError(error) {
  if (error?.serverResponseCode === "NONEXISTENT") return true;
  return /mailbox (doesn't|does not) exist|no such (mailbox|folder)|unknown mailbox|mailbox not found/i.test(`${error?.responseText || ""} ${error?.message || ""}`);
}

function closeQuietly(client) {
  try {
    if (client.usable) {
      client.logout().catch(() => client.close());
    } else {
      client.close();
    }
  } catch {
    // already gone
  }
}

function scheduleImapDisconnect() {
  clearTimeout(imapIdleTimer);
  imapIdleTimer = null;
  if (!imapClient || !(CONFIG.imapIdleTimeoutMs > 0)) return;
  const client = imapClient;
  imapIdleTimer = setTimeout(() => {
    if (imapClient !== client) return;
    imapClient = null;
    imapClientPromise = null;
    closeQuietly(client);
  }, CONFIG.imapIdleTimeoutMs);
  unrefTimer(imapIdleTimer);
}

function resetImapClient(client = imapClient) {
  clearTimeout(imapIdleTimer);
  imapIdleTimer = null;
  if (client && imapClient === client) imapClient = null;
  imapClientPromise = null;
  if (client) closeQuietly(client);
}

async function getImapClient() {
  clearTimeout(imapIdleTimer);
  imapIdleTimer = null;
  if (imapClient?.usable) return imapClient;
  if (!imapClientPromise) {
    imapClientPromise = (async () => {
      const client = imapClientFactory();
      try {
        await client.connect();
        imapClient = client;
        return client;
      } finally {
        imapClientPromise = null;
      }
    })();
  }
  return await imapClientPromise;
}

// Set `idempotent: false` for operations that write; they are not retried after a connection error.
export async function withImapClient(operation, { idempotent = true } = {}) {
  const client = await getImapClient();
  try {
    const result = await operation(client);
    scheduleImapDisconnect();
    return result;
  } catch (error) {
    if (client.usable && isMissingMailboxError(error)) {
      // A resolved folder may have been renamed: forget the resolution. A read gets one more attempt
      // with freshly resolved folders; a write returns the error (it may have partly happened).
      resetFolderCache(client);
      if (!idempotent) {
        scheduleImapDisconnect();
        throw error;
      }
      try {
        const result = await operation(client);
        scheduleImapDisconnect();
        return result;
      } catch (retryError) {
        if (!client.usable || isRetryableImapError(retryError)) resetImapClient(client);
        else scheduleImapDisconnect();
        throw retryError;
      }
    }
    if (client.usable && !isRetryableImapError(error)) {
      scheduleImapDisconnect();
      throw error;
    }
    resetImapClient(client);
    if (!idempotent) throw error;
    const retryClient = await getImapClient();
    try {
      const result = await operation(retryClient);
      scheduleImapDisconnect();
      return result;
    } catch (retryError) {
      if (!retryClient.usable || isRetryableImapError(retryError)) {
        resetImapClient(retryClient);
      } else {
        scheduleImapDisconnect();
      }
      throw retryError;
    }
  }
}

// Runs `operation` with `folder` selected and locked.
export async function withMailbox(folder, operation, options) {
  return withImapClient(async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      return await operation(client);
    } finally {
      lock.release();
    }
  }, options);
}

export class NotFoundError extends Error {}

function notFound(uid, folder) {
  return new NotFoundError(`No message with UID ${uid} in folder "${folder}". UIDs are per folder – check the folder name.`);
}

// Full path: download the whole source and parse it.
// skipImageLinks keeps cid: references intact, so re-saved drafts still match their inline parts.
async function loadFull(client, folder, uid) {
  const message = await client.fetchOne(`${uid}`, { source: true, uid: true, flags: true }, { uid: true });
  if (!message || !message.source) throw notFound(uid, folder);
  const parsed = await simpleParser(message.source, { skipImageLinks: true });
  return { parsed, flags: [...(message.flags || [])], bytes: message.source.length };
}

// Part-wise path for messages above CONFIG.partialFetchBytes: only headers and body parts are
// downloaded. Returns null when the message is small or its structure is not safe to handle part by
// part – the caller then uses the full path. The attachments of the result have no content;
// `partial.parts[i]` is the IMAP part to download for attachment i (see loadAttachment).
async function loadPartial(client, folder, uid) {
  // The size comes first; BODYSTRUCTURE is only requested for messages above the threshold, so small
  // messages cost one cheap size fetch on top of the full path.
  const info = await client.fetchOne(`${uid}`, { uid: true, flags: true, size: true }, { uid: true });
  if (!info) throw notFound(uid, folder);
  if (!(info.size > CONFIG.partialFetchBytes)) return null;
  const structure = await client.fetchOne(`${uid}`, { uid: true, bodyStructure: true }, { uid: true });
  if (!structure) throw notFound(uid, folder);
  if (!structure.bodyStructure) return null;
  const loaded = await loadPartially(client, uid, structure.bodyStructure);
  return loaded && { ...loaded, flags: [...(info.flags || [])] };
}

// Loads one message for every tool. The client must already have `folder` selected and locked.
// The parsed message comes from the cache when possible; flags are always fetched fresh, since they
// change without the content changing. imapflow fetches the source with BODY.PEEK, so reading does
// not set \Seen. Returns { parsed, flags, partial } – `parsed` may be shared with the cache, do not mutate it.
//
// Only callers that merely read or display the message pass allowPartial: true (read_email,
// get_attachment). For large messages they get `partial` set and attachments without content;
// everything that rebuilds or re-sends a message (drafts, replies) takes the full path and never sees
// a partially loaded entry.
export async function loadMessage(client, folder, uid, { allowPartial = false } = {}) {
  const uidValidity = client.mailbox?.uidValidity;
  const cached = messageCache.get(folder, uidValidity, uid);
  if (cached && (allowPartial || !cached.partial)) {
    const message = await client.fetchOne(`${uid}`, { flags: true, uid: true }, { uid: true });
    if (!message) {
      messageCache.invalidate(folder, uid);
      throw notFound(uid, folder);
    }
    return { parsed: cached.parsed, flags: [...(message.flags || [])], partial: cached.partial };
  }
  const partial = allowPartial ? await loadPartial(client, folder, uid) : null;
  if (partial) {
    messageCache.set(folder, uidValidity, uid, { parsed: partial.parsed, partial: partial.partial }, partial.bytes);
    return { parsed: partial.parsed, flags: partial.flags, partial: partial.partial };
  }
  const { parsed, flags, bytes } = await loadFull(client, folder, uid);
  messageCache.set(folder, uidValidity, uid, { parsed }, bytes);
  return { parsed, flags };
}

// Returns attachment `index` of a message from loadMessage, with its content. For part-wise loaded
// messages only that one part is downloaded (not cached). Returns undefined for an unknown index.
// A zero-byte part needs no download. If the part cannot be downloaded on its own (the Bridge answers
// NIL or an unusable literal), the attachment is taken from the full message instead, like the full path does.
export async function loadAttachment(client, uid, loaded, index, folder) {
  const attachment = loaded.parsed.attachments?.[index];
  if (!attachment || !loaded.partial) return attachment;
  if (attachment.size === 0) return { ...attachment, content: Buffer.alloc(0), size: 0 };
  const content = await downloadPart(client, uid, loaded.partial.parts[index], loaded.partial.encodings[index]);
  if (content) return { ...attachment, content, size: content.length };
  const { parsed } = await loadFull(client, folder, uid);
  const fromFull = parsed.attachments?.[index];
  if (!fromFull) throw new Error(`Could not download attachment ${index} of UID ${uid}.`);
  return fromFull;
}

// Resolved special-use folders, per connection: a new connection starts empty, so a folder renamed in
// Proton Mail is picked up after a reconnect.
const folderCaches = new WeakMap();

// Forget the resolved special-use folders of a connection, e.g. after a folder was created or a
// resolved folder turned out not to exist.
export function resetFolderCache(client) {
  if (client) folderCaches.delete(client);
}

// Resolves special-use folders (\Drafts, \Trash, \Sent, ...) to their actual paths.
export async function getSpecialFolder(client, specialUse, fallback) {
  let cache = folderCaches.get(client);
  if (!cache) {
    cache = {};
    for (const folder of await client.list()) {
      if (folder.specialUse && !cache[folder.specialUse]) cache[folder.specialUse] = folder.path;
    }
    folderCaches.set(client, cache);
  }
  return cache[specialUse] || fallback;
}

function createSmtpTransport() {
  return nodemailer.createTransport({
    host: CONFIG.host,
    port: CONFIG.smtpPort,
    secure: CONFIG.smtpSecure,
    requireTLS: !CONFIG.smtpSecure,
    auth: { user: CONFIG.username, pass: CONFIG.password },
    tls: { rejectUnauthorized: false }, // Bridge uses a self-signed cert
  });
}

// Every send uses a fresh connection to the local Bridge and is never retried: nodemailer reports
// socket errors the same way before and after the message data, so a retry could send twice.
export async function sendMail(mailOptions) {
  const transport = smtpTransportFactory();
  try {
    return await transport.sendMail(mailOptions);
  } finally {
    transport.close();
  }
}

export async function shutdownConnections() {
  messageCache.clear();
  clearTimeout(imapIdleTimer);
  const client = imapClient;
  imapClient = null;
  imapClientPromise = null;
  if (client) {
    try {
      if (client.usable) await client.logout();
      else client.close();
    } catch {
      try {
        client.close();
      } catch {
        // already gone
      }
    }
  }
}
