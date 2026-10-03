import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarizeCalendar, parseICalendar, unescapeText } from "../src/ical.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/ical/${name}.ics`, import.meta.url), "utf-8");

test("parser unfolds lines and keeps quoted parameters with colons and semicolons", () => {
  const root = parseICalendar('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nORGANIZER;CN="A: B; C":mailto:a@b\r\nSUMMARY:Lang\r\n er Titel\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n');
  const event = root.components[0].components[0];
  assert.equal(event.props[0].params.CN, "A: B; C");
  assert.equal(event.props[0].value, "mailto:a@b");
  assert.equal(event.props[1].value, "Langer Titel");
  assert.equal(unescapeText("a\\, b\\; c\\nd\\\\e"), "a, b; c\nd\\e");
});

test("REQUEST: method, title, times with zone and UTC, organizer and attendees", () => {
  const text = summarizeCalendar(fixture("request"));
  assert.match(text, /^Calendar method: REQUEST/);
  assert.match(text, /Title: Projekt-Kickoff/);
  // Outlook's Windows zone name is resolved through the VTIMEZONE in the file (CEST in October).
  assert.match(text, /Start: 2026-10-05 14:00 \(W\. Europe Standard Time\) = 2026-10-05 12:00 UTC/);
  assert.match(text, /End: 2026-10-05 15:30 \(W\. Europe Standard Time\) = 2026-10-05 13:30 UTC/);
  assert.match(text, /All-day: no/);
  assert.match(text, /Location: Raum 1; Haus B/);
  assert.match(text, /Organizer: Krinke, Anna <anna@example\.com>/);
  assert.match(text, /- Bob Bauer <bob@example\.com>: NEEDS-ACTION \(required\)/);
  assert.match(text, /- carla@example\.com: ACCEPTED \(optional\)/);
  assert.match(text, /Description:\n {4}Agenda:\n {4}1\. Kassen, Rollout/);
});

test("VTIMEZONE rules switch to standard time in winter", () => {
  const winter = fixture("request").replace(/20261005T/g, "20261207T");
  assert.match(summarizeCalendar(winter), /Start: 2026-12-07 14:00 \(W\. Europe Standard Time\) = 2026-12-07 13:00 UTC/);
});

test("CANCEL: method and cancelled status", () => {
  const text = summarizeCalendar(fixture("cancel"));
  assert.match(text, /^Calendar method: CANCEL/);
  assert.match(text, /Start: 2026-10-07 09:00 UTC/);
  assert.match(text, /Status: CANCELLED/);
  assert.match(text, /- Bob <bob@example\.com>: DECLINED/);
});

test("all-day event: flag set and exclusive end shown as last day", () => {
  const text = summarizeCalendar(fixture("allday"));
  assert.match(text, /Calendar method: none/);
  assert.match(text, /Start: 2026-12-24\n/);
  assert.match(text, /End: 2026-12-26 \(last day\)/);
  assert.match(text, /All-day: yes/);
  assert.match(text, /umbrochen wird und daher gefaltet ist\./);
});

test("recurring event with VTIMEZONE: rule, exclusions and a moved occurrence", () => {
  const text = summarizeCalendar(fixture("recurring"));
  assert.match(text, /Event 1 of 2:/);
  assert.match(text, /Start: 2026-11-02 09:30 \(Europe\/Berlin\) = 2026-11-02 08:30 UTC/);
  assert.match(text, /Recurrence: FREQ=WEEKLY;BYDAY=MO;COUNT=10/);
  assert.match(text, /Excluded dates: 2026-11-09 09:30 \(Europe\/Berlin\) = 2026-11-09 08:30 UTC/);
  assert.match(text, /Changes occurrence: 2026-11-16 09:30 \(Europe\/Berlin\)/);
  assert.match(text, /Title: Team-Runde \(verschoben\)/);
});

test("floating times and unknown zones are shown without a UTC conversion", () => {
  const text = summarizeCalendar("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20261001T080000\r\nDTEND;TZID=Mars/Olympus:20261001T090000\r\nEND:VEVENT\r\nEND:VCALENDAR");
  assert.match(text, /Start: 2026-10-01 08:00 \(floating time, no time zone\)/);
  assert.match(text, /End: 2026-10-01 09:00 \(Mars\/Olympus\)\n/);
  assert.match(text, /Title: \(no title\)/);
});

test("a calendar without events says so", () => {
  assert.match(summarizeCalendar("BEGIN:VCALENDAR\r\nMETHOD:PUBLISH\r\nEND:VCALENDAR"), /Calendar method: PUBLISH\nNo events/);
});

test("VTIMEZONE rules end at their UNTIL", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VTIMEZONE", "TZID:Eastern Standard Time",
    "BEGIN:STANDARD", "DTSTART:19671029T020000", "TZOFFSETFROM:-0400", "TZOFFSETTO:-0500", "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10;UNTIL=20061029T060000Z", "END:STANDARD",
    "BEGIN:STANDARD", "DTSTART:20071104T020000", "TZOFFSETFROM:-0400", "TZOFFSETTO:-0500", "RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=11", "END:STANDARD",
    "BEGIN:DAYLIGHT", "DTSTART:20070311T020000", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0400", "RRULE:FREQ=YEARLY;BYDAY=2SU;BYMONTH=3", "END:DAYLIGHT",
    "END:VTIMEZONE",
    "BEGIN:VEVENT", "DTSTART;TZID=Eastern Standard Time:20261030T100000", "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  // 30 Oct 2026 is still daylight time (-04:00); the pre-2007 rule must not switch it to standard.
  assert.match(summarizeCalendar(ics), /Start: 2026-10-30 10:00 \(Eastern Standard Time\) = 2026-10-30 14:00 UTC/);
});
