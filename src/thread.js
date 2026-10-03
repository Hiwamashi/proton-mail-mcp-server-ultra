import { NotFoundError, loadMessage } from "./connections.js";
import { extractBody, stripQuoted, paginate } from "./content.js";
import { summarize, SUMMARY_FETCH } from "./tools/util.js";

// Proton does not expose its conversation grouping over IMAP, so threads are rebuilt from the
// Message-ID, In-Reply-To and References headers with HEADER searches in "All Mail". Every search
// scans the whole folder (about 2 s on a large mailbox) no matter how many criteria it has, so each
// round sends the IDs found so far as one OR batch.

export const THREAD_LIMIT = 100;
export const THREAD_MAX_ROUNDS = 10;
const IDS_PER_SEARCH = 40;
// Folder membership is only looked up where it is cheap: large folders cost a full scan each.
const MEMBERSHIP_MAX_MESSAGES = 5000;
const MEMBERSHIP_SPECIAL_USES = new Set(["\\Inbox", "\\Sent", "\\Drafts", "\\Archive", "\\Trash", "\\Junk"]);
// A body shorter than this is not worth showing as a shortened fragment.
const MIN_SHORTENED_CHARS = 100;
const THREAD_HEADERS = ["message-id", "in-reply-to", "references"];

// "<a@b> <c@d>" → ["<a@b>", "<c@d>"]. IDs without angle brackets are wrapped.
export function parseMessageIds(value) {
  if (!value) return [];
  const bracketed = value.match(/<[^<>\s]+>/g);
  if (bracketed) return bracketed;
  return value
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((id) => `<${id}>`);
}

export function parseThreadHeaders(buffer) {
  const raw = (buffer ? buffer.toString("utf-8") : "").replace(/\r?\n[ \t]+/g, " ");
  const get = (name) => raw.match(new RegExp(`^${name}:[ \\t]*(.*)$`, "im"))?.[1].trim() || "";
  return {
    messageId: parseMessageIds(get("message-id"))[0] || null,
    inReplyTo: parseMessageIds(get("in-reply-to")),
    references: parseMessageIds(get("references")),
  };
}

function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// One OR batch: replies to every ID, plus the message itself for IDs in `byMessageId`.
function threadCriteria(ids, byMessageId) {
  return {
    or: ids.flatMap((id) => [
      ...(byMessageId.has(id) ? [{ header: { "message-id": id } }] : []),
      { header: { references: id } },
      { header: { "in-reply-to": id } },
    ]),
  };
}

async function withLock(client, folder, operation) {
  const lock = await client.getMailboxLock(folder);
  try {
    return await operation();
  } finally {
    lock.release();
  }
}

// Breadth-first collection in "All Mail". Round 1 searches the start message's own Message-ID and
// the IDs in its References/In-Reply-To (by Message-ID, to find the ancestors) and replies to all of
// them; later rounds search replies to the messages found in the round before. HEADER search matches
// substrings, so every hit is checked against its fetched headers. Stops when a round finds nothing
// new, after `maxRounds` rounds, or when more than `limit` messages would be needed.
export async function collectThread(client, start, { limit = THREAD_LIMIT, maxRounds = THREAD_MAX_ROUNDS } = {}) {
  const found = new Map();
  const byMessageId = new Map();
  const seenUids = new Set();
  const searched = new Set();
  const ancestors = new Set([start.messageId, ...start.references, ...start.inReplyTo]);
  let frontier = [...ancestors];
  let rounds = 0;
  let truncated = null;

  while (frontier.length) {
    if (rounds >= maxRounds) {
      truncated = "rounds";
      break;
    }
    rounds++;
    for (const id of frontier) searched.add(id);
    const hits = new Set();
    for (const ids of chunks(frontier, IDS_PER_SEARCH)) {
      for (const uid of (await client.search(threadCriteria(ids, ancestors), { uid: true })) || []) {
        if (!seenUids.has(uid)) hits.add(uid);
      }
    }
    const candidates = [];
    if (hits.size) {
      const uids = [...hits].sort((a, b) => a - b).join(",");
      for await (const msg of client.fetch(uids, { ...SUMMARY_FETCH, internalDate: true, headers: THREAD_HEADERS }, { uid: true })) {
        const headers = parseThreadHeaders(msg.headers);
        const related =
          (headers.messageId && searched.has(headers.messageId)) || [...headers.references, ...headers.inReplyTo].some((id) => searched.has(id));
        if (related) candidates.push({ msg, headers });
        else seenUids.add(msg.uid); // a loose substring hit; do not fetch it again in later rounds
      }
    }
    // When the limit cuts a round, keep the start message and its ancestors first, then the replies.
    const rank = ({ headers }) => (headers.messageId === start.messageId ? 0 : ancestors.has(headers.messageId) ? 1 : 2);
    candidates.sort((a, b) => rank(a) - rank(b) || a.msg.uid - b.msg.uid);
    const next = new Set();
    for (const { msg, headers } of candidates) {
      // Proton keeps some messages twice in "All Mail" with the same Message-ID; one entry lists the other copies.
      const copyOf = headers.messageId && byMessageId.get(headers.messageId);
      if (copyOf) {
        copyOf.duplicateUids.push(msg.uid);
        seenUids.add(msg.uid);
        continue;
      }
      if (found.size >= limit) {
        truncated = "limit";
        break;
      }
      const entry = { msg, headers, duplicateUids: [] };
      found.set(msg.uid, entry);
      seenUids.add(msg.uid);
      if (headers.messageId) byMessageId.set(headers.messageId, entry);
      if (headers.messageId && !searched.has(headers.messageId)) next.add(headers.messageId);
    }
    if (truncated) break;
    frontier = [...next];
  }
  return { found: [...found.values()], rounds, truncated };
}

// Distributes `maxChars` over the bodies, newest first, so the oldest are shortened or omitted
// first. `texts` is ordered newest first; `undefined` marks a body that was not loaded because the
// budget was already used up. Returns one { body, status } per entry, status full|shortened|omitted.
export function applyBodyBudget(texts, maxChars) {
  let remaining = maxChars;
  return texts.map((text) => {
    if (text === undefined || remaining < Math.min(MIN_SHORTENED_CHARS, text.length || 1)) {
      // Once a newer body is left out, every older one is too.
      remaining = 0;
      return { body: null, status: "omitted" };
    }
    if (text.length <= remaining) {
      remaining -= text.length;
      return { body: text, status: "full" };
    }
    const { chunk } = paginate(text, 0, remaining);
    remaining = 0;
    return { body: chunk, status: "shortened" };
  });
}

// Message-ID → folders, for the start folder and the special-use folders that are small enough.
async function folderMembership(client, folders, allMail, startFolder, messageIds) {
  const membership = new Map();
  const checked = [];
  const targets = folders.filter(
    (f) => f.path !== allMail && (f.path === startFolder || f.path.toUpperCase() === "INBOX" || MEMBERSHIP_SPECIAL_USES.has(f.specialUse))
  );
  for (const folder of targets) {
    const count = folder.status?.messages;
    if (!(count <= MEMBERSHIP_MAX_MESSAGES)) continue;
    checked.push(folder.path);
    if (count === 0) continue;
    await withLock(client, folder.path, async () => {
      const hits = new Set();
      for (const ids of chunks(messageIds, IDS_PER_SEARCH)) {
        const criteria = { or: ids.map((id) => ({ header: { "message-id": id } })) };
        for (const uid of (await client.search(criteria, { uid: true })) || []) hits.add(uid);
      }
      if (!hits.size) return;
      for await (const msg of client.fetch([...hits].join(","), { uid: true, headers: ["message-id"] }, { uid: true })) {
        const id = parseThreadHeaders(msg.headers).messageId;
        if (!id) continue;
        if (!membership.has(id)) membership.set(id, new Set());
        membership.get(id).add(folder.path);
      }
    });
  }
  return { membership, checked };
}

function messageTime(msg) {
  const date = msg.envelope?.date || msg.internalDate;
  const time = date ? new Date(date).getTime() : NaN;
  return Number.isNaN(time) ? 0 : time;
}

// Builds the get_thread result. Reads only (headers via BODY.PEEK, bodies via loadMessage), so no flag changes.
export async function getThread(client, { uid, folder = "INBOX", includeBodies = true, maxChars = 20000, limit, maxRounds }) {
  const folders = await client.list({ statusQuery: { messages: true } });
  const allMail = folders.find((f) => f.specialUse === "\\All")?.path || "All Mail";

  const startMsg = await withLock(client, folder, () =>
    client.fetchOne(`${uid}`, { ...SUMMARY_FETCH, internalDate: true, headers: THREAD_HEADERS }, { uid: true })
  );
  if (!startMsg) throw new NotFoundError(`No message with UID ${uid} in folder "${folder}". UIDs are per folder – check the folder name.`);
  const start = parseThreadHeaders(startMsg.headers);
  if (!start.messageId) {
    return {
      folder,
      count: 1,
      truncated: false,
      note: "The message has no Message-ID, so its conversation cannot be determined; only the message itself is returned.",
      messages: [{ ...summarize(startMsg), messageId: null, inReplyTo: start.inReplyTo[0] || null, folders: [folder], start: true }],
    };
  }

  const { found, entries, bodies } = await withLock(client, allMail, async () => {
    const collected = await collectThread(client, start, { limit, maxRounds });
    const entries = collected.found.sort((a, b) => messageTime(a.msg) - messageTime(b.msg) || a.msg.uid - b.msg.uid);
    let bodies = null;
    if (includeBodies) {
      // Newest first; stop loading once the budget is used up.
      const texts = [];
      let used = 0;
      for (const { msg } of [...entries].reverse()) {
        if (used >= maxChars) {
          texts.push(undefined);
          continue;
        }
        const { parsed } = await loadMessage(client, allMail, msg.uid, { allowPartial: true });
        const body = stripQuoted(extractBody(parsed).body).text;
        texts.push(body);
        used += body.length;
      }
      bodies = applyBodyBudget(texts, maxChars).reverse();
    }
    return { found: collected, entries, bodies };
  });

  const ids = entries.map((e) => e.headers.messageId).filter(Boolean);
  const { membership, checked } = await folderMembership(client, folders, allMail, folder, ids);

  let startMarked = false;
  const messages = entries.map(({ msg, headers, duplicateUids }, i) => {
    const entry = { ...summarize(msg), messageId: headers.messageId, inReplyTo: headers.inReplyTo[0] || null };
    if (duplicateUids.length) entry.duplicateUids = duplicateUids;
    const inFolders = new Set(membership.get(headers.messageId) || []);
    const isStart = !startMarked && headers.messageId === start.messageId;
    if (isStart) {
      startMarked = true;
      entry.start = true;
      inFolders.add(folder);
    }
    entry.folders = [...inFolders];
    if (bodies) {
      entry.bodyStatus = bodies[i].status;
      if (bodies[i].body !== null) entry.body = bodies[i].body;
    }
    return entry;
  });

  const result = {
    folder: allMail,
    startFolder: folder,
    startUid: uid,
    count: messages.length,
    truncated: Boolean(found.truncated),
  };
  if (found.truncated === "limit") result.note = `The conversation has more than ${limit ?? THREAD_LIMIT} messages; only the ones closest to the start message are returned.`;
  if (found.truncated === "rounds") result.note = `Stopped after ${maxRounds ?? THREAD_MAX_ROUNDS} search rounds; the conversation may continue.`;
  if (!startMarked) result.note = [result.note, "The start message itself was not found in All Mail."].filter(Boolean).join(" ");
  result.foldersChecked = checked;
  if (bodies) {
    result.bodies = {
      maxChars,
      quotedHistoryRemoved: true,
      shortened: messages.filter((m) => m.bodyStatus === "shortened").map((m) => m.uid),
      omitted: messages.filter((m) => m.bodyStatus === "omitted").map((m) => m.uid),
    };
  }
  result.messages = messages;
  return result;
}
