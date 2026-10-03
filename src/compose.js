import MailComposer from "nodemailer/lib/mail-composer";
import { addressList } from "./content.js";
import { CONFIG } from "./config.js";
import { LOCALES, formatQuoteDate } from "./locale.js";

function formatOne(a) {
  return a.name ? `"${a.name.replace(/"/g, "'")}" <${a.address}>` : a.address;
}

function dedupe(addresses, exclude = new Set()) {
  const seen = new Set(exclude);
  const result = [];
  for (const a of addresses) {
    const key = (a.address || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(a);
  }
  return result;
}

// Computes To/Cc for a reply. Honors Reply-To, never addresses ourselves, and handles
// replying to a message we sent (then the original recipients are addressed again).
export function replyRecipients(original, { replyAll = false, selfAddresses = [] } = {}) {
  const self = new Set(selfAddresses.map((a) => a.toLowerCase()));
  const isSelf = (a) => self.has((a.address || "").toLowerCase());

  const from = addressList(original.from);
  const replyTo = addressList(original.replyTo);
  const originalTo = addressList(original.to);
  const originalCc = addressList(original.cc);

  let primary = replyTo.length ? replyTo : from;
  const sentByUs = primary.length > 0 && primary.every(isSelf);
  if (sentByUs) primary = originalTo;

  const to = dedupe(primary.filter((a) => !isSelf(a)));
  let cc = [];
  if (replyAll) {
    const others = sentByUs ? originalCc : [...originalTo, ...originalCc];
    cc = dedupe(
      others.filter((a) => !isSelf(a)),
      new Set(to.map((a) => a.address.toLowerCase()))
    );
  }
  return { to: to.map(formatOne).join(", "), cc: cc.map(formatOne).join(", ") };
}

export function replySubject(subject) {
  const s = (subject || "").trim();
  return /^(re|aw|antw)\s*:/i.test(s) ? s : `Re: ${s}`;
}

export function referencesFor(original) {
  const refs = [original.references, original.messageId].flat().filter(Boolean);
  return refs.length ? refs.join(" ") : undefined;
}

// Language and time zone of generated quote lines and forward headers (PROTON_MCP_LOCALE,
// PROTON_MCP_TIMEZONE). Tests pass them explicitly.
const quoteSettings = () => ({ locale: CONFIG.locale || "de", timeZone: CONFIG.timeZone || "Europe/Berlin" });

export function quoteAttribution(original, { locale, timeZone } = quoteSettings()) {
  const sender = addressList(original.from)[0];
  const who = sender ? (sender.name ? `${sender.name} <${sender.address}>` : sender.address) : LOCALES[locale].unknownSender;
  return LOCALES[locale].attribution(formatQuoteDate(original.date, locale, timeZone), who);
}

// Forwarding keeps an existing forward prefix (Fwd:, Fw:, WG:) instead of stacking another one.
export function forwardSubject(subject) {
  const s = (subject || "").trim();
  return /^(fwd?|wg)\s*:/i.test(s) ? s : `Fwd: ${s}`;
}

function addressLine(field) {
  return addressList(field)
    .map((a) => (a.name ? `${a.name} <${a.address}>` : a.address))
    .join(", ");
}

// Header lines of the forwarded original, in the language of the reply quote. Empty Cc is left out.
function forwardHeaderLines(original, { locale, timeZone }) {
  const labels = LOCALES[locale].forward;
  const lines = [
    [labels.from, addressLine(original.from)],
    [labels.date, formatQuoteDate(original.date, locale, timeZone)],
    [labels.subject, original.subject || ""],
    [labels.to, addressLine(original.to)],
    [labels.cc, addressLine(original.cc), true],
  ];
  return lines.filter(([, value, optional]) => value || !optional);
}

export function forwardHeaderText(original, settings = quoteSettings()) {
  const { separator } = LOCALES[settings.locale].forward;
  return [separator, ...forwardHeaderLines(original, settings).map(([label, value]) => `${label}: ${value}`)].join("\n");
}

export function forwardHeaderHtml(original, settings = quoteSettings()) {
  const { separator } = LOCALES[settings.locale].forward;
  const rows = forwardHeaderLines(original, settings).map(([label, value]) => `<b>${label}:</b> ${escapeHtml(value)}<br>`);
  return `${escapeHtml(separator)}<br>\n${rows.join("\n")}`;
}

export function quoteText(originalBody, attribution) {
  const quoted = originalBody
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
  return `${attribution}\n${quoted}`;
}

export function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function textToHtml(text) {
  return escapeHtml(text).replace(/\n/g, "<br>\n");
}

export function quoteHtml(originalHtml, originalText, attribution) {
  const inner = originalHtml || textToHtml(originalText);
  return (
    `<div class="protonmail_quote">${escapeHtml(attribution)}<br>` +
    `<blockquote class="protonmail_quote" type="cite" style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">` +
    `${inner}</blockquote></div>`
  );
}

// Builds an RFC 822 message. keepBcc retains the Bcc header, which drafts need.
export async function buildRawMessage(mailOptions, { keepBcc = false } = {}) {
  const node = new MailComposer(mailOptions).compile();
  node.keepBcc = keepBcc;
  return await node.build();
}

export function splitAddresses(value) {
  return (value || "")
    .split(/[,;]/)
    .map((a) => a.trim())
    .filter(Boolean);
}

// delete_draft and update_draft remove a message from Drafts. A message there without the \Draft flag
// (e.g. an email moved in with move_email) is not a draft and must never be deleted through them.
export function assertIsDraft(flags, uid) {
  const list = flags instanceof Set ? [...flags] : flags || [];
  if (!list.includes("\\Draft")) {
    throw new Error(`Message UID ${uid} in Drafts is not a draft (it has no \\Draft flag), so it is left untouched.`);
  }
}
