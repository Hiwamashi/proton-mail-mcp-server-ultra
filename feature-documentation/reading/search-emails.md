**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Tool: search_emails

**Datei:** src/tools/mailbox.js (`searchCriteria()`, `searchMessages()`)

## Zweck

Sucht Mails in einem Ordner. Alle Kriterien werden mit AND verknüpft. Ergebnisse sind neuste zuerst.

## Parameter

| Parameter | Typ | Beschreibung |
|---|---|---|
| `folder` | string | Ordner-Pfad (Standard: `"INBOX"`). Tipp: `"All Mail"` durchsucht das gesamte Postfach |
| `from` | string | Absender-Adresse oder Name enthält (substring) |
| `to` | string | Empfänger-Adresse oder Name enthält |
| `subject` | string | Betreff enthält |
| `body` | string | Mail-Body enthält |
| `text` | string | Header oder Body enthalten (breiteste Suche) |
| `since` | string | Am oder nach diesem Datum (Format: `YYYY-MM-DD`) |
| `before` | string | Vor diesem Datum |
| `unseen` | boolean | Nur ungelesene Mails |
| `flagged` | boolean | Nur markierte/mit Stern versehene Mails |
| `cc` | string | Cc-Adresse oder Name enthält |
| `larger` | number | Nur Mails größer als so viele Bytes (mindestens 1) |
| `smaller` | number | Nur Mails kleiner als so viele Bytes |
| `answered` | boolean | `true`: nur beantwortete Mails, `false`: nur unbeantwortete (Flag `\Answered`) |
| `hasAttachments` | boolean | `true`: nur Mails mit mindestens einem echten Anhang, `false`: nur Mails ohne. Inline-Bilder zählen nicht |
| `limit` | number | Max. Ergebnisse (Standard: 20, max. 100) |
| `offset` | number | Überspringen Sie diese vielen Treffer (für Paging) |

## Rückgabe

MCP-Text-Block mit Struktur:

```javascript
{
  folder: "All Mail",
  totalMatches: 847,
  offset: 0,
  showing: 20,
  nextOffset: 20,
  messages: [
    {
      uid: 105,
      date: "2024-01-15T14:30:00.000Z",
      from: "...",
      to: "...",
      subject: "...",
      unread: false,
      flagged: false,
      hasAttachments: false,
      size: 12345,
    },
    // ... mehr ...
  ]
}
```

Falls kein Ergebnis: der Text `No emails in "<folder>" matched the search criteria.`

## Besonderheiten

### Sortierung

Ergebnisse sind **immer neuste zuerst** (nach internem Datum der Mail). IMAP `SEARCH` liefert UIDs unsortiert; der Server sortiert sie nach Datum.

### Große Suchmengen

Falls die Suche mehr als 3000 Treffer ergibt, wird nur die höchsten 3000 UIDs nach Datum sortiert. Das Tool warnt:

```
"note": "Only the 3000 highest UIDs were sorted – narrow the search."
```

Das verhindert Timeouts bei sehr breiten Suchanfragen (z. B. `from: "example.com"` im ganzen Postfach).

### Datums-Format

Akzeptiert nur `YYYY-MM-DD`, z. B. `"2024-01-15"`. Andere Formate werfen einen Fehler.

### Kriterien kombinieren

Alle angegebenen Kriterien werden mit AND verknüpft:

```
from: "alice", subject: "meeting"
→ Absender enthält "alice" UND Betreff enthält "meeting"
```

Falls keine Kriterien angegeben sind, sucht IMAP nach `all` (alle Mails).

### Zusätzliche Kriterien

`cc`, `larger`, `smaller` und `answered` gehen direkt in die IMAP-Suche (`CC`, `LARGER`, `SMALLER`, `ANSWERED`/`UNANSWERED`). Live gemessen am 2026-10-03: `answered: false` mit `hasAttachments: true` in INBOX dauert 12 ms.

`hasAttachments` gibt es in IMAP nicht. Im Kandidatenschritt, der für die Sortierung ohnehin `internalDate` holt, wird dann zusätzlich `BODYSTRUCTURE` geholt und mit `hasAttachments()` gefiltert. Das ist dieselbe Definition wie im Feld `hasAttachments` der Ergebnisse: Ein Teil mit Disposition `attachment` zählt, Inline-Bilder zählen nicht. `totalMatches`, `nextOffset` und das Paging zählen nur Mails, die den Filter bestehen. Ohne `hasAttachments` wird kein `BODYSTRUCTURE` geholt.

Bei mehr als 3000 IMAP-Treffern werden nur die 3000 höchsten UIDs geprüft. `totalMatches` zählt dann nur die passenden Mails unter diesen 3000, und die Notiz lautet: `Only the 3000 highest of <n> UIDs were checked for attachments and sorted – narrow the search.`

Besteht nach dem Filter keine Mail, kommt dieselbe Meldung wie ohne Treffer.

## Implementierung

```javascript
// searchCriteria(): Argumente → imapflow-Kriterien (hasAttachments fehlt bewusst)
const uids = await client.search(searchCriteria(args), { uid: true });

// UIDs sind nicht chronologisch – daher sortieren; hasAttachments filtert im selben Schritt
const candidates = uids.length > MAX_SORT_CANDIDATES ? uids.slice(-MAX_SORT_CANDIDATES) : uids;
const query = { uid: true, internalDate: true, ...(wantAttachments !== undefined ? { bodyStructure: true } : {}) };
for await (const msg of client.fetch(candidates.join(","), query, { uid: true })) {
  if (wantAttachments !== undefined && hasAttachments(msg.bodyStructure) !== wantAttachments) continue;
  dated.push({ uid: msg.uid, time: new Date(msg.internalDate).getTime() });
}
dated.sort((a, b) => b.time - a.time);
```

## Fehlerbehandlung

Falls der Ordner nicht existiert: IMAP-Fehler.

Falls Datums-Format ungültig: `Error: Invalid since date "..." – use YYYY-MM-DD.`

## Tests

`test/search.test.js`: Abbildung der Kriterien, `hasAttachments` mit `totalMatches` und Paging, reine Inline-Bilder, Kombination mit `answered` (mit `test/helpers/fake-mailbox.js`).

---

## English

# Tool: search_emails

**File:** src/tools/mailbox.js (`searchCriteria()`, `searchMessages()`)

## Purpose

Searches for messages in a folder. All criteria are combined with AND. Results are newest first.

## Parameters

| Parameter | Type | Description |
|---|---|---|
| `folder` | string | Folder path (default: `"INBOX"`). Tip: `"All Mail"` searches the entire mailbox |
| `from` | string | Sender address or name contains (substring) |
| `to` | string | Recipient address or name contains |
| `subject` | string | Subject contains |
| `body` | string | Message body contains |
| `text` | string | Headers or body contain (broadest search) |
| `since` | string | On or after this date (format: `YYYY-MM-DD`) |
| `before` | string | Before this date |
| `unseen` | boolean | Only unread messages |
| `flagged` | boolean | Only flagged/starred messages |
| `cc` | string | Cc address or name contains |
| `larger` | number | Only messages larger than this many bytes (at least 1) |
| `smaller` | number | Only messages smaller than this many bytes |
| `answered` | boolean | `true`: only replied messages, `false`: only unreplied ones (flag `\Answered`) |
| `hasAttachments` | boolean | `true`: only messages with at least one real attachment, `false`: only messages without. Inline images do not count |
| `limit` | number | Max results (default: 20, max 100) |
| `offset` | number | Skip this many results (for paging) |

## Return

MCP text block with structure:

```javascript
{
  folder: "All Mail",
  totalMatches: 847,
  offset: 0,
  showing: 20,
  nextOffset: 20,
  messages: [
    {
      uid: 105,
      date: "2024-01-15T14:30:00.000Z",
      from: "...",
      to: "...",
      subject: "...",
      unread: false,
      flagged: false,
      hasAttachments: false,
      size: 12345,
    },
    // ... more ...
  ]
}
```

If no results: the text `No emails in "<folder>" matched the search criteria.`

## Details

### Sorting

Results are **always newest first** (by message internal date). IMAP `SEARCH` returns UIDs unsorted; the server sorts them by date.

### Large result sets

If the search yields more than 3000 results, only the highest 3000 UIDs are sorted by date. The tool warns:

```
"note": "Only the 3000 highest UIDs were sorted – narrow the search."
```

This prevents timeouts on very broad queries (e.g. `from: "example.com"` across the entire mailbox).

### Date format

Only accepts `YYYY-MM-DD`, e.g. `"2024-01-15"`. Other formats throw an error.

### Combining criteria

All specified criteria are combined with AND:

```
from: "alice", subject: "meeting"
→ Sender contains "alice" AND subject contains "meeting"
```

If no criteria are specified, IMAP searches for `all` (all messages).

### Additional criteria

`cc`, `larger`, `smaller` and `answered` go straight into the IMAP search (`CC`, `LARGER`, `SMALLER`, `ANSWERED`/`UNANSWERED`). Measured live on 2026-10-03: `answered: false` with `hasAttachments: true` in INBOX takes 12 ms.

`hasAttachments` does not exist in IMAP. In the candidate step, which fetches `internalDate` for sorting anyway, `BODYSTRUCTURE` is then fetched as well and filtered with `hasAttachments()`. That is the same definition as in the `hasAttachments` field of the results: a part with disposition `attachment` counts, inline images do not. `totalMatches`, `nextOffset` and paging only count messages that pass the filter. Without `hasAttachments`, no `BODYSTRUCTURE` is fetched.

With more than 3000 IMAP hits, only the 3000 highest UIDs are checked. `totalMatches` then only counts the matching messages among those 3000, and the note reads: `Only the 3000 highest of <n> UIDs were checked for attachments and sorted – narrow the search.`

If no message passes the filter, the reply is the same as for no hits.

## Implementation

```javascript
// searchCriteria(): arguments → imapflow criteria (hasAttachments deliberately left out)
const uids = await client.search(searchCriteria(args), { uid: true });

// UIDs are not chronological – so sort; hasAttachments filters in the same step
const candidates = uids.length > MAX_SORT_CANDIDATES ? uids.slice(-MAX_SORT_CANDIDATES) : uids;
const query = { uid: true, internalDate: true, ...(wantAttachments !== undefined ? { bodyStructure: true } : {}) };
for await (const msg of client.fetch(candidates.join(","), query, { uid: true })) {
  if (wantAttachments !== undefined && hasAttachments(msg.bodyStructure) !== wantAttachments) continue;
  dated.push({ uid: msg.uid, time: new Date(msg.internalDate).getTime() });
}
dated.sort((a, b) => b.time - a.time);
```

## Error handling

If the folder does not exist: IMAP error.

If date format is invalid: `Error: Invalid since date "..." – use YYYY-MM-DD.`

## Tests

`test/search.test.js`: criteria mapping, `hasAttachments` with `totalMatches` and paging, inline images only, combination with `answered` (using `test/helpers/fake-mailbox.js`).
