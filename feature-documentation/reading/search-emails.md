**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Tool: search_emails

**Datei:** src/tools/mailbox.js

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

Falls kein Ergebnis: `totalMatches: 0, showing: 0, messages: []`.

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

## Implementierung

```javascript
// IMAP SEARCH mit Kriterien
const criteria = {};
if (from) criteria.from = from;
if (to) criteria.to = to;
// ... weitere ...
if (Object.keys(criteria).length === 0) criteria.all = true;

const uids = await client.search(criteria, { uid: true });

// UIDs sind nicht chronologisch – daher sortieren
const candidates = uids.length > MAX_SORT_CANDIDATES ? uids.slice(-MAX_SORT_CANDIDATES) : uids;
const dated = [];
for await (const msg of client.fetch(candidates.join(","), { uid: true, internalDate: true })) {
  dated.push({ uid: msg.uid, time: new Date(msg.internalDate).getTime() });
}
dated.sort((a, b) => b.time - a.time);
```

## Fehlerbehandlung

Falls der Ordner nicht existiert: IMAP-Fehler.

Falls Datums-Format ungültig: `Error: Invalid since date "..." – use YYYY-MM-DD.`

---

## English

# Tool: search_emails

**File:** src/tools/mailbox.js

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

If no results: `totalMatches: 0, showing: 0, messages: []`.

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

## Implementation

```javascript
// IMAP SEARCH with criteria
const criteria = {};
if (from) criteria.from = from;
if (to) criteria.to = to;
// ... more ...
if (Object.keys(criteria).length === 0) criteria.all = true;

const uids = await client.search(criteria, { uid: true });

// UIDs are not chronological – so sort by date
const candidates = uids.length > MAX_SORT_CANDIDATES ? uids.slice(-MAX_SORT_CANDIDATES) : uids;
const dated = [];
for await (const msg of client.fetch(candidates.join(","), { uid: true, internalDate: true })) {
  dated.push({ uid: msg.uid, time: new Date(msg.internalDate).getTime() });
}
dated.sort((a, b) => b.time - a.time);
```

## Error handling

If the folder does not exist: IMAP error.

If date format is invalid: `Error: Invalid since date "..." – use YYYY-MM-DD.`
