import { z } from "zod";
import { withImapClient, resetFolderCache } from "../connections.js";
import { CONFIG } from "../config.js";
import { DRAFT_MODES } from "../modes.js";
import { defineTool, text } from "./util.js";
import { resolveUids, existingUids, uidArg, uidsArg } from "./mailbox.js";
import { parseThreadHeaders } from "../thread.js";

// Proton Bridge shows labels as folders under "Labels/" and user folders under "Folders/".
// Verified against the Bridge (see the add-mailbox-write-tools design): UID COPY into a label folder
// applies the label and keeps the message where it is; STORE \Deleted + EXPUNGE in the label folder
// removes only the label. Message UIDs differ per folder, so removal looks the messages up there by
// Message-ID.

const LABEL_PREFIX = "Labels/";
const FOLDER_PREFIX = "Folders/";
const IDS_PER_SEARCH = 40;
const WRITE = { idempotent: false };

async function withLock(client, folder, operation) {
  const lock = await client.getMailboxLock(folder);
  try {
    return await operation();
  } finally {
    lock.release();
  }
}

// imapflow reports a failed COPY or EXPUNGE as `false` instead of throwing.
function assertDone(result, what) {
  if (!result) throw new Error(`The Bridge did not confirm the request to ${what}; nothing is reported as done. Check the label in Proton Mail.`);
}

function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function labelPath(label) {
  const name = (label || "").trim().replace(/^labels\//i, "");
  if (!name) throw new Error("The label name is empty.");
  return LABEL_PREFIX + name;
}

// Resolves the label against the existing label folders (exact, then case-insensitive). An unknown
// label fails with the list of existing ones. Some Bridge setups list system folders such as Sent or
// Trash under "Labels/" with a special-use flag; they are real folders, where an EXPUNGE deletes the
// message (in Trash permanently), so they are never treated as labels.
export async function resolveLabel(client, label) {
  const wanted = labelPath(label);
  const folders = (await client.list()).filter((f) => f.path.startsWith(LABEL_PREFIX));
  const system = folders.find((f) => f.specialUse && f.path.toLowerCase() === wanted.toLowerCase());
  if (system) throw new Error(`"${system.path}" is a system folder (${system.specialUse}), not a label. Use move_email or delete_email for it.`);
  const labels = folders.filter((f) => !f.specialUse).map((f) => f.path);
  const match = labels.find((p) => p === wanted) || labels.find((p) => p.toLowerCase() === wanted.toLowerCase());
  if (!match) {
    const names = labels.map((p) => p.slice(LABEL_PREFIX.length));
    throw new Error(
      `Label "${wanted.slice(LABEL_PREFIX.length)}" does not exist. Existing labels: ${names.length ? names.join(", ") : "(none)"}.`
    );
  }
  return match;
}

// Adds or removes a label on messages of `folder`. Adding a label a message already has, or removing
// one it does not have, changes nothing and still succeeds.
export async function labelMessages(client, folder, label, action, { list, bulk }) {
  const path = await resolveLabel(client, label);
  let withoutMessageId = [];
  let ambiguous = [];
  const sameFolder = folder.toLowerCase() === path.toLowerCase();

  const { processed, notFound, messageIds } = await withLock(client, folder, async () => {
    const found = await existingUids(client, folder, list);
    const joined = found.processed.join(",");
    if (sameFolder) {
      // Addressed in the label folder itself: adding is a no-op, removing is a direct expunge.
      if (action === "remove") assertDone(await client.messageDelete(joined, { uid: true }), "remove the label");
      return found;
    }
    if (action === "add") {
      assertDone(await client.messageCopy(joined, path, { uid: true }), "add the label");
      return found;
    }
    const messageIds = new Map();
    for await (const msg of client.fetch(joined, { uid: true, headers: ["message-id"] }, { uid: true })) {
      messageIds.set(msg.uid, parseThreadHeaders(msg.headers).messageId);
    }
    return { ...found, messageIds };
  });

  if (messageIds) {
    withoutMessageId = processed.filter((u) => !messageIds.get(u));
    // How many of the requested messages carry each Message-ID.
    const requested = new Map();
    for (const id of messageIds.values()) if (id) requested.set(id, (requested.get(id) || 0) + 1);
    if (requested.size) {
      await withLock(client, path, async () => {
        const hits = new Set();
        for (const ids of chunks([...requested.keys()], IDS_PER_SEARCH)) {
          const criteria = { or: ids.map((id) => ({ header: { "message-id": id } })) };
          for (const uid of (await client.search(criteria, { uid: true })) || []) hits.add(uid);
        }
        if (!hits.size) return; // none of them had the label
        // HEADER search matches substrings; only exact Message-ID matches count.
        const byId = new Map();
        for await (const msg of client.fetch([...hits].join(","), { uid: true, headers: ["message-id"] }, { uid: true })) {
          const id = parseThreadHeaders(msg.headers).messageId;
          if (requested.has(id)) byId.set(id, [...(byId.get(id) || []), msg.uid]);
        }
        // More labeled copies than requested messages (e.g. Proton's sent and received copy of a mail to
        // yourself): the copies cannot be told apart in the label folder, so they are left alone.
        const remove = [];
        for (const [id, uids] of byId) {
          if (uids.length > requested.get(id)) ambiguous.push(...processed.filter((u) => messageIds.get(u) === id));
          else remove.push(...uids);
        }
        if (remove.length) assertDone(await client.messageDelete(remove.join(","), { uid: true }), "remove the label");
      });
    }
  }

  const result = { success: true, label: path.slice(LABEL_PREFIX.length), action };
  if (!bulk) result.uid = list[0];
  result.processed = processed;
  result.notFound = notFound;
  const warnings = [];
  if (withoutMessageId.length) {
    result.withoutMessageId = withoutMessageId;
    warnings.push("Messages in withoutMessageId have no Message-ID, so the label could not be looked up and was not removed from them.");
  }
  if (ambiguous.length) {
    result.ambiguous = ambiguous;
    warnings.push("Messages in ambiguous share their Message-ID with other labeled copies that cannot be told apart, so the label was left on them; remove it in Proton Mail.");
  }
  if (warnings.length) result.warning = warnings.join(" ");
  return result;
}

// Creates Folders/<name> or Labels/<name>. Nested names with "/" are allowed for folders only.
export async function createFolder(client, name, type) {
  const prefix = type === "label" ? LABEL_PREFIX : FOLDER_PREFIX;
  const bare = (name || "").trim().replace(new RegExp(`^${prefix}`, "i"), "");
  const segments = bare.split("/");
  if (!bare || segments.some((s) => !s.trim())) throw new Error(`Invalid ${type} name "${name}".`);
  if (type === "label" && segments.length > 1) throw new Error(`Label names cannot contain "/"; nested names are only possible for folders.`);
  const path = prefix + segments.map((s) => s.trim()).join("/");
  const existing = (await client.list()).find((f) => f.path.toLowerCase() === path.toLowerCase());
  if (existing) throw new Error(`"${existing.path}" already exists.`);
  await client.mailboxCreate(path);
  resetFolderCache();
  return { success: true, path, type };
}

export function registerLabelTools(server, { mode = CONFIG.mode } = {}) {
  const define = (name, config, handler) => defineTool(server, name, config, handler, mode);

  define(
    "label_email",
    {
      modes: DRAFT_MODES,
      description:
        "Add or remove a Proton label on one email (uid) or several emails of the same folder (uids, up to 500). Labels can be combined; the emails stay in their folder. Labels are listed by list_folders under Labels/.",
      inputSchema: {
        uid: uidArg,
        uids: uidsArg,
        folder: z.string().default("INBOX").describe("Folder of the emails (default: INBOX). UIDs are only valid within their folder."),
        label: z.string().describe('Label name, with or without the "Labels/" prefix'),
        action: z.enum(["add", "remove"]).describe("add or remove the label"),
      },
    },
    async ({ uid, uids, folder, label, action }) => {
      const selection = resolveUids({ uid, uids });
      return withImapClient(async (client) => text(await labelMessages(client, folder, label, action, selection)), WRITE);
    }
  );

  define(
    "create_folder",
    {
      modes: DRAFT_MODES,
      description:
        'Create a folder (Folders/<name>, nested names with "/" allowed) or a label (Labels/<name>). Fails if it already exists. Renaming and deleting are not available.',
      inputSchema: {
        name: z.string().describe("Name of the new folder or label"),
        type: z.enum(["folder", "label"]).describe("folder or label"),
      },
    },
    async ({ name, type }) => withImapClient(async (client) => text(await createFolder(client, name, type)), WRITE)
  );
}
