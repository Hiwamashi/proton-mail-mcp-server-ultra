import { Readable } from "node:stream";

// Test double for an imapflow client that serves one message (UID 5). The BODYSTRUCTURE tree is built
// here from the raw MIME, with its own small splitter and its own part numbering – deliberately
// independent of src/partial-fetch.js, so the numbering under test is checked against something else.

const CRLF = Buffer.from("\r\n\r\n");

function splitHeaderBody(buffer) {
  const at = buffer.indexOf(CRLF);
  if (at === -1) return { head: buffer, body: Buffer.alloc(0) };
  return { head: buffer.subarray(0, at + 4), body: buffer.subarray(at + 4) };
}

// "name=value" pairs and a leading value of a structured header, e.g. Content-Type.
function parseStructured(value = "") {
  const [first, ...rest] = value.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  const params = {};
  for (const piece of rest) {
    const m = piece.match(/^\s*([^=\s]+)\s*=\s*(?:"([^"]*)"|(.*?))\s*$/s);
    if (m) params[m[1].toLowerCase()] = m[2] ?? m[3];
  }
  return { value: first.trim().toLowerCase(), params };
}

function parseHeaders(head) {
  const headers = new Map();
  const unfolded = head.toString("latin1").replace(/\r\n[ \t]+/g, " ");
  for (const line of unfolded.split("\r\n")) {
    const colon = line.indexOf(":");
    if (colon > 0) headers.set(line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim());
  }
  return headers;
}

function splitParts(body, boundary) {
  const parts = [];
  const delimiter = Buffer.from(`--${boundary}`);
  let pos = body.indexOf(delimiter);
  while (pos !== -1) {
    const lineEnd = body.indexOf("\r\n", pos);
    if (body.subarray(pos + delimiter.length, pos + delimiter.length + 2).toString() === "--") break;
    const start = lineEnd + 2;
    const next = body.indexOf(Buffer.from(`\r\n--${boundary}`), start);
    parts.push(body.subarray(start, next === -1 ? body.length : next));
    pos = next === -1 ? -1 : next + 2;
  }
  return parts;
}

// Returns { node, raw } where `raw` maps part number -> { mime, body }.
export function describeMime(source) {
  const raw = new Map();
  const walk = (buffer, path) => {
    const { head, body } = splitHeaderBody(buffer);
    const headers = parseHeaders(head);
    const type = parseStructured(headers.get("content-type") || "text/plain");
    const disposition = headers.has("content-disposition") ? parseStructured(headers.get("content-disposition")) : null;
    const node = { type: type.value, parameters: type.params };
    if (path.length) node.part = path.join(".");
    if (type.value.startsWith("multipart/")) {
      node.childNodes = splitParts(body, type.params.boundary).map((child, i) => walk(child, [...path, i + 1]));
    } else {
      node.encoding = (headers.get("content-transfer-encoding") || "7bit").toLowerCase();
      node.size = body.length;
      if (headers.has("content-id")) node.id = headers.get("content-id");
      if (type.value === "message/rfc822") node.childNodes = [walk(body, path)];
    }
    if (disposition) {
      node.disposition = disposition.value;
      node.dispositionParameters = disposition.params;
    }
    if (path.length) raw.set(node.part, { mime: head, body });
    else raw.set("", { mime: head, body });
    return node;
  };
  const node = walk(source, []);
  return { node, raw };
}

export function fakeImap(source, { uidValidity = 1, flags = ["\\Seen"], editStructure } = {}) {
  const { node, raw } = describeMime(source);
  if (editStructure) editStructure(node);
  const calls = { source: 0, structure: 0, ranges: [], downloads: [] };
  const state = { flags: new Set(flags) };
  const toBuffer = (value) => Buffer.from(value);

  const client = {
    mailbox: { uidValidity },
    calls,
    state,
    async fetchOne(seq, query) {
      if (seq !== "5") return false;
      const response = { uid: 5, flags: state.flags };
      if (query.source) {
        calls.source++;
        response.source = source;
      }
      if (query.size) response.size = source.length;
      if (query.bodyStructure) {
        calls.structure++;
        response.bodyStructure = node;
      }
      if (query.headers) response.headers = raw.get("").mime;
      if (query.bodyParts) {
        response.bodyParts = new Map();
        for (const entry of query.bodyParts) {
          const key = (typeof entry === "string" ? entry : entry.key).toLowerCase();
          const isMime = key.endsWith(".mime");
          const piece = raw.get(isMime ? key.slice(0, -5) : key);
          let data = isMime ? piece.mime : piece.body;
          if (typeof entry === "object" && (entry.start || entry.maxLength)) {
            data = data.subarray(entry.start || 0, entry.maxLength ? (entry.start || 0) + entry.maxLength : undefined);
          }
          calls.ranges.push({ key, bytes: data.length, partial: typeof entry === "object" });
          response.bodyParts.set(key, toBuffer(data));
        }
      }
      return response;
    },
    async download(seq, part) {
      calls.downloads.push(part);
      const { body } = raw.get(String(part));
      const encoding = findNode(node, String(part))?.encoding;
      const decoded = encoding === "base64" ? Buffer.from(body.toString("latin1"), "base64") : body;
      return { meta: {}, content: Readable.from([decoded.subarray(0, 1000), decoded.subarray(1000)].filter((c) => c.length)) };
    },
  };
  return client;
}

function findNode(node, part) {
  if (node.part === part) return node;
  for (const child of node.childNodes || []) {
    if (node.type === "message/rfc822") continue;
    const found = findNode(child, part);
    if (found) return found;
  }
  return null;
}
