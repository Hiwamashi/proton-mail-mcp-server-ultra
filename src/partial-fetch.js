import { simpleParser } from "mailparser";

// Part-wise download of large messages: instead of the whole source, only the headers and the text
// and HTML body parts are fetched. Attachment parts are replaced by empty bodies, and mailparser
// parses the resulting skeleton – so headers, body text and the attachment list (order, filenames,
// types, inline/related flags) come from mailparser itself and cannot drift from the full path.
//
// The skeleton is only trusted after a cross-check: the attachments mailparser finds must be exactly
// the parts planned from BODYSTRUCTURE, in the same order. Anything the planner cannot classify
// with certainty, and any mismatch, returns null and the caller downloads the full message.

// Leaf types mailparser treats as body text (mail-parser.js: this.textTypes).
const BODY_TYPES = new Set(["text/plain", "text/html", "message/delivery-status"]);
const MULTIPART_TYPES = new Set([
  "multipart/mixed",
  "multipart/alternative",
  "multipart/related",
  "multipart/signed",
  "multipart/report",
  "multipart/parallel",
]);
// Encrypted payloads hide the real structure; imapflow decodes text/x-amp-html differently from mailparser.
const UNSUPPORTED_TYPES = new Set(["application/pkcs7-mime", "application/x-pkcs7-mime", "text/x-amp-html"]);
const IDENTITY_ENCODINGS = new Set(["", "7bit", "8bit", "binary"]);

// Mirrors mailparser's createNode(): a non-multipart leaf is an attachment unless it is a body type
// with an inline (or missing) disposition.
function isAttachmentLeaf(node) {
  let disposition = node.disposition;
  if (disposition && disposition !== "attachment" && disposition !== "inline") disposition = "attachment";
  if (!disposition) disposition = BODY_TYPES.has(node.type) ? "inline" : "attachment";
  return !BODY_TYPES.has(node.type) || disposition !== "inline";
}

// Walks imapflow's bodyStructure tree. Returns null when the structure is not safe to handle part by part:
// { attachments: [node, ...] in tree order, textParts: [part, ...], mimeParts: [part, ...] }
export function planPartialFetch(root) {
  if (!root || !MULTIPART_TYPES.has(root.type) || !Array.isArray(root.childNodes)) return null;
  const plan = { attachments: [], textParts: [], mimeParts: [] };

  const walk = (node) => {
    if (!node.part) return false;
    plan.mimeParts.push(node.part);
    if (node.type.startsWith("multipart/")) {
      if (!MULTIPART_TYPES.has(node.type) || !node.parameters?.boundary || !node.childNodes?.length) return false;
      return node.childNodes.every(walk);
    }
    if (UNSUPPORTED_TYPES.has(node.type)) return false;
    const encoding = node.encoding || "";
    // mailparser descends into an inline message/rfc822 instead of listing it as an attachment.
    if (node.type === "message/rfc822" && node.disposition === "inline" && IDENTITY_ENCODINGS.has(encoding)) return false;
    if (isAttachmentLeaf(node)) {
      // The decoded size must be derivable without the content: exact for identity encodings and base64.
      if (!IDENTITY_ENCODINGS.has(encoding) && encoding !== "base64") return false;
      plan.attachments.push(node);
    } else {
      plan.textParts.push(node.part);
    }
    return true;
  };

  if (!root.parameters?.boundary || !root.childNodes.length || !root.childNodes.every(walk)) return null;
  return plan;
}

function endsWithBlankLine(buffer) {
  return /\n\r?\n$/.test(buffer.subarray(Math.max(0, buffer.length - 4)).toString("latin1"));
}

// Re-assembles the message with the original headers and body parts, and empty attachment bodies.
function buildSkeleton(root, headers, mime, bodies, attachmentParts) {
  const chunks = [headers];
  const emitChildren = (node) => {
    const boundary = node.parameters.boundary;
    for (const child of node.childNodes) {
      chunks.push(Buffer.from(`--${boundary}\r\n`), mime.get(child.part));
      if (child.type.startsWith("multipart/")) emitChildren(child);
      else if (!attachmentParts.has(child.part)) chunks.push(bodies.get(child.part));
      chunks.push(Buffer.from("\r\n"));
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
  };
  emitChildren(root);
  return Buffer.concat(chunks);
}

// Decoded size of a base64 part from its encoded size S plus the first and last bytes of the encoded
// text: line length and newline style come from the head, the padding from the tail. Returns null when
// the head does not show the line length. Exact for any uniformly wrapped encoding (the last line may be short).
export function decodedBase64Size(encodedSize, head, tail) {
  if (encodedSize === 0) return 0;
  const tailText = tail.toString("latin1");
  const trailing = tailText.match(/[\r\n\t ]*$/)[0].length;
  const pad = Math.min(2, (tailText.slice(0, tailText.length - trailing).match(/=*$/) || [""])[0].length);
  const content = encodedSize - trailing;

  const headText = head.toString("latin1");
  const newline = headText.indexOf("\n");
  let lineLength;
  let newlineLength = 2;
  if (newline === -1) {
    if (encodedSize > head.length) return null; // first line longer than the probe
    lineLength = Infinity;
  } else {
    newlineLength = headText[newline - 1] === "\r" ? 2 : 1;
    lineLength = newline - (newlineLength - 1);
    if (lineLength <= 0) return null;
  }
  const lines = lineLength === Infinity ? 1 : Math.ceil((content + newlineLength) / (lineLength + newlineLength));
  const chars = content - newlineLength * (lines - 1);
  return Math.floor((chars * 3) / 4) - (chars % 4 === 0 ? pad : 0);
}

const PROBE_BYTES = 200;

async function readRange(client, uid, part, start, length) {
  const message = await client.fetchOne(`${uid}`, { uid: true, bodyParts: [{ key: part, start, maxLength: length }] }, { uid: true });
  // One range per request, so the only entry is ours whatever key the server's answer ended up under.
  const parts = message?.bodyParts;
  return parts?.get(String(part).toLowerCase()) ?? (parts ? [...parts.values()][0] : null) ?? null;
}

async function decodedSize(client, uid, node) {
  if ((node.encoding || "") !== "base64") return node.size ?? 0;
  const size = node.size ?? 0;
  if (size === 0) return 0;
  const head = await readRange(client, uid, node.part, 0, Math.min(size, PROBE_BYTES));
  const tail = await readRange(client, uid, node.part, Math.max(0, size - 8), Math.min(size, 8));
  if (!head || !tail) return null;
  return decodedBase64Size(size, head, tail);
}

// Loads one message part by part. `bodyStructure` is imapflow's parsed tree. Returns
// { parsed, partial: { parts }, bytes } or null when the full path must be used.
// `parsed.attachments[i]` has the metadata of the full path but `content: null`; `partial.parts[i]` is
// the IMAP part number to download for it.
export async function loadPartially(client, uid, bodyStructure) {
  const plan = planPartialFetch(bodyStructure);
  if (!plan) return null;

  const keys = [...plan.mimeParts.map((part) => `${part}.mime`), ...plan.textParts];
  const message = await client.fetchOne(`${uid}`, { uid: true, headers: true, bodyParts: keys }, { uid: true });
  if (!message?.headers || !message.bodyParts || message.binaryParts?.size) return null;

  const mime = new Map();
  const bodies = new Map();
  for (const part of plan.mimeParts) {
    const raw = message.bodyParts.get(`${part}.mime`);
    if (!raw || !endsWithBlankLine(raw)) return null;
    mime.set(part, raw);
  }
  for (const part of plan.textParts) {
    const raw = message.bodyParts.get(part);
    if (!raw) return null;
    bodies.set(part, raw);
  }
  if (!endsWithBlankLine(message.headers)) return null;

  const attachmentParts = new Set(plan.attachments.map((node) => node.part));
  const skeleton = buildSkeleton(bodyStructure, message.headers, mime, bodies, attachmentParts);

  let parsed;
  try {
    // Same options as the full path, so cid: references stay intact for re-saved drafts.
    parsed = await simpleParser(skeleton, { skipImageLinks: true });
  } catch {
    return null;
  }

  // The cross-check that keeps attachment indexes stable: same parts, same order.
  const found = parsed.attachments || [];
  if (found.length !== plan.attachments.length || found.some((a, i) => a.partId !== plan.attachments[i].part)) return null;

  for (let i = 0; i < found.length; i++) {
    const size = await decodedSize(client, uid, plan.attachments[i]);
    if (size === null) return null;
    found[i].size = size;
    found[i].content = null;
  }
  return { parsed, partial: { parts: plan.attachments.map((node) => node.part) }, bytes: skeleton.length };
}

// Downloads one part, decoded. Used by get_attachment for messages loaded part by part.
export async function downloadPart(client, uid, part) {
  const { content } = await client.download(`${uid}`, part, { uid: true, chunkSize: 1024 * 1024 });
  if (!content) return null;
  const chunks = [];
  for await (const chunk of content) chunks.push(chunk);
  return Buffer.concat(chunks);
}
