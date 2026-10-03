// Test double for an imapflow client with several folders and messages. Implements the subset the
// thread and search code uses: list, getMailboxLock, search (with an evaluator for the criteria
// objects imapflow accepts), fetch and fetchOne. Every search records its criteria in `calls.search`.
//
// A message is described by { uid, messageId, inReplyTo, references, date, subject, from, to, cc,
// flags, size, attachment: "attachment" | "inline" | undefined, body }.

function headerBlock(m) {
  return [
    m.messageId ? `Message-ID: ${m.messageId}` : null,
    m.inReplyTo ? `In-Reply-To: ${m.inReplyTo}` : null,
    m.references ? `References: ${m.references}` : null,
  ]
    .filter(Boolean)
    .join("\r\n");
}

function source(m) {
  const head = [
    `From: ${m.from || "sender@example.com"}`,
    `To: ${m.to || "me@example.com"}`,
    m.cc ? `Cc: ${m.cc}` : null,
    `Subject: ${m.subject || "Test"}`,
    `Date: ${new Date(m.date || 0).toUTCString()}`,
    headerBlock(m),
    "Content-Type: text/plain; charset=utf-8",
  ]
    .filter(Boolean)
    .join("\r\n");
  return Buffer.from(`${head}\r\n\r\n${m.body || ""}`);
}

function structure(m) {
  if (!m.attachment) return { type: "text/plain" };
  return {
    type: "multipart/mixed",
    childNodes: [{ type: "text/plain", part: "1" }, { type: "image/png", part: "2", disposition: m.attachment }],
  };
}

const contains = (value, needle) => (value || "").toLowerCase().includes(String(needle).toLowerCase());

function matches(m, criteria) {
  return Object.entries(criteria).every(([key, value]) => {
    switch (key) {
      case "all":
        return true;
      case "or":
        return value.some((sub) => matches(m, sub));
      case "header":
        return Object.entries(value).every(([name, needle]) => {
          const field = { "message-id": m.messageId, references: m.references, "in-reply-to": m.inReplyTo }[name.toLowerCase()];
          return contains(field, needle);
        });
      case "from":
      case "to":
      case "cc":
      case "subject":
        return contains(m[key], value);
      case "body":
        return contains(m.body, value);
      case "larger":
        return (m.size ?? source(m).length) > value;
      case "smaller":
        return (m.size ?? source(m).length) < value;
      case "answered":
        return (m.flags || []).includes("\\Answered") === value;
      case "seen":
        return (m.flags || []).includes("\\Seen") === value;
      case "flagged":
        return (m.flags || []).includes("\\Flagged") === value;
      case "since":
        return new Date(m.date || 0) >= value;
      case "before":
        return new Date(m.date || 0) < value;
      default:
        throw new Error(`fake-mailbox: unsupported search key ${key}`);
    }
  });
}

function toFetched(m, query) {
  const out = { uid: m.uid, flags: new Set(m.flags || []) };
  if (query.envelope) {
    out.envelope = {
      date: new Date(m.date || 0),
      subject: m.subject || "Test",
      from: [{ address: m.from || "sender@example.com" }],
      to: [{ address: m.to || "me@example.com" }],
      messageId: m.messageId,
    };
  }
  if (query.internalDate) out.internalDate = new Date(m.date || 0);
  if (query.bodyStructure) out.bodyStructure = structure(m);
  if (query.size) out.size = m.size ?? source(m).length;
  if (query.headers) out.headers = Buffer.from(headerBlock(m) + "\r\n\r\n");
  if (query.source) out.source = source(m);
  return out;
}

// folders: { [path]: { specialUse?, messages: [...] } }
export function fakeMailbox(folders) {
  const calls = { search: [], fetch: [], locks: [], fetchedUids: [] };
  const client = {
    calls,
    mailbox: null,
    async list() {
      return Object.entries(folders).map(([path, f]) => ({ path, specialUse: f.specialUse, status: { messages: f.messages.length } }));
    },
    async getMailboxLock(path) {
      if (!folders[path]) throw new Error(`fake-mailbox: no folder ${path}`);
      calls.locks.push(path);
      client.mailbox = { path, exists: folders[path].messages.length, uidValidity: folders[path].uidValidity ?? 1 };
      return { release() {} };
    },
    current() {
      return folders[client.mailbox.path].messages;
    },
    async search(criteria) {
      calls.search.push({ folder: client.mailbox.path, criteria });
      return client.current().filter((m) => matches(m, criteria)).map((m) => m.uid);
    },
    async *fetch(range, query) {
      calls.fetch.push({ folder: client.mailbox.path, range, query });
      const uids = String(range).split(",").map(Number);
      calls.fetchedUids.push(...uids);
      for (const m of client.current()) if (uids.includes(m.uid)) yield toFetched(m, query);
    },
    async fetchOne(uid, query) {
      const m = client.current().find((x) => x.uid === Number(uid));
      return m ? toFetched(m, query) : false;
    },
  };
  return client;
}
