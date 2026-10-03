import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LOCALE_NAMES, parseLocale, parseTimeZone } from "../src/locale.js";
import { quoteAttribution, quoteText, forwardHeaderText } from "../src/compose.js";
import { stripQuoted } from "../src/content.js";

const original = {
  from: { value: [{ name: "Max Muster", address: "max@example.com" }] },
  to: { value: [{ address: "me@example.com" }] },
  subject: "Angebot",
  date: new Date("2026-10-06T07:15:00Z"),
};

test("all five locales are accepted, default is de", () => {
  assert.deepEqual(LOCALE_NAMES, ["de", "en", "fr", "es", "it"]);
  for (const l of LOCALE_NAMES) assert.equal(parseLocale(l), l);
  assert.equal(parseLocale(" EN "), "en");
  assert.equal(parseLocale(undefined), "de");
  assert.equal(parseLocale(""), "de");
});

test("an invalid locale names the variable and the valid values", () => {
  assert.throws(() => parseLocale("nl"), /PROTON_MCP_LOCALE "nl".*"de", "en", "fr", "es", "it"/);
});

test("time zones: IANA names accepted, default Europe/Berlin, invalid ones rejected", () => {
  assert.equal(parseTimeZone("America/New_York"), "America/New_York");
  assert.equal(parseTimeZone(undefined), "Europe/Berlin");
  assert.throws(() => parseTimeZone("Mars/Olympus"), /PROTON_MCP_TIMEZONE "Mars\/Olympus"/);
});

test("attribution per locale", () => {
  const berlin = "Europe/Berlin";
  assert.equal(quoteAttribution(original, { locale: "de", timeZone: berlin }), "Am 06.10.2026, 09:15 schrieb Max Muster <max@example.com>:");
  assert.match(quoteAttribution(original, { locale: "en", timeZone: berlin }), /^On Oct 6, 2026, 9:15\sAM, Max Muster <max@example\.com> wrote:$/);
  assert.match(quoteAttribution(original, { locale: "fr", timeZone: berlin }), /^Le 6 oct\. 2026, 09:15, Max Muster <max@example\.com> a écrit :$/);
  assert.match(quoteAttribution(original, { locale: "es", timeZone: berlin }), /^El 6 oct 2026, 9:15, Max Muster <max@example\.com> escribió:$/);
  assert.match(quoteAttribution(original, { locale: "it", timeZone: berlin }), /^Il 6 ott 2026, 09:15, Max Muster <max@example\.com> ha scritto:$/);
});

test("English attribution in New York time", () => {
  assert.match(quoteAttribution(original, { locale: "en", timeZone: "America/New_York" }), /^On Oct 6, 2026, 3:15\sAM, Max Muster/);
});

test("without a sender or date the attribution still reads naturally", () => {
  assert.equal(quoteAttribution({}, { locale: "de", timeZone: "Europe/Berlin" }), "unbekannt schrieb:");
  assert.equal(quoteAttribution({}, { locale: "en", timeZone: "Europe/Berlin" }), "unknown wrote:");
});

for (const locale of LOCALE_NAMES) {
  test(`round trip ${locale}: reply quote and forward header are removed by stripQuoted`, () => {
    const settings = { locale, timeZone: "Europe/Berlin" };
    const reply = `Neue Antwort.\n\n${quoteText("Altes\nZitat", quoteAttribution(original, settings))}`;
    assert.deepEqual(stripQuoted(reply), { text: "Neue Antwort.", removed: true });
    const forward = `Siehe unten.\n\n${forwardHeaderText(original, settings)}\n\nOriginaltext`;
    assert.deepEqual(stripQuoted(forward), { text: "Siehe unten.", removed: true });
  });
}

test("forward header labels follow the locale", () => {
  const text = forwardHeaderText(original, { locale: "en", timeZone: "Europe/Berlin" });
  assert.match(text, /^---------- Forwarded message ---------\nFrom: Max Muster <max@example\.com>\nDate: Oct 6, 2026/);
  assert.match(text, /\nSubject: Angebot\nTo: me@example\.com$/);
});

test("the server stops at startup on an invalid time zone or locale, naming the variable", () => {
  const server = fileURLToPath(new URL("../src/server.js", import.meta.url));
  const run = (env) => spawnSync(process.execPath, [server], { env: { ...process.env, ...env }, input: "", encoding: "utf-8", timeout: 10000 });
  const tz = run({ PROTON_MCP_TIMEZONE: "Mars/Olympus" });
  assert.equal(tz.status, 1);
  assert.match(tz.stderr, /PROTON_MCP_TIMEZONE "Mars\/Olympus"/);
  const locale = run({ PROTON_MCP_LOCALE: "nl" });
  assert.equal(locale.status, 1);
  assert.match(locale.stderr, /PROTON_MCP_LOCALE "nl"/);
});
