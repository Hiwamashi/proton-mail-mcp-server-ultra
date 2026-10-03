**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Kalenderdateien und Einladungen

**Dateien:** src/ical.js (Parser und Zusammenfassung), src/attachments.js (Anbindung), src/tools/mailbox.js (Parameter `raw`)

## Zweck

Bei iCalendar-Anhängen (`text/calendar`, `application/ics` oder Endung `.ics`) liefert `get_attachment` zuerst eine Zusammenfassung pro Termin und danach den Rohtext. Früher kam nur der Rohtext. Mit `raw: true` kommt wie früher nur der Rohtext. Auf andere Anhänge hat `raw` keine Wirkung.

## Ausgabe

```
Attachment [0] invite.ics (text/calendar, 2 KB) from UID 105
Calendar summary followed by the raw iCalendar text (raw: true for the raw text only)
Content: chars 0–1453 of 1453
---
Calendar method: REQUEST
Event 1 of 1:
  Title: Projekt-Kickoff
  Start: 2026-10-05 14:00 (W. Europe Standard Time) = 2026-10-05 12:00 UTC
  End: 2026-10-05 15:30 (W. Europe Standard Time) = 2026-10-05 13:30 UTC
  All-day: no
  Location: Raum 1; Haus B
  Organizer: Krinke, Anna <anna@example.com>
  Attendees:
    - Bob Bauer <bob@example.com>: NEEDS-ACTION (required)
    - carla@example.com: ACCEPTED (optional)
  Status: CONFIRMED
  Description:
    Agenda: …

--- Raw iCalendar ---
BEGIN:VCALENDAR
…
```

Felder, die fehlen, werden weggelassen. Immer dabei sind Methode, Titel (sonst `(no title)`), Start und `All-day`.

| Feld | Quelle |
|---|---|
| `Calendar method` | `METHOD` im `VCALENDAR` (REQUEST, CANCEL, REPLY, PUBLISH, …); ohne Methode `none (plain calendar file)` |
| `Title` | `SUMMARY` |
| `Changes occurrence` | `RECURRENCE-ID`: Der Termin ändert ein einzelnes Vorkommen einer Serie |
| `Start` / `End` | `DTSTART` / `DTEND`; ohne `DTEND` wird `Duration` (`DURATION`) roh ausgegeben |
| `All-day` | `DTSTART` mit `VALUE=DATE` bzw. ohne Uhrzeit. `End` zeigt dann den letzten Tag mit `(last day)`, weil `DTEND` dort exklusiv ist |
| `Location`, `Status` | `LOCATION`, `STATUS` |
| `Organizer` | `ORGANIZER` mit `CN` und Adresse ohne `mailto:` |
| `Attendees` | je `ATTENDEE`: Name/Adresse, `PARTSTAT` (Standard `NEEDS-ACTION`), Rolle (`required`, `optional`, `chair`, `for information`) |
| `Recurrence` | `RRULE` roh, mehrere mit ` \| ` getrennt |
| `Excluded dates` | `EXDATE`, formatiert wie Start und Ende |
| `Description` | `DESCRIPTION`, entschlüsselt und eingerückt |

## Zeiten und Zeitzonen

- **UTC** (`…Z`): `2026-10-07 09:00 UTC`.
- **Mit TZID**: Die Zeit erscheint wie in der Datei, mit TZID, dazu die UTC-Zeit, falls sich die Zone auflösen lässt. Aufgelöst wird so:
  1. Ist die TZID ein IANA-Name (`Europe/Berlin`), rechnet `Intl.DateTimeFormat` um, einschließlich Sommerzeit.
  2. Sonst wird der `VTIMEZONE`-Block aus der Datei ausgewertet, z. B. bei Outlooks Windows-Namen wie `W. Europe Standard Time`. Es gewinnt die `STANDARD`/`DAYLIGHT`-Regel mit dem jüngsten Beginn vor dem Zeitpunkt. Unterstützt sind jährliche Regeln mit `BYMONTH` + `BYDAY` (z. B. `-1SU`) oder `BYMONTHDAY`, feste `DTSTART` und `RDATE`. Eine Regel gilt nur ab ihrem `DTSTART` und bis zu ihrem `UNTIL` (z. B. alte US-Regeln vor 2007); `COUNT` wird nicht ausgewertet.
  3. Lässt sich nichts auflösen, erscheint nur `(TZID)` ohne UTC.
- **Floating** (ohne Z und ohne TZID): `(floating time, no time zone)`.

## Parser (`parseICalendar`)

Er faltet Zeilen zurück (CRLF + Leerzeichen/Tab), erkennt Parameter auch mit Anführungszeichen (`CN="Krinke, Anna"`) und baut einen Komponentenbaum. Textwerte werden entschlüsselt: `\n`, `\,`, `\;`, `\\`. Es gibt keine Abhängigkeit; `node-ical` wurde wegen `moment-timezone` verworfen.

## Grenzen

Ausgewertet werden nur `VEVENT`. Aufgaben (`VTODO`) und Erinnerungen (`VALARM`) erscheinen nur im Rohtext. Serien werden nicht in einzelne Termine aufgelöst; die Regel steht roh da. Auf Einladungen antworten (zusagen oder absagen) kann das Tool nicht. Die Datei wird immer als UTF-8 gelesen; ein abweichender `charset` wird nicht berücksichtigt.

## Tests

`test/ical.test.js` mit den Fixtures in `test/fixtures/ical/`: Einladung im Outlook-Format mit Windows-Zeitzone (`request.ics`, auch im Winter geprüft), Absage (`cancel.ics`), Ganztagstermin über drei Tage mit gefalteter Beschreibung (`allday.ics`), wöchentliche Serie mit `VTIMEZONE`, `EXDATE` und verschobenem Vorkommen (`recurring.ics`). Dazu Floating-Zeiten, unbekannte Zonen und Kalender ohne Termine. `test/attachment-documents.test.js` prüft die Reihenfolge Zusammenfassung → Rohtext und `raw: true`.

---

## English

# Calendar files and invitations

**Files:** src/ical.js (parser and summary), src/attachments.js (wiring), src/tools/mailbox.js (parameter `raw`)

## Purpose

For iCalendar attachments (`text/calendar`, `application/ics` or extension `.ics`), `get_attachment` returns a summary per event first and the raw text after it. It used to return only the raw text. With `raw: true` it returns only the raw text, as before. `raw` has no effect on other attachments.

## Output

```
Attachment [0] invite.ics (text/calendar, 2 KB) from UID 105
Calendar summary followed by the raw iCalendar text (raw: true for the raw text only)
Content: chars 0–1453 of 1453
---
Calendar method: REQUEST
Event 1 of 1:
  Title: Projekt-Kickoff
  Start: 2026-10-05 14:00 (W. Europe Standard Time) = 2026-10-05 12:00 UTC
  End: 2026-10-05 15:30 (W. Europe Standard Time) = 2026-10-05 13:30 UTC
  All-day: no
  Location: Raum 1; Haus B
  Organizer: Krinke, Anna <anna@example.com>
  Attendees:
    - Bob Bauer <bob@example.com>: NEEDS-ACTION (required)
    - carla@example.com: ACCEPTED (optional)
  Status: CONFIRMED
  Description:
    Agenda: …

--- Raw iCalendar ---
BEGIN:VCALENDAR
…
```

Fields that are missing are left out. Always present are the method, the title (otherwise `(no title)`), the start and `All-day`.

| Field | Source |
|---|---|
| `Calendar method` | `METHOD` in the `VCALENDAR` (REQUEST, CANCEL, REPLY, PUBLISH, …); without a method `none (plain calendar file)` |
| `Title` | `SUMMARY` |
| `Changes occurrence` | `RECURRENCE-ID`: the event changes a single occurrence of a series |
| `Start` / `End` | `DTSTART` / `DTEND`; without `DTEND`, `Duration` (`DURATION`) is shown raw |
| `All-day` | `DTSTART` with `VALUE=DATE` or without a time. `End` then shows the last day with `(last day)`, because `DTEND` is exclusive there |
| `Location`, `Status` | `LOCATION`, `STATUS` |
| `Organizer` | `ORGANIZER` with `CN` and the address without `mailto:` |
| `Attendees` | each `ATTENDEE`: name/address, `PARTSTAT` (default `NEEDS-ACTION`), role (`required`, `optional`, `chair`, `for information`) |
| `Recurrence` | `RRULE` raw, several separated by ` \| ` |
| `Excluded dates` | `EXDATE`, formatted like start and end |
| `Description` | `DESCRIPTION`, unescaped and indented |

## Times and time zones

- **UTC** (`…Z`): `2026-10-07 09:00 UTC`.
- **With TZID**: the time appears as in the file, with its TZID, plus the UTC time if the zone can be resolved. It is resolved like this:
  1. If the TZID is an IANA name (`Europe/Berlin`), `Intl.DateTimeFormat` converts it, including daylight saving time.
  2. Otherwise the `VTIMEZONE` block from the file is evaluated, e.g. for Outlook's Windows names such as `W. Europe Standard Time`. The `STANDARD`/`DAYLIGHT` rule with the latest onset before the time wins. Supported are yearly rules with `BYMONTH` + `BYDAY` (e.g. `-1SU`) or `BYMONTHDAY`, fixed `DTSTART` and `RDATE`. A rule only applies from its `DTSTART` up to its `UNTIL` (e.g. old US rules before 2007); `COUNT` is not evaluated.
  3. If nothing can be resolved, only `(TZID)` appears, without UTC.
- **Floating** (no Z and no TZID): `(floating time, no time zone)`.

## Parser (`parseICalendar`)

It unfolds lines (CRLF + space/tab), recognizes parameters including quoted ones (`CN="Krinke, Anna"`) and builds a component tree. Text values are unescaped: `\n`, `\,`, `\;`, `\\`. There is no dependency; `node-ical` was rejected because of `moment-timezone`.

## Limits

Only `VEVENT` is evaluated. Tasks (`VTODO`) and alarms (`VALARM`) appear only in the raw text. Series are not expanded into single events; the rule is shown raw. The tool cannot answer invitations (accept or decline). The file is always read as UTF-8; a different `charset` is not taken into account.

## Tests

`test/ical.test.js` with the fixtures in `test/fixtures/ical/`: invitation in Outlook format with a Windows time zone (`request.ics`, also checked in winter), cancellation (`cancel.ics`), three-day all-day event with a folded description (`allday.ics`), weekly series with `VTIMEZONE`, `EXDATE` and a moved occurrence (`recurring.ics`). Also floating times, unknown zones and calendars without events. `test/attachment-documents.test.js` checks the order summary → raw text and `raw: true`.
