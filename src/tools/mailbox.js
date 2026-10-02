import { z } from "zod";
import { withImapClient, withMailbox, loadMessage, loadAttachment, getSpecialFolder } from "../connections.js";
import { messageCache } from "../message-cache.js";
import { extractBody, stripQuoted, paginate, formatAddresses, describeAttachments, formatSize, formatDate } from "../content.js";
import { attachmentToContent } from "../attachments.js";
import { CONFIG, MODES } from "../config.js";
import {
  DRAFT_MODES,
  allowsMarkAsRead,
  allowsPermanentDelete,
  deleteEmailDescription,
  markAsReadDescription,
  readEmailDescription,
  MARK_AS_READ_REFUSAL,
  PERMANENT_DELETE_REFUSAL,
} from "../modes.js";
import { defineTool, text, summarize, SUMMARY_FETCH } from "./util.js";

const folderArg = (fallback = "INBOX") =>
  z.string().default(fallback).describe(`Folder path as returned by list_folders (default: ${fallback}). UIDs are only valid within their folder.`);

const WRITE = { idempotent: false };

function parseDate(value, name) {
  const date = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}/.test(value) || Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${name} date "${value}" – use YYYY-MM-DD.`);
  }
  return date;
}

// Searches with more matches than this are sorted by UID instead of date.
const MAX_SORT_CANDIDATES = 3000;

export function renderEmail({ uid, folder, parsed, flags, body, source, page, quotedRemoved }) {
  const attachments = describeAttachments(parsed.attachments);
  const lines = [
    `UID: ${uid} | Folder: ${folder} | Flags: ${flags.join(" ") || "-"}`,
    `From: ${formatAddresses(parsed.from)}`,
    `To: ${formatAddresses(parsed.to)}`,
  ];
  if (parsed.cc) lines.push(`Cc: ${formatAddresses(parsed.cc)}`);
  if (parsed.bcc) lines.push(`Bcc: ${formatAddresses(parsed.bcc)}`);
  const replyTo = formatAddresses(parsed.replyTo);
  if (replyTo && replyTo !== formatAddresses(parsed.from)) lines.push(`Reply-To: ${replyTo}`);
  lines.push(`Date: ${formatDate(parsed.date)}`, `Subject: ${parsed.subject || "(no subject)"}`);
  if (parsed.messageId) lines.push(`Message-ID: ${parsed.messageId}`);
  if (parsed.inReplyTo) lines.push(`In-Reply-To: ${parsed.inReplyTo}`);

  if (attachments.length) {
    lines.push("Attachments (use get_attachment with the index):");
    for (const a of attachments) {
      const tags = [a.contentType, formatSize(a.size), a.inline ? "inline" : null, a.signature ? "signature" : null].filter(Boolean);
      lines.push(`  [${a.index}] ${a.filename} (${tags.join(", ")})`);
    }
  }

  const bodyInfo = page.total
    ? `chars ${page.start}–${page.end} of ${page.total}, source: ${source}${quotedRemoved ? ", quoted history removed" : ""}`
    : `empty (source: ${source})`;
  const more = page.nextOffset !== null ? ` – call read_email again with offset=${page.nextOffset} for the rest` : "";
  lines.push(`Body: ${bodyInfo}${more}`, "---", body);
  return lines.join("\n");
}

export function registerMailboxTools(server, { mode = CONFIG.mode } = {}) {
  const define = (name, config, handler) => defineTool(server, name, config, handler, mode);

  define(
    "list_folders",
    {
      modes: MODES,
      description: "List all mailbox folders with their special use (\\Inbox, \\Sent, \\Drafts, \\Trash, ...) and message counts.",
      inputSchema: {},
    },
    async () =>
      withImapClient(async (client) => {
        const folders = await client.list({ statusQuery: { messages: true, unseen: true } });
        return text(
          folders.map((f) => ({
            path: f.path,
            specialUse: f.specialUse || null,
            messages: f.status?.messages ?? null,
            unread: f.status?.unseen ?? null,
          }))
        );
      })
  );

  define(
    "list_emails",
    {
      modes: MODES,
      description:
        "List the newest emails in a folder, newest first. Returns UID, date, from, to, subject, read/flag state and whether there are attachments. Use offset to page further back.",
      inputSchema: {
        folder: folderArg(),
        limit: z.number().int().min(1).max(100).default(20).describe("Number of emails (default 20, max 100)"),
        offset: z.number().int().min(0).default(0).describe("Skip this many of the newest emails (for paging)"),
      },
    },
    async ({ folder, limit, offset }) =>
      withMailbox(folder, async (client) => {
        const total = client.mailbox.exists || 0;
        const end = total - offset;
        if (end < 1) return text({ folder, total, showing: 0, messages: [] });
        const start = Math.max(1, end - limit + 1);
        const messages = [];
        for await (const msg of client.fetch(`${start}:${end}`, SUMMARY_FETCH)) messages.push(summarize(msg));
        messages.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        const nextOffset = start > 1 ? offset + messages.length : null;
        return text({ folder, total, offset, showing: messages.length, nextOffset, messages });
      })
  );

  define(
    "search_emails",
    {
      modes: MODES,
      description:
        "Search a folder; results are sorted newest first. All criteria are combined with AND. Tip: search folder \"All Mail\" to search everything at once.",
      inputSchema: {
        folder: folderArg(),
        from: z.string().optional().describe("Sender address or name contains"),
        to: z.string().optional().describe("Recipient address or name contains"),
        subject: z.string().optional().describe("Subject contains"),
        body: z.string().optional().describe("Body contains"),
        text: z.string().optional().describe("Headers or body contain (broadest search)"),
        since: z.string().optional().describe("On or after this date (YYYY-MM-DD)"),
        before: z.string().optional().describe("Before this date (YYYY-MM-DD)"),
        unseen: z.boolean().optional().describe("Only unread emails"),
        flagged: z.boolean().optional().describe("Only flagged/starred emails"),
        limit: z.number().int().min(1).max(100).default(20).describe("Max results (default 20, max 100)"),
        offset: z.number().int().min(0).default(0).describe("Skip this many results (for paging)"),
      },
    },
    async ({ folder, from, to, subject, body, text: anyText, since, before, unseen, flagged, limit, offset }) =>
      withMailbox(folder, async (client) => {
        const criteria = {};
        if (from) criteria.from = from;
        if (to) criteria.to = to;
        if (subject) criteria.subject = subject;
        if (body) criteria.body = body;
        if (anyText) criteria.text = anyText;
        if (since) criteria.since = parseDate(since, "since");
        if (before) criteria.before = parseDate(before, "before");
        if (unseen) criteria.seen = false;
        if (flagged) criteria.flagged = true;
        if (Object.keys(criteria).length === 0) criteria.all = true;

        const uids = (await client.search(criteria, { uid: true })) || [];
        if (uids.length === 0) return text(`No emails in "${folder}" matched the search criteria.`);

        // UIDs are not chronological (especially in "All Mail"), so sort by internal date first.
        const candidates = uids.length > MAX_SORT_CANDIDATES ? uids.slice(-MAX_SORT_CANDIDATES) : uids;
        const dated = [];
        for await (const msg of client.fetch(candidates.join(","), { uid: true, internalDate: true }, { uid: true })) {
          dated.push({ uid: msg.uid, time: msg.internalDate ? new Date(msg.internalDate).getTime() : 0 });
        }
        dated.sort((a, b) => b.time - a.time);
        const pageUids = dated.slice(offset, offset + limit).map((d) => d.uid);
        if (pageUids.length === 0) return text({ folder, totalMatches: uids.length, offset, showing: 0, messages: [] });

        const byUid = new Map();
        for await (const msg of client.fetch(pageUids.join(","), SUMMARY_FETCH, { uid: true })) byUid.set(msg.uid, summarize(msg));
        const messages = pageUids.map((uid) => byUid.get(uid)).filter(Boolean);
        const nextOffset = offset + messages.length < dated.length ? offset + messages.length : null;
        return text({
          folder,
          totalMatches: uids.length,
          ...(uids.length > MAX_SORT_CANDIDATES ? { note: `Only the ${MAX_SORT_CANDIDATES} highest UIDs were sorted – narrow the search.` } : {}),
          offset,
          showing: messages.length,
          nextOffset,
          messages,
        });
      })
  );

  define(
    "read_email",
    {
      modes: MODES,
      description: readEmailDescription(mode),
      inputSchema: {
        uid: z.number().int().describe("UID of the email"),
        folder: folderArg(),
        format: z
          .enum(["auto", "text", "html", "raw_html"])
          .default("auto")
          .describe("auto: text part, HTML fallback (default). text: text part only. html: HTML converted to text. raw_html: original HTML source."),
        includeLinks: z.boolean().default(false).describe("Show link URLs inline as <url> (default false, keeps output compact)"),
        stripQuoted: z.boolean().default(false).describe("Remove the quoted reply history below the new content"),
        offset: z.number().int().min(0).default(0).describe("Start position in the body (for paging long emails)"),
        maxChars: z.number().int().min(500).max(100000).default(20000).describe("Max body characters to return (default 20000)"),
        markAsRead: z.boolean().default(false).describe(markAsReadDescription(mode)),
      },
    },
    async ({ uid, folder, format, includeLinks, stripQuoted: strip, offset, maxChars, markAsRead }) => {
      // Decided before the mailbox is touched.
      if (markAsRead && !allowsMarkAsRead(mode)) throw new Error(MARK_AS_READ_REFUSAL);
      return withMailbox(folder, async (client) => {
        const { parsed, flags } = await loadMessage(client, folder, uid, { allowPartial: true });
        let { body, source } = extractBody(parsed, { format, includeLinks });
        let quotedRemoved = false;
        if (strip && format !== "raw_html") ({ text: body, removed: quotedRemoved } = stripQuoted(body));
        const page = paginate(body, offset, maxChars);
        if (markAsRead && !flags.includes("\\Seen")) {
          await client.messageFlagsAdd(`${uid}`, ["\\Seen"], { uid: true });
          flags.push("\\Seen");
        }
        return text(renderEmail({ uid, folder, parsed, flags, body: page.chunk, source, page, quotedRemoved }));
      });
    }
  );

  define(
    "get_attachment",
    {
      modes: MODES,
      description:
        "Open an attachment of an email by its index from read_email. PDFs and text files are returned as text, images are shown directly, attached emails are rendered. Other files (Office documents, archives, ...) are saved to the local attachment folder and the path is returned.",
      inputSchema: {
        uid: z.number().int().describe("UID of the email"),
        folder: folderArg(),
        index: z.number().int().min(0).describe("Attachment index as listed by read_email"),
        save: z.boolean().default(false).describe("Save the file to the local attachment folder instead of showing it"),
        offset: z.number().int().min(0).default(0).describe("Start position for long text content"),
        maxChars: z.number().int().min(500).max(100000).default(20000).describe("Max characters of text content (default 20000)"),
      },
    },
    async ({ uid, folder, index, save, offset, maxChars }) => {
      // The part is downloaded while the folder is locked; converting it needs no connection.
      const attachment = await withMailbox(folder, async (client) => {
        const loaded = await loadMessage(client, folder, uid, { allowPartial: true });
        const found = await loadAttachment(client, uid, loaded, index);
        if (!found) {
          const count = loaded.parsed.attachments?.length || 0;
          throw new Error(`Email UID ${uid} has ${count} attachment(s); index ${index} does not exist.`);
        }
        return found;
      });
      return { content: await attachmentToContent(attachment, { uid, index, offset, maxChars, save }) };
    }
  );

  define(
    "move_email",
    {
      modes: DRAFT_MODES,
      description: "Move an email to another folder (e.g. Archive, Spam, Folders/MyFolder).",
      inputSchema: {
        uid: z.number().int().describe("UID of the email"),
        sourceFolder: folderArg(),
        destinationFolder: z.string().describe("Target folder path as returned by list_folders"),
      },
    },
    async ({ uid, sourceFolder, destinationFolder }) =>
      withMailbox(sourceFolder, async (client) => {
        const result = await client.messageMove(`${uid}`, destinationFolder, { uid: true });
        if (!result) throw new Error(`Could not move UID ${uid} from "${sourceFolder}" – does it exist there?`);
        messageCache.invalidate(sourceFolder, uid);
        const newUid = result.uidMap?.get?.(uid) ?? null;
        return text({ success: true, uid, from: sourceFolder, to: destinationFolder, newUid });
      }, WRITE)
  );

  define(
    "mark_email",
    {
      modes: DRAFT_MODES,
      description: "Mark an email as read/unread or flagged/unflagged (flagged = starred in Proton).",
      inputSchema: {
        uid: z.number().int().describe("UID of the email"),
        folder: folderArg(),
        action: z.enum(["read", "unread", "flag", "unflag"]).describe("Action to perform"),
      },
    },
    async ({ uid, folder, action }) =>
      withMailbox(folder, async (client) => {
        const flag = action === "read" || action === "unread" ? "\\Seen" : "\\Flagged";
        if (action === "read" || action === "flag") await client.messageFlagsAdd(`${uid}`, [flag], { uid: true });
        else await client.messageFlagsRemove(`${uid}`, [flag], { uid: true });
        return text({ success: true, uid, action });
      })
  );

  define(
    "delete_email",
    {
      modes: DRAFT_MODES,
      description: deleteEmailDescription(mode),
      inputSchema: {
        uid: z.number().int().describe("UID of the email"),
        folder: folderArg(),
      },
    },
    async ({ uid, folder }) =>
      withImapClient(async (client) => {
        const trash = await getSpecialFolder(client, "\\Trash", "Trash");
        const lock = await client.getMailboxLock(folder);
        try {
          if (folder.toLowerCase() === trash.toLowerCase()) {
            // Refused before messageDelete so the message stays untouched.
            if (!allowsPermanentDelete(mode)) throw new Error(PERMANENT_DELETE_REFUSAL);
            await client.messageDelete(`${uid}`, { uid: true });
            messageCache.invalidate(folder, uid);
            return text({ success: true, uid, deletedPermanently: true });
          }
          const result = await client.messageMove(`${uid}`, trash, { uid: true });
          if (!result) throw new Error(`Could not move UID ${uid} from "${folder}" to Trash – does it exist there?`);
          messageCache.invalidate(folder, uid);
          return text({ success: true, uid, movedTo: trash });
        } finally {
          lock.release();
        }
      }, WRITE)
  );
}
