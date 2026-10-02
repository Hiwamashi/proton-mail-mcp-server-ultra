// Live comparison of the full and the part-wise load path against the running Proton Bridge.
// READ-ONLY: only SEARCH and FETCH (BODY.PEEK), no flag changes, moves, deletes or appends.
//
// Usage: node scripts/compare-partial.mjs [maxMessages=10]
// Settings come from src/config.js (credentials file / env). Picks up to N messages in the
// \All folder larger than PROTON_MCP_PARTIAL_FETCH_BYTES (fallback: the N largest messages), loads
// each once via the full path (whole source + mailparser) and once via loadPartially() from
// src/partial-fetch.js, and compares headers, body text/html and the attachment list.
//
// Privacy: prints only uid, size, counts, booleans, timings, field NAMES of mismatches and
// fallback reasons. Never subjects, addresses, names, bodies or filenames.
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { createHash } from "node:crypto";
import { CONFIG, assertCredentials } from "../src/config.js";
import { loadPartially, planPartialFetch, downloadPart } from "../src/partial-fetch.js";

assertCredentials();
const limit = Number(process.argv[2]) || 10;
const hash = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value ?? null)).digest("hex");

const client = new ImapFlow({
  host: CONFIG.host,
  port: CONFIG.imapPort,
  secure: false,
  auth: { user: CONFIG.username, pass: CONFIG.password },
  tls: { rejectUnauthorized: false },
  logger: false,
});
client.on("error", () => {});
await client.connect();

// Coarse reason why the part-wise path declined, from structure types only (no content).
function fallbackReason(root) {
  if (!root) return "no-bodystructure";
  const plan = planPartialFetch(root);
  if (!plan) {
    const types = new Set();
    const walk = (n) => { types.add(n.type); (n.childNodes || []).forEach(walk); };
    walk(root);
    if (!root.type.startsWith("multipart/")) return "planner:root-not-multipart";
    if ([...types].some((t) => /pkcs7|amp-html/.test(t))) return "planner:unsupported-type";
    return "planner:other(inline-rfc822/encoding/boundary/type)";
  }
  return "loadPartially:null(after plan ok: part fetch, skeleton, cross-check or size probe)";
}

const header = (name, v) => v ? `${name}:${hash(v)}` : name;
const attachmentFields = (a) => ({
  filename: a.filename, contentType: a.contentType, contentDisposition: a.contentDisposition,
  cid: a.cid, related: a.related, partId: a.partId, size: a.size, headerLines: a.headerLines?.length,
});

const lock = await client.getMailboxLock("All Mail").catch(async () => {
  const all = (await client.list()).find((m) => m.specialUse === "\\All");
  return client.getMailboxLock(all.path);
});
const rows = [];
let fallbacks = {};
let supported = { mime: false, header: false, range: false };
let zeroLengthAttachments = 0;
let sizeMismatchAttachments = 0;
try {
  let uids = await client.search({ larger: CONFIG.partialFetchBytes }, { uid: true });
  const sizes = new Map();
  const wanted = uids.length ? uids : await client.search({ all: true }, { uid: true });
  for await (const m of client.fetch(wanted, { uid: true, size: true }, { uid: true })) sizes.set(m.uid, m.size);
  const chosen = [...sizes].sort((a, b) => b[1] - a[1]).slice(0, limit);
  console.log(`threshold=${CONFIG.partialFetchBytes} candidatesAboveThreshold=${uids.length} chosen=${chosen.length}`);
  console.log("uid\tsize\tattachments\tpartialUsed\tattachmentsMatch\tbodyMatch\theadersMatch\tfullMs\tpartialMs\tfallbackReason/mismatchFields");

  for (const [uid, size] of chosen) {
    let t = Date.now();
    const full = await client.fetchOne(`${uid}`, { source: true, uid: true }, { uid: true });
    const parsedFull = await simpleParser(full.source, { skipImageLinks: true });
    const fullMs = Date.now() - t;

    t = Date.now();
    const info = await client.fetchOne(`${uid}`, { uid: true, size: true, bodyStructure: true }, { uid: true });
    const partial = info?.bodyStructure ? await loadPartially(client, uid, info.bodyStructure) : null;
    const partialMs = Date.now() - t;

    const row = { uid, size, attachments: parsedFull.attachments.length, partialUsed: !!partial, fullMs, partialMs };
    for (const a of parsedFull.attachments) if (a.size === 0) zeroLengthAttachments++;
    if (!partial) {
      const reason = fallbackReason(info?.bodyStructure);
      fallbacks[reason] = (fallbacks[reason] || 0) + 1;
      row.note = reason;
      rows.push(row);
      console.log([uid, size, row.attachments, false, "n/a", "n/a", "n/a", fullMs, partialMs, reason].join("\t"));
      continue;
    }
    supported = { mime: true, header: true, range: partial.partial.parts.length === 0 ? supported.range : true };
    const mism = [];
    const pa = partial.parsed.attachments, fa = parsedFull.attachments;
    let attachmentsMatch = pa.length === fa.length;
    for (let i = 0; attachmentsMatch && i < fa.length; i++) {
      const x = attachmentFields(fa[i]), y = attachmentFields(pa[i]);
      for (const k of Object.keys(x)) if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) { attachmentsMatch = false; mism.push(`attachment[${i}].${k}`); if (k === "size") sizeMismatchAttachments++; }
    }
    if (pa.length !== fa.length) mism.push("attachments.length");
    const bodyMatch = hash(parsedFull.text) === hash(partial.parsed.text) && hash(parsedFull.html || null) === hash(partial.parsed.html || null);
    if (!bodyMatch) mism.push("body(text/html)");
    const headersMatch = hash([parsedFull.subject, parsedFull.from?.text, parsedFull.to?.text, parsedFull.cc?.text, parsedFull.date?.toISOString?.(), parsedFull.messageId, parsedFull.inReplyTo])
      === hash([partial.parsed.subject, partial.parsed.from?.text, partial.parsed.to?.text, partial.parsed.cc?.text, partial.parsed.date?.toISOString?.(), partial.parsed.messageId, partial.parsed.inReplyTo]);
    if (!headersMatch) mism.push("headers");
    // Download-by-part must reproduce the full content (checked by hash, first attachment up to 3 only).
    let downloadMatch = "n/a";
    if (fa.length) {
      downloadMatch = true;
      for (let i = 0; i < Math.min(3, fa.length); i++) {
        const content = await downloadPart(client, uid, partial.partial.parts[i], partial.partial.encodings[i]);
        if (!content || hash(content.toString("base64")) !== hash(fa[i].content.toString("base64"))) { downloadMatch = false; mism.push(`download[${i}]`); }
      }
    }
    Object.assign(row, { attachmentsMatch, bodyMatch, headersMatch, downloadMatch, mism });
    rows.push(row);
    console.log([uid, size, fa.length, true, attachmentsMatch, bodyMatch, headersMatch, fullMs, partialMs, mism.join(",") || `downloadMatch=${downloadMatch}`].join("\t"));
  }
} finally {
  lock.release();
}
await client.logout();
console.log("fallbacks:", JSON.stringify(fallbacks));
console.log(`zeroLengthAttachments=${zeroLengthAttachments} attachmentSizeMismatches=${sizeMismatchAttachments} partialRows=${rows.filter((r) => r.partialUsed).length}/${rows.length}`);
const bad = rows.filter((r) => r.partialUsed && (!r.attachmentsMatch || !r.bodyMatch || !r.headersMatch || r.downloadMatch === false));
console.log(`mismatches=${bad.length}`);
if (bad.length) process.exitCode = 2;
