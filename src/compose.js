import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { addressList } from "./content.js";

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

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});

export function quoteAttribution(original) {
  const sender = addressList(original.from)[0];
  const who = sender ? (sender.name ? `${sender.name} <${sender.address}>` : sender.address) : "unbekannt";
  const when = original.date ? dateFormatter.format(original.date) : "";
  return when ? `Am ${when} schrieb ${who}:` : `${who} schrieb:`;
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
