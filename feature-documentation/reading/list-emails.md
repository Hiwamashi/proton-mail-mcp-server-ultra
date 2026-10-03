**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Tool: list_emails

**Datei:** src/tools/mailbox.js

## Zweck

Zählt die zuletzt in einen Ordner gekommenen Mails auf; jede Seite ist nach Datum sortiert, neueste zuerst. Mit `offset` kann man blättern.

**Reihenfolge:** Maßgeblich ist die Ankunft im Ordner (Sequenznummern), nicht das Sendedatum. Eine alte Mail, die gerade in die INBOX verschoben wurde, steht auf der ersten Seite; in „All Mail“ wirkt die Reihenfolge dadurch gemischt. Für Datumsreihenfolge über einen ganzen Ordner gibt es `search_emails` (z. B. mit `since`). Die Tool-Beschreibung sagt das dem Agenten.

## Parameter

| Parameter | Typ | Default | Beschreibung |
|---|---|---|---|
| `folder` | string | `"INBOX"` | Ordner-Pfad (wie von `list_folders` geliefert) |
| `limit` | number | `20` | Anzahl der Mails pro Seite (max. 100) |
| `offset` | number | `0` | Überspringen Sie diese vielen der neuesten Mails (für Paging) |

## Rückgabe

MCP-Text-Block mit Struktur:

```javascript
{
  folder: "INBOX",
  total: 145,
  offset: 0,
  showing: 20,
  nextOffset: 20,  // für nächste Seite, oder null falls am Ende
  messages: [
    {
      uid: 105,
      date: "2024-01-15T14:30:00.000Z",
      from: "Absender Name <absender@example.com>",
      to: "du@proton.me",
      subject: "Betreff der Mail",
      unread: false,
      flagged: false,
      hasAttachments: true,
      size: 125000,
    },
    // ... mehr Mails ...
  ]
}
```

## Besonderheiten

- **Neuste zuerst je Seite:** Die Mails einer Seite sind nach Datum sortiert; welche Mails auf einer Seite landen, bestimmt die Ankunft im Ordner
- **UIDs:** Eindeutig nur innerhalb dieses Ordners. Zum Lesen: `read_email` mit `folder` und `uid` aufrufen
- **nextOffset:** Falls `null`, keine weiteren Mails vorhanden
- **Pagination:** `offset: 20, limit: 20` zeigt Mails 20–39; `nextOffset: 40` für die nächsten Mails

## Implementierung

```javascript
// IMAP: Fetch die neuesten Mails rückwärts
const total = client.mailbox.exists;
const start = Math.max(1, total - offset - limit + 1);
const end = total - offset;
for await (const msg of client.fetch(`${start}:${end}`, SUMMARY_FETCH)) {
  // Zusammenfassung erzeugen
}
// Nach Datum sortieren
messages.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
```

## Fehlerbehandlung

Falls der Ordner nicht existiert oder keine Berechtigung: IMAP-Fehler von der Bridge.

Falls `offset ≥ total`: Das Tool gibt einfach `showing: 0, messages: []` zurück, kein Fehler.

---

## English

# Tool: list_emails

**File:** src/tools/mailbox.js

## Purpose

Lists the emails most recently added to a folder; each page is sorted by date, newest first. Use `offset` to page through them.

**Order:** What counts is the arrival in the folder (sequence numbers), not the sent date. An old message just moved into INBOX appears on the first page; in "All Mail" the order therefore looks mixed. For date order across a whole folder use `search_emails` (e.g. with `since`). The tool description tells the agent so.

## Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `folder` | string | `"INBOX"` | Folder path (as returned by `list_folders`) |
| `limit` | number | `20` | Number of messages per page (max 100) |
| `offset` | number | `0` | Skip this many of the newest messages (for paging) |

## Return

MCP text block with structure:

```javascript
{
  folder: "INBOX",
  total: 145,
  offset: 0,
  showing: 20,
  nextOffset: 20,  // for next page, or null if at end
  messages: [
    {
      uid: 105,
      date: "2024-01-15T14:30:00.000Z",
      from: "Sender Name <sender@example.com>",
      to: "you@proton.me",
      subject: "Message subject",
      unread: false,
      flagged: false,
      hasAttachments: true,
      size: 125000,
    },
    // ... more messages ...
  ]
}
```

## Details

- **Newest first per page:** The messages of a page are sorted by date; which messages land on a page is decided by arrival in the folder
- **UIDs:** Unique only within this folder. To read: call `read_email` with `folder` and `uid`
- **nextOffset:** If `null`, no more messages available
- **Pagination:** `offset: 20, limit: 20` shows messages 20–39; `nextOffset: 40` for the next batch

## Implementation

```javascript
// IMAP: Fetch the newest messages backwards
const total = client.mailbox.exists;
const start = Math.max(1, total - offset - limit + 1);
const end = total - offset;
for await (const msg of client.fetch(`${start}:${end}`, SUMMARY_FETCH)) {
  // Create summary
}
// Sort by date
messages.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
```

## Error handling

If the folder does not exist or access is denied: IMAP error from the Bridge.

If `offset ≥ total`: The tool simply returns `showing: 0, messages: []`, no error.
