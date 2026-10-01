import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import { CONFIG } from "./config.js";

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

// Fetches and parses one message. The client must already have the folder selected.
// imapflow fetches the source with BODY.PEEK, so reading does not set \Seen.
export async function fetchParsed(client, uid, folder) {
  const message = await client.fetchOne(`${uid}`, { source: true, uid: true, flags: true }, { uid: true });
  if (!message || !message.source) {
    throw new NotFoundError(`No message with UID ${uid} in folder "${folder}". UIDs are per folder – check the folder name.`);
  }
  // skipImageLinks keeps cid: references intact, so re-saved drafts still match their inline parts.
  const parsed = await simpleParser(message.source, { skipImageLinks: true });
  return { parsed, flags: [...(message.flags || [])], source: message.source };
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
