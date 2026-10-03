import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { simpleParser } from "mailparser";
import { forwardSubject, forwardHeaderText, forwardHeaderHtml, buildRawMessage } from "../src/compose.js";
import { composeOptions } from "../src/tools/compose.js";
import { stripQuoted } from "../src/content.js";

const source = () => simpleParser(readFileSync(new URL("./fixtures/forward-source.eml", import.meta.url)), { skipImageLinks: true });

test("forward subject gets Fwd: unless it already has a forward prefix", () => {
  assert.equal(forwardSubject("Rechnung"), "Fwd: Rechnung");
  assert.equal(forwardSubject("  Rechnung "), "Fwd: Rechnung");
  assert.equal(forwardSubject("fwd: Rechnung"), "fwd: Rechnung");
  assert.equal(forwardSubject("Fw: Rechnung"), "Fw: Rechnung");
  assert.equal(forwardSubject("WG: Rechnung"), "WG: Rechnung");
  assert.equal(forwardSubject("Re: Rechnung"), "Fwd: Re: Rechnung");
  assert.equal(forwardSubject(""), "Fwd: ");
});

test("header block lists From, Date, Subject, To and Cc of the original", async () => {
  const original = await source();
  assert.equal(
    forwardHeaderText(original),
    [
      "---------- Weitergeleitete Nachricht ----------",
      "Von: Jürgen Müller <juergen@example.com>",
      "Datum: 06.10.2026, 09:15",
      "Betreff: Rechnung Oktober",
      "An: Anna Beispiel <anna@example.com>",
      "Cc: team@example.com",
    ].join("\n")
  );
  const html = forwardHeaderHtml(original);
  assert.match(html, /<b>Von:<\/b> Jürgen Müller &lt;juergen@example\.com&gt;<br>/);
  assert.match(html, /<b>Cc:<\/b> team@example\.com/);
});

test("header block leaves out an empty Cc", () => {
  const text = forwardHeaderText({ from: { value: [{ address: "a@x" }] }, subject: "S", to: { value: [{ address: "b@x" }] } });
  assert.doesNotMatch(text, /^Cc:/m);
  assert.match(text, /^Datum: $/m);
});

test("the forward separator is recognized as quoted history", async () => {
  const options = await composeOptions({ to: "x@example.com", body: "Bitte buchen.", forward: await source() });
  assert.deepEqual(stripQuoted(options.text), { text: "Bitte buchen.", removed: true });
});

test("forward options: subject, intro, header block, original body; no threading headers", async () => {
  const options = await composeOptions({ to: "buchhaltung@example.com", body: "Bitte buchen.", forward: await source() });
  assert.equal(options.subject, "Fwd: Rechnung Oktober");
  assert.equal(options.to, "buchhaltung@example.com");
  assert.match(options.text, /^Bitte buchen\.\n\n---------- Weitergeleitete Nachricht ----------\n[\s\S]*\n\nAnbei die Rechnung\.$/);
  assert.match(options.html, /^<p>Bitte buchen\.<\/p>|^Bitte buchen\./);
  assert.match(options.html, /<div class="protonmail_forward">.*Weitergeleitete Nachricht.*<p>Anbei die <b>Rechnung<\/b>\.<\/p><img src="cid:logo@example\.com">/s);
  assert.equal(options.inReplyTo, undefined);
  assert.equal(options.references, undefined);
});

test("built forward contains the PDF and the inline image, but no signature part", async () => {
  const options = await composeOptions({ to: "buchhaltung@example.com", body: "Bitte buchen.", forward: await source() });
  const built = await simpleParser(await buildRawMessage(options), { skipImageLinks: true });
  const parts = built.attachments.map((a) => [a.filename, a.contentType, a.contentDisposition]);
  assert.deepEqual(parts.sort(), [
    ["Rechnung.pdf", "application/pdf", "attachment"],
    ["logo.png", "image/png", "inline"],
  ]);
  const logo = built.attachments.find((a) => a.filename === "logo.png");
  assert.equal(logo.cid, "logo@example.com");
  assert.match(built.html, /cid:logo@example\.com/);
  assert.equal(built.inReplyTo, undefined);
  assert.equal(built.subject, "Fwd: Rechnung Oktober");
});

test("includeAttachments: false forwards without attachments", async () => {
  const options = await composeOptions({ to: "x@example.com", forward: await source(), includeAttachments: false });
  assert.equal(options.attachments, undefined);
  const built = await simpleParser(await buildRawMessage(options));
  assert.equal(built.attachments.length, 0);
});

test("forward without intro and without original HTML stays plain text", async () => {
  const original = { subject: "Kurz", text: "Nur Text", from: { value: [{ address: "a@x" }] } };
  const options = await composeOptions({ to: "x@example.com", forward: original });
  assert.equal(options.html, undefined);
  assert.match(options.text, /^---------- Weitergeleitete Nachricht ----------[\s\S]*\n\nNur Text$/);
});

import { registerComposeTools } from "../src/tools/compose.js";

function handlers(mode) {
  const tools = new Map();
  registerComposeTools({ registerTool: (name, config, handler) => tools.set(name, { config, handler }) }, { mode });
  return tools;
}

test("create_draft refuses replyToUid together with forwardUid before touching the mailbox", async () => {
  const { handler } = handlers("drafts").get("create_draft");
  const result = await handler({ replyToUid: 1, replyFolder: "INBOX", forwardUid: 2, forwardFolder: "INBOX", body: "x" });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Use either replyToUid or forwardUid, not both/);
});

test("create_draft still needs a body unless it forwards", async () => {
  const { handler } = handlers("drafts").get("create_draft");
  const result = await handler({ to: "a@example.com", subject: "S", replyFolder: "INBOX", forwardFolder: "INBOX" });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /body is required unless the draft forwards/);
});

test("forward_email exists only in full mode; forward drafts in drafts mode", () => {
  assert.equal(handlers("drafts").has("forward_email"), false);
  assert.equal(handlers("full").has("forward_email"), true);
  const schema = handlers("drafts").get("create_draft").config.inputSchema;
  for (const key of ["forwardUid", "forwardFolder", "includeAttachments"]) assert.ok(key in schema, key);
  assert.equal(handlers("full").get("forward_email").config.annotations.openWorldHint, true);
});

test("an empty explicit subject still gets the Fwd: subject", async () => {
  const options = await composeOptions({ to: "x@example.com", subject: " ", forward: { subject: "Rechnung", text: "t" } });
  assert.equal(options.subject, "Fwd: Rechnung");
});
