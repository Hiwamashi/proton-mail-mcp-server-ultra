import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import { CONFIG } from "./config.js";
import { messageCache } from "./message-cache.js";

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

function isRetryableImapError(error) {
  const message = `${error?.message || error || ""}`;
  return /not connected|connection.*closed|socket.*closed|socket.*destroyed|timed out|ECONNRESET|EPIPE|User is authenticated but not connected/i.test(
    message
  );
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
      const client = createImapClient();
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

// Full path: download the whole source and parse it. A future partial-download path (large messages)
// plugs in at the strategy choice in loadMessage; it must return the same { parsed, flags } shape.
// skipImageLinks keeps cid: references intact, so re-saved drafts still match their inline parts.
async function loadFull(client, folder, uid) {
  const message = await client.fetchOne(`${uid}`, { source: true, uid: true, flags: true }, { uid: true });
  if (!message || !message.source) throw notFound(uid, folder);
  const parsed = await simpleParser(message.source, { skipImageLinks: true });
  return { parsed, flags: [...(message.flags || [])], bytes: message.source.length };
}

// Loads one message for every tool. The client must already have `folder` selected and locked.
// The parsed message comes from the cache when possible; flags are always fetched fresh, since they
// change without the content changing. imapflow fetches the source with BODY.PEEK, so reading does
// not set \Seen. Returns { parsed, flags } – `parsed` may be shared with the cache, do not mutate it.
export async function loadMessage(client, folder, uid) {
  const uidValidity = client.mailbox?.uidValidity;
  const cached = messageCache.get(folder, uidValidity, uid);
  if (cached) {
    const message = await client.fetchOne(`${uid}`, { flags: true, uid: true }, { uid: true });
    if (!message) {
      messageCache.invalidate(folder, uid);
      throw notFound(uid, folder);
    }
    return { parsed: cached.parsed, flags: [...(message.flags || [])] };
  }
  const { parsed, flags, bytes } = await loadFull(client, folder, uid);
  messageCache.set(folder, uidValidity, uid, { parsed }, bytes);
  return { parsed, flags };
}

let specialFolderCache = null;

// Resolves special-use folders (\Drafts, \Trash, \Sent, ...) to their actual paths.
export async function getSpecialFolder(client, specialUse, fallback) {
  if (!specialFolderCache) {
    const folders = await client.list();
    specialFolderCache = {};
    for (const folder of folders) {
      if (folder.specialUse && !specialFolderCache[folder.specialUse]) {
        specialFolderCache[folder.specialUse] = folder.path;
      }
    }
  }
  return specialFolderCache[specialUse] || fallback;
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
  const transport = createSmtpTransport();
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
