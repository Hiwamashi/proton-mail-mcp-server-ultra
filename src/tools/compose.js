import { z } from "zod";
import { access } from "node:fs/promises";
import { basename } from "node:path";
import { CONFIG } from "../config.js";
import { withImapClient, withMailbox, fetchParsed, getSpecialFolder, sendMail } from "../connections.js";
import { extractBody, addressObjects, formatAddress } from "../content.js";
import {
  replyRecipients,
  replySubject,
  referencesFor,
  quoteAttribution,
  quoteText,
  quoteHtml,
  textToHtml,
  buildRawMessage,
  splitAddresses,
} from "../compose.js";
import { FULL_ONLY, DRAFT_MODES, ALL_MODES, draftHint } from "../modes.js";
import { defineTool, text, summarize, SUMMARY_FETCH } from "./util.js";

const recipientsArg = (what) => z.string().optional().describe(`${what} recipients, comma-separated`);
const attachmentsArg = z
  .array(z.string())
  .optional()
  .describe("Absolute paths of local files to attach");

async function fileAttachments(paths = []) {
  const result = [];
  for (const path of paths) {
    try {
      await access(path);
    } catch {
      throw new Error(`Attachment file not found: ${path}`);
    }
    result.push({ filename: basename(path), path });
  }
  return result;
}

const SIGNATURE_TYPES = ["application/pkcs7-signature", "application/x-pkcs7-signature", "application/pgp-signature"];

// Attachments of a parsed message in the shape nodemailer expects, for re-sending or re-saving.
// `remove` holds indexes as numbered by read_email, so it is applied before anything else is filtered.
// Signatures are dropped because they no longer match the rebuilt message.
function carryAttachments(parsed, { remove = new Set(), dropInline = false } = {}) {
  return (parsed.attachments || [])
    .filter((a, index) => !remove.has(index))
    .filter((a) => !SIGNATURE_TYPES.includes(a.contentType))
    .filter((a) => !(dropInline && a.related))
    .map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
      cid: a.cid,
      contentDisposition: a.contentDisposition,
    }));
}

async function loadOriginal(uid, folder) {
  const { parsed } = await withMailbox(folder, (client) => fetchParsed(client, uid, folder));
  return parsed;
}

// Builds nodemailer options for a new message or a reply.
// For replies, unset To/Cc/Subject are derived from the original and its body is quoted.
async function composeOptions({ to, cc, bcc, subject, body, html, attachments, original, replyAll = false, quoteOriginal = true }) {
  const options = { from: CONFIG.from, text: body };
  if (html) options.html = html;

  if (original) {
    const derived = replyRecipients(original, { replyAll, selfAddresses: CONFIG.selfAddresses });
    options.to = to ?? derived.to;
    options.cc = cc ?? (derived.cc || undefined);
    options.subject = subject ?? replySubject(original.subject);
    options.inReplyTo = original.messageId;
    options.references = referencesFor(original);
    if (quoteOriginal) {
      const attribution = quoteAttribution(original);
      const { body: originalBody } = extractBody(original);
      options.text = `${body}\n\n${quoteText(originalBody, attribution)}`;
      if (html) options.html = `${html}<br><br>${quoteHtml(original.html || "", originalBody, attribution)}`;
    }
  } else {
    options.to = to;
    options.cc = cc;
    options.subject = subject;
  }
  if (bcc) options.bcc = bcc;
  const files = await fileAttachments(attachments);
  if (files.length) options.attachments = files;
  return options;
}

// Recipients are strings for user input and {name, address} arrays when taken from a parsed message.
function recipientList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(formatAddress);
  return splitAddresses(value);
}

function displayRecipients(value) {
  return recipientList(value).join(", ");
}

function recipientCount(options) {
  return [options.to, options.cc, options.bcc].flatMap(recipientList).length;
}

function referencesOf(parsed) {
  return Array.isArray(parsed.references) ? parsed.references.join(" ") : parsed.references;
}

async function appendDraft(client, options) {
  const drafts = await getSpecialFolder(client, "\\Drafts", "Drafts");
  const raw = await buildRawMessage(options, { keepBcc: true });
  const result = await client.append(drafts, raw, ["\\Draft", "\\Seen"]);
  let uid = result?.uid ?? null;
  if (!uid) {
    // Server without UIDPLUS: look the draft up by its Message-ID.
    const messageId = raw.toString("utf-8").match(/^Message-ID:\s*(<[^>]+>)/im)?.[1];
    if (messageId) {
      // Callers inside withDraftsFolder already hold the Drafts lock; taking it again would deadlock.
      const lock = client.mailbox?.path === drafts ? null : await client.getMailboxLock(drafts);
      try {
        const found = await client.search({ header: { "message-id": messageId } }, { uid: true });
        uid = found?.at(-1) ?? null;
      } finally {
        lock?.release();
      }
    }
  }
  return { folder: drafts, uid };
}

function draftSummary(options, draft, mode) {
  return {
    success: true,
    draftUid: draft.uid,
    folder: draft.folder,
    to: displayRecipients(options.to),
    cc: displayRecipients(options.cc),
    bcc: displayRecipients(options.bcc),
    subject: options.subject || "",
    inReplyTo: options.inReplyTo || null,
    attachments: (options.attachments || []).map((a) => a.filename),
    hint: draftHint(mode),
  };
}

async function withDraftsFolder(operation, options) {
  return withImapClient(async (client) => {
    const drafts = await getSpecialFolder(client, "\\Drafts", "Drafts");
    const lock = await client.getMailboxLock(drafts);
    try {
      return await operation(client, drafts);
    } finally {
      lock.release();
    }
  }, options);
}

const WRITE = { idempotent: false };

export function registerComposeTools(server, { mode = CONFIG.mode } = {}) {
  const define = (name, config, handler) => defineTool(server, name, config, handler, mode);

  define(
    "send_email",
    {
      modes: FULL_ONLY,
      description: "Compose and send a new email immediately. To let the user review it first, use create_draft instead.",
      inputSchema: {
        to: z.string().describe("Recipients, comma-separated"),
        subject: z.string().describe("Subject line"),
        body: z.string().describe("Plain text body"),
        html: z.string().optional().describe("Optional HTML version of the body"),
        cc: recipientsArg("CC"),
        bcc: recipientsArg("BCC"),
        attachments: attachmentsArg,
      },
    },
    async (args) => {
      const options = await composeOptions(args);
      const info = await sendMail(options);
      return text({ success: true, messageId: info.messageId, to: displayRecipients(options.to), subject: options.subject });
    }
  );

  define(
    "reply_to_email",
    {
      modes: FULL_ONLY,
      description:
        "Reply to an email and send immediately. Sets threading headers, honors Reply-To and quotes the original. To let the user review it first, use create_draft with replyToUid instead.",
      inputSchema: {
        uid: z.number().int().describe("UID of the email to reply to"),
        folder: z.string().default("INBOX").describe("Folder of the original email"),
        body: z.string().describe("Reply text (plain text, without the quote)"),
        html: z.string().optional().describe("Optional HTML version of the reply"),
        replyAll: z.boolean().default(false).describe("Reply to all recipients"),
        quoteOriginal: z.boolean().default(true).describe("Append the quoted original below the reply"),
        attachments: attachmentsArg,
      },
    },
    async ({ uid, folder, ...rest }) => {
      const original = await loadOriginal(uid, folder);
      const options = await composeOptions({ ...rest, original });
      if (!recipientCount(options)) throw new Error("Could not determine any recipient for the reply.");
      const info = await sendMail(options);
      return text({
        success: true,
        messageId: info.messageId,
        to: displayRecipients(options.to),
        cc: displayRecipients(options.cc),
        subject: options.subject,
      });
    }
  );

  define(
    "create_draft",
    {
      modes: DRAFT_MODES,
      description:
        "Save an email as a draft in Proton Mail's Drafts folder without sending it. For a reply draft pass replyToUid (and replyFolder): recipients, subject, threading and quote are filled in automatically; explicit to/cc/subject override them.",
      inputSchema: {
        to: z.string().optional().describe("Recipients, comma-separated (optional for reply drafts)"),
        subject: z.string().optional().describe("Subject line (optional for reply drafts)"),
        body: z.string().describe("Plain text body (for replies without the quote)"),
        html: z.string().optional().describe("Optional HTML version of the body"),
        cc: recipientsArg("CC"),
        bcc: recipientsArg("BCC"),
        attachments: attachmentsArg,
        replyToUid: z.number().int().optional().describe("UID of the email this draft replies to"),
        replyFolder: z.string().default("INBOX").describe("Folder of the email in replyToUid"),
        replyAll: z.boolean().default(false).describe("For reply drafts: include all original recipients"),
        quoteOriginal: z.boolean().default(true).describe("For reply drafts: append the quoted original"),
      },
    },
    async ({ replyToUid, replyFolder, ...rest }) => {
      const original = replyToUid !== undefined ? await loadOriginal(replyToUid, replyFolder) : null;
      const options = await composeOptions({ ...rest, original });
      const draft = await withImapClient((client) => appendDraft(client, options), WRITE);
      return text(draftSummary(options, draft, mode));
    }
  );

  define(
    "list_drafts",
    {
      modes: ALL_MODES,
      description: "List saved drafts, newest first.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).default(20).describe("Number of drafts (default 20)"),
      },
    },
    async ({ limit }) =>
      withDraftsFolder(async (client, drafts) => {
        const total = client.mailbox.exists || 0;
        if (total === 0) return text({ folder: drafts, total, drafts: [] });
        const messages = [];
        for await (const msg of client.fetch(`${Math.max(1, total - limit + 1)}:*`, SUMMARY_FETCH)) messages.push(summarize(msg));
        messages.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        return text({ folder: drafts, total, drafts: messages });
      })
  );

  define(
    "update_draft",
    {
      modes: DRAFT_MODES,
      description:
        "Change a saved draft. Only the given fields are replaced; recipients, subject, threading headers and attachments that are not given stay as they are. A new body replaces the whole text including any quote, and the HTML version is regenerated from it as plain formatting unless html is given. The draft gets a new UID, which is returned. Read the draft with read_email (folder Drafts) first if you need its current text.",
      inputSchema: {
        uid: z.number().int().describe("UID of the draft in the Drafts folder"),
        to: z.string().optional().describe("New recipients, comma-separated"),
        cc: z.string().optional().describe("New CC recipients (empty string removes them)"),
        bcc: z.string().optional().describe("New BCC recipients (empty string removes them)"),
        subject: z.string().optional().describe("New subject"),
        body: z.string().optional().describe("New complete plain text body (replaces the old body including any quote)"),
        html: z.string().optional().describe("New complete HTML body (empty string removes the HTML part)"),
        addAttachments: attachmentsArg,
        removeAttachments: z.array(z.number().int()).optional().describe("Indexes of existing attachments to remove (as listed by read_email)"),
      },
    },
    async ({ uid, to, cc, bcc, subject, body, html, addAttachments, removeAttachments }) => {
      const { parsed } = await withDraftsFolder((client, drafts) => fetchParsed(client, uid, drafts));
      const newAttachments = await fileAttachments(addAttachments);

      // A new body without new HTML: the HTML part is regenerated from the text, so its inline
      // images (only referenced by the old HTML) are dropped as well.
      let newHtml = html;
      if (newHtml === undefined) newHtml = body !== undefined ? (parsed.html ? textToHtml(body) : undefined) : parsed.html || undefined;
      const htmlReplaced = html !== undefined || body !== undefined;

      const options = {
        from: CONFIG.from,
        to: to ?? addressObjects(parsed.to),
        cc: cc ?? addressObjects(parsed.cc),
        bcc: bcc ?? addressObjects(parsed.bcc),
        subject: subject ?? parsed.subject,
        text: body ?? parsed.text ?? "",
        inReplyTo: parsed.inReplyTo,
        references: referencesOf(parsed),
        attachments: [
          ...carryAttachments(parsed, { remove: new Set(removeAttachments || []), dropInline: htmlReplaced }),
          ...newAttachments,
        ],
      };
      if (newHtml) options.html = newHtml;
      for (const key of ["to", "cc", "bcc"]) if (!options[key]) delete options[key];

      // Append first, then delete: if anything fails in between, the old draft still exists.
      const draft = await withImapClient((client) => appendDraft(client, options), WRITE);
      let warning;
      try {
        await withDraftsFolder((client) => client.messageDelete(`${uid}`, { uid: true }), WRITE);
      } catch (error) {
        warning = `New draft saved, but the old draft UID ${uid} could not be deleted (${error.message}). Delete it with delete_draft.`;
      }
      return text({ ...draftSummary(options, draft, mode), replacedUid: uid, ...(warning ? { warning } : {}) });
    }
  );

  define(
    "send_draft",
    {
      modes: FULL_ONLY,
      description: "Send a saved draft and remove it from Drafts. Proton stores the sent message in Sent.",
      inputSchema: {
        uid: z.number().int().describe("UID of the draft in the Drafts folder"),
      },
    },
    async ({ uid }) => {
      const { parsed } = await withDraftsFolder((client, drafts) => fetchParsed(client, uid, drafts));
      const options = {
        from: CONFIG.from,
        to: addressObjects(parsed.to),
        cc: addressObjects(parsed.cc),
        bcc: addressObjects(parsed.bcc),
        subject: parsed.subject || "",
        text: parsed.text || "",
        inReplyTo: parsed.inReplyTo,
        references: referencesOf(parsed),
        attachments: carryAttachments(parsed),
      };
      if (parsed.html) options.html = parsed.html;
      if (!recipientCount(options)) throw new Error(`Draft UID ${uid} has no recipients – add them with update_draft first.`);

      const info = await sendMail(options);
      const result = {
        success: true,
        messageId: info.messageId,
        to: displayRecipients(options.to),
        cc: displayRecipients(options.cc),
        bcc: displayRecipients(options.bcc),
        subject: options.subject,
      };
      // The mail is out at this point; a failing cleanup must not be reported as a failed send.
      try {
        await withDraftsFolder((client) => client.messageDelete(`${uid}`, { uid: true }), WRITE);
      } catch (error) {
        result.warning = `Sent, but the draft UID ${uid} could not be removed (${error.message}). Do not send it again – delete it with delete_draft.`;
      }
      return text(result);
    }
  );

  define(
    "delete_draft",
    {
      modes: DRAFT_MODES,
      description: "Delete a saved draft permanently.",
      inputSchema: {
        uid: z.number().int().describe("UID of the draft in the Drafts folder"),
      },
    },
    async ({ uid }) =>
      withDraftsFolder(async (client, drafts) => {
        const { parsed } = await fetchParsed(client, uid, drafts);
        await client.messageDelete(`${uid}`, { uid: true });
        return text({ success: true, deletedUid: uid, subject: parsed.subject || "" });
      }, WRITE)
  );
}
