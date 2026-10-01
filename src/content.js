import { compile } from "html-to-text";

// Zero-width and other invisible characters that newsletters use as preheader padding.
const INVISIBLE_CHARS = /[​-‍⁠﻿­͏؜᠎ ]/g;

export function normalizeText(text) {
  return (text || "")
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE_CHARS, "")
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .map((line) => (line.trim() === "" ? "" : line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function createConverter(includeLinks) {
  const headingOptions = { uppercase: false, leadingLineBreaks: 2, trailingLineBreaks: 1 };
  return compile({
    wordwrap: false,
    selectors: [
      { selector: "img", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "script", format: "skip" },
      { selector: "head", format: "skip" },
      { selector: "a", options: { ignoreHref: !includeLinks, hideLinkHrefIfSameAsText: true, linkBrackets: ["<", ">"] } },
      ...["h1", "h2", "h3", "h4", "h5", "h6"].map((selector) => ({ selector, options: headingOptions })),
      { selector: "table", options: { uppercaseHeaderCells: false } },
    ],
  });
}

// Compiling is expensive, so both variants are prepared once.
const converters = { plain: createConverter(false), withLinks: createConverter(true) };

export function htmlToText(html, { includeLinks = false } = {}) {
  return normalizeText((includeLinks ? converters.withLinks : converters.plain)(html || ""));
}

// Patterns that start a quoted reply history. Matched against single lines.
const QUOTE_HEADER_PATTERNS = [
  /^\s*(Am|On|Le|El|Il)\s.{4,200}\s(schrieb|wrote|a écrit|escribió|ha scritto)\b.*:\s*$/i,
  /^\s*-{2,}\s*(Original Message|Ursprüngliche Nachricht|Originalnachricht|Forwarded message|Weitergeleitete Nachricht)\s*-{2,}/i,
  /^\s*_{10,}\s*$/,
];

// Outlook-style header block: "Von:" followed shortly by "Gesendet:"/"An:"/"Betreff:".
function isOutlookHeaderBlock(lines, index) {
  if (!/^\s*\**(Von|From)\s*:\**\s/i.test(lines[index])) return false;
  const following = lines.slice(index + 1, index + 6).join("\n");
  return /^\s*\**(Gesendet|Sent|Datum|Date)\s*:/im.test(following) && /^\s*\**(Betreff|Subject|An|To)\s*:/im.test(following);
}

// Removes the quoted history below the new content of a reply.
export function stripQuoted(text) {
  const lines = text.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (QUOTE_HEADER_PATTERNS.some((pattern) => pattern.test(line)) || isOutlookHeaderBlock(lines, i)) {
      const kept = lines.slice(0, i).join("\n").trim();
      if (kept) return { text: kept, removed: true };
    }
  }
  // Trailing block of ">"-quoted lines without a recognizable header.
  let end = lines.length;
  while (end > 0 && (lines[end - 1].startsWith(">") || lines[end - 1].trim() === "")) end--;
  if (end < lines.length && end > 0 && lines.slice(end).some((line) => line.startsWith(">"))) {
    return { text: lines.slice(0, end).join("\n").trim(), removed: true };
  }
  return { text, removed: false };
}

// Returns text[offset, offset+maxChars), preferring to end on a line break near the limit.
export function paginate(text, offset = 0, maxChars = 20000) {
  const total = text.length;
  const start = Math.max(0, Math.min(offset, total));
  let end = Math.min(total, start + maxChars);
  if (end < total) {
    const lastBreak = text.lastIndexOf("\n", end);
    if (lastBreak > start + maxChars * 0.8) end = lastBreak + 1;
    // Never split a UTF-16 surrogate pair (emoji).
    const code = text.charCodeAt(end - 1);
    if (code >= 0xd800 && code <= 0xdbff) end--;
  }
  return { chunk: text.slice(start, end), start, end, total, nextOffset: end < total ? end : null };
}

const URL_PATTERN = /\bhttps?:\/\/\S+/g;
const URL_DENSITY_LIMIT = 0.15;

// Share of characters that belong to URLs.
export function urlDensity(text) {
  if (!text) return 0;
  const urlChars = (text.match(URL_PATTERN) || []).reduce((sum, url) => sum + url.length, 0);
  return urlChars / text.length;
}

// Picks the best readable body from a parsed message.
// format: "auto" (text part, HTML fallback), "text" (text part only), "html" (HTML converted to text), "raw_html".
export function extractBody(parsed, { format = "auto", includeLinks = false } = {}) {
  const textPart = normalizeText(parsed.text || "");
  const hasHtml = typeof parsed.html === "string" && parsed.html.trim() !== "";

  if (format === "raw_html") {
    return { body: hasHtml ? parsed.html : "", source: hasHtml ? "raw_html" : "none" };
  }
  if (format === "text") {
    return { body: textPart, source: textPart ? "text" : "none" };
  }
  // Links are only available from HTML, so includeLinks prefers it in auto mode.
  // Newsletter text parts are often mostly raw URLs; their HTML converts to cleaner text.
  if (hasHtml && (format === "html" || !textPart || includeLinks || urlDensity(textPart) > URL_DENSITY_LIMIT)) {
    return { body: htmlToText(parsed.html, { includeLinks }), source: "html" };
  }
  if (textPart) return { body: textPart, source: "text" };
  return { body: "", source: "none" };
}

export function addressList(field) {
  if (!field) return [];
  const groups = Array.isArray(field) ? field : [field];
  return groups.flatMap((group) => group.value || []).filter((a) => a.address || a.name);
}

// Address objects for nodemailer; avoids re-parsing names that contain commas.
export function addressObjects(field) {
  const list = addressList(field).filter((a) => a.address);
  return list.length ? list.map((a) => ({ name: a.name || "", address: a.address })) : undefined;
}

// Names containing separators are quoted, so the output can be passed back as a recipient list.
export function formatAddress(a) {
  if (!a.name) return a.address;
  const name = /[,;<>@"]/.test(a.name) ? `"${a.name.replace(/"/g, "'")}"` : a.name;
  return `${name} <${a.address}>`;
}

export function formatAddresses(field) {
  return addressList(field).map(formatAddress).join(", ");
}

export function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return "?";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const SIGNATURE_TYPES = new Set(["application/pkcs7-signature", "application/x-pkcs7-signature", "application/pgp-signature"]);

export function describeAttachments(attachments = []) {
  return attachments.map((a, index) => ({
    index,
    filename: a.filename || `(unnamed ${a.contentType})`,
    contentType: a.contentType,
    size: a.size,
    inline: a.related === true || a.contentDisposition === "inline",
    signature: SIGNATURE_TYPES.has(a.contentType),
  }));
}

export function formatDate(date) {
  if (!date || Number.isNaN(date.getTime?.())) return "";
  return date.toISOString();
}
