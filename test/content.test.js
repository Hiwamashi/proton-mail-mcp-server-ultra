import { test } from "node:test";
import assert from "node:assert/strict";
import { extractBody, htmlToText, normalizeText, paginate, stripQuoted } from "../src/content.js";

test("HTML-only mail falls back to converted HTML", () => {
  const { body, source } = extractBody({ text: undefined, html: "<p>Guten Tag</p><p>Zeile <b>zwei</b></p>" });
  assert.equal(source, "html");
  assert.match(body, /Guten Tag\n\nZeile zwei/);
});

test("text part is preferred in auto mode, HTML when links are requested", () => {
  const parsed = { text: "Plain", html: '<a href="https://x.example/a">Link</a>' };
  assert.equal(extractBody(parsed).body, "Plain");
  const withLinks = extractBody(parsed, { includeLinks: true });
  assert.equal(withLinks.source, "html");
  assert.match(withLinks.body, /Link <https:\/\/x\.example\/a>/);
});

test("links are hidden by default and images, styles skipped", () => {
  const out = htmlToText('<style>p{}</style><img src="x.png" alt="logo"><a href="https://t.example/very/long">Hier klicken</a>');
  assert.equal(out, "Hier klicken");
});

test("normalizeText removes invisible padding and collapses blank lines", () => {
  assert.equal(normalizeText("A\u200c\u00a0\u034f\n \n\n\n\nB  "), "A\n\nB");
});

test("paginate returns offsets and prefers line breaks", () => {
  const text = "a".repeat(90) + "\n" + "b".repeat(50);
  const first = paginate(text, 0, 100);
  assert.equal(first.chunk, "a".repeat(90) + "\n");
  assert.equal(first.nextOffset, 91);
  const second = paginate(text, first.nextOffset, 100);
  assert.equal(second.chunk, "b".repeat(50));
  assert.equal(second.nextOffset, null);
});

test("stripQuoted cuts German and English reply headers", () => {
  assert.deepEqual(stripQuoted("Danke!\n\nAm 25.09.2026 um 11:26 schrieb Max <m@x.de>:\n> alt"), { text: "Danke!", removed: true });
  assert.deepEqual(stripQuoted("Thanks\nOn Mon, Sep 1, 2026 at 9:00 AM Max <m@x.de> wrote:\n> old"), { text: "Thanks", removed: true });
});

test("stripQuoted cuts Outlook header blocks", () => {
  const mail = "Passt so.\n\nVon: Max Muster <m@x.de>\nGesendet: Donnerstag, 25. September 2026 11:26\nAn: Sascha\nBetreff: Test\n\nalt";
  assert.deepEqual(stripQuoted(mail), { text: "Passt so.", removed: true });
});

test("stripQuoted leaves mails without quote alone", () => {
  assert.deepEqual(stripQuoted("Nur Text\nVon: hier ist kein Header"), { text: "Nur Text\nVon: hier ist kein Header", removed: false });
});

test("URL-heavy text part is replaced by converted HTML", () => {
  const parsed = {
    text: "Angebot [https://cdn.example.com/a/very/long/logo.png] https://track.example.com/c?id=123456789abcdef Jetzt",
    html: "<p>Angebot</p><p><a href='https://track.example.com/c'>Jetzt</a></p>",
  };
  const { body, source } = extractBody(parsed);
  assert.equal(source, "html");
  assert.equal(body, "Angebot\n\nJetzt");
});

test("paginate never splits an emoji", () => {
  const text = "x".repeat(9) + "😀" + "y".repeat(20);
  const first = paginate(text, 0, 10);
  assert.equal(first.chunk, "x".repeat(9));
  assert.equal(paginate(text, first.nextOffset, 10).chunk.startsWith("😀"), true);
});

test("formatAddresses quotes names with separators", async () => {
  const { formatAddresses } = await import("../src/content.js");
  const field = { value: [{ name: "Müller, Hans", address: "h@x.de" }, { name: "Anna", address: "a@x.de" }] };
  assert.equal(formatAddresses(field), '"Müller, Hans" <h@x.de>, Anna <a@x.de>');
});
