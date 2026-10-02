import { test } from "node:test";
import assert from "node:assert/strict";
import { replyRecipients, replySubject, referencesFor, quoteText, buildRawMessage, assertIsDraft } from "../src/compose.js";

const addr = (...list) => ({ value: list.map(([name, address]) => ({ name, address })) });
const SELF = ["me@proton.me"];

test("reply goes to sender, reply-all adds others without self", () => {
  const original = {
    from: addr(["Anna", "anna@x.de"]),
    to: addr(["Me", "ME@proton.me"], ["Bob", "bob@x.de"]),
    cc: addr(["Carl", "carl@x.de"], ["Anna", "anna@x.de"]),
  };
  assert.deepEqual(replyRecipients(original, { selfAddresses: SELF }), { to: '"Anna" <anna@x.de>', cc: "" });
  assert.deepEqual(replyRecipients(original, { replyAll: true, selfAddresses: SELF }), {
    to: '"Anna" <anna@x.de>',
    cc: '"Bob" <bob@x.de>, "Carl" <carl@x.de>',
  });
});

test("Reply-To wins over From", () => {
  const original = { from: addr(["Shop", "noreply@shop.de"]), replyTo: addr(["", "support@shop.de"]), to: addr(["", "me@proton.me"]) };
  assert.equal(replyRecipients(original, { selfAddresses: SELF }).to, "support@shop.de");
});

test("replying to own sent mail addresses the original recipients", () => {
  const original = { from: addr(["Me", "me@proton.me"]), to: addr(["Anna", "anna@x.de"]), cc: addr(["", "carl@x.de"]) };
  assert.deepEqual(replyRecipients(original, { replyAll: true, selfAddresses: SELF }), { to: '"Anna" <anna@x.de>', cc: "carl@x.de" });
});

test("subject prefix is not doubled", () => {
  assert.equal(replySubject("Angebot"), "Re: Angebot");
  assert.equal(replySubject("AW: Angebot"), "AW: Angebot");
  assert.equal(replySubject("re: x"), "re: x");
});

test("references chain includes original message id", () => {
  assert.equal(referencesFor({ references: ["<a@x>", "<b@x>"], messageId: "<c@x>" }), "<a@x> <b@x> <c@x>");
  assert.equal(referencesFor({ messageId: "<c@x>" }), "<c@x>");
});

test("quoteText prefixes every line", () => {
  assert.equal(quoteText("eins\n\nzwei", "Am X schrieb Y:"), "Am X schrieb Y:\n> eins\n>\n> zwei");
});

test("draft build keeps Bcc header only when asked", async () => {
  const options = { from: "me@proton.me", to: "a@x.de", bcc: "secret@x.de", subject: "S", text: "T" };
  assert.match((await buildRawMessage(options, { keepBcc: true })).toString(), /^Bcc: secret@x\.de/m);
  assert.doesNotMatch((await buildRawMessage(options)).toString(), /^Bcc:/m);
});

test("assertIsDraft accepts a message with the \\Draft flag and refuses one without", () => {
  assert.doesNotThrow(() => assertIsDraft(["\\Seen", "\\Draft"], 7));
  assert.doesNotThrow(() => assertIsDraft(new Set(["\\Draft"]), 7));
  assert.throws(() => assertIsDraft(["\\Seen"], 7), /UID 7 in Drafts is not a draft/);
  assert.throws(() => assertIsDraft([], 7), /not a draft/);
  assert.throws(() => assertIsDraft(undefined, 7), /not a draft/);
});
