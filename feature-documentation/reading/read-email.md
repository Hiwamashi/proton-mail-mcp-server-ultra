**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Tool: read_email

**Datei:** src/tools/mailbox.js

## Zweck

Liest eine Mail komplett: Header (From, To, Cc, Bcc, Reply-To, Subject, Message-ID, Date), aufbereiteter Body und nummerierte Anhängsliste.

## Parameter

| Parameter | Typ | Default | Beschreibung |
|---|---|---|---|
| `uid` | number | – | UID der Mail (von `list_emails` oder `search_emails`) |
| `folder` | string | `"INBOX"` | Ordner, in dem die Mail liegt |
| `format` | string | `"auto"` | `"auto"`: Text, HTML-Fallback. `"text"`: nur Textpart. `"html"`: HTML zu Text. `"raw_html"`: unverarbeitetes HTML |
| `includeLinks` | boolean | `false` | Link-URLs inline zeigen (`<url>`) – `true` ist ausführlicher |
| `stripQuoted` | boolean | `false` | Zitat-Historie unter dem neuen Content entfernen |
| `offset` | number | `0` | Startposition im Body (für Paging bei langen Mails) |
| `maxChars` | number | `20000` | Max. Zeichen des Body (min. 500, max. 100000) |
| `markAsRead` | boolean | `false` | Mail danach als gelesen markieren (im Modus `read-only` nicht erlaubt) |

## Rückgabe

MCP-Text-Block (mehrzeilig):

```
UID: 105 | Folder: INBOX | Flags: \Seen \Flagged
From: Absender <absender@example.com>
To: du@proton.me
Cc: cc@example.com
Bcc: bcc@example.com
Reply-To: reply-to@example.com
Date: 2024-01-15T14:30:00.000Z
Subject: Betreff der Mail
Message-ID: <id@example.com>
In-Reply-To: <parent-id@example.com>
Attachments (use get_attachment with the index):
  [0] document.pdf (application/pdf, 125 KB, inline, signature)
  [1] image.png (image/png, 45 KB)
Body: chars 0–15234 of 45678, source: html – call read_email again with offset=15234 for the rest
---
[Body-Text hier]
```

Falls keine Anhänge: Die Zeile wird nicht angezeigt.

Falls Body leer: `Body: empty (source: html)`.

## Besonderheiten

### Body-Format

Nach dem Body wird angezeigt:
- `chars X–Y of Z` – Bereichs-Info für Paging
- `source: text | html | raw_html | none` – Woher der Body kam
- `quoted history removed` – Falls `stripQuoted: true` etwas entfernt hat
- `– call read_email again with offset=...` – Falls mehr Content folgt

### Anhänge

Jede Zeile zeigt:
- `[index]` – Nummer für `get_attachment`
- `filename` – Dateiname oder `(unnamed <mime-type>)`
- `content type, size` – MIME-Typ und formatierte Größe
- Tags: `inline`, `signature` – Falls vorhanden

### markAsRead

Falls `true` und die Mail war ungelesen (`\Seen`-Flag fehlte), wird es gesetzt. Das `Flags`-Feld in der Ausgabe aktualisiert sich entsprechend.

**Im Modus `read-only` wird `markAsRead: true` abgelehnt**, weil das Setzen des Flags das Postfach ändert. Das Tool wirft den Fehler, bevor es das Postfach berührt, und ändert nichts:

```
Marking an email as read is not available in `read-only` mode (markAsRead was ignored and nothing was changed). Read it without markAsRead.
```

Beschreibung von `read_email` und des Parameters `markAsRead` passen sich dem Modus an (`readEmailDescription`, `markAsReadDescription` in `src/modes.js`). Das Tool ist in allen Modi verfügbar; siehe `safety/operating-modes.md`.

### BODY.PEEK

Das Tool nutzt intern `BODY.PEEK`, sodass das Lesen das `\Seen`-Flag **nicht** setzt, außer wenn `markAsRead: true`.

## Implementierung

```javascript
// Fetch mit BODY.PEEK (implizit in imapflow)
const { parsed, flags } = await fetchParsed(client, uid, folder);
let { body, source } = extractBody(parsed, { format, includeLinks });

// Zitate entfernen (optional)
if (strip && format !== "raw_html") {
  ({ text: body, removed: quotedRemoved } = stripQuoted(body));
}

// Paging
const page = paginate(body, offset, maxChars);

// Markieren (optional)
if (markAsRead && !flags.includes("\\Seen")) {
  await client.messageFlagsAdd(`${uid}`, ["\\Seen"], { uid: true });
  flags.push("\\Seen");
}
```

## Fehlerbehandlung

Falls UID nicht existiert: `NotFoundError` mit Meldung

```
No message with UID 999 in folder "INBOX".
UIDs are per folder – check the folder name.
```

Falls ungültiges Format: wird nicht explizit validiert, aber der Body könnte leer sein.

Falls `offset ≥ body.length`: `nextOffset: null` (keine weiteren Daten).

---

## English

# Tool: read_email

**File:** src/tools/mailbox.js

## Purpose

Reads a message completely: headers (From, To, Cc, Bcc, Reply-To, Subject, Message-ID, Date), processed body, and numbered attachment list.

## Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `uid` | number | – | UID of the message (from `list_emails` or `search_emails`) |
| `folder` | string | `"INBOX"` | Folder containing the message |
| `format` | string | `"auto"` | `"auto"`: text, HTML fallback. `"text"`: text part only. `"html"`: HTML to text. `"raw_html"`: unprocessed HTML |
| `includeLinks` | boolean | `false` | Show link URLs inline (`<url>`) – `true` is more verbose |
| `stripQuoted` | boolean | `false` | Remove quoted reply history below new content |
| `offset` | number | `0` | Start position in body (for paging long messages) |
| `maxChars` | number | `20000` | Max characters of body (min 500, max 100000) |
| `markAsRead` | boolean | `false` | Mark message as read afterwards (not allowed in `read-only` mode) |

## Return

MCP text block (multiline):

```
UID: 105 | Folder: INBOX | Flags: \Seen \Flagged
From: Sender <sender@example.com>
To: you@proton.me
Cc: cc@example.com
Bcc: bcc@example.com
Reply-To: reply-to@example.com
Date: 2024-01-15T14:30:00.000Z
Subject: Message subject
Message-ID: <id@example.com>
In-Reply-To: <parent-id@example.com>
Attachments (use get_attachment with the index):
  [0] document.pdf (application/pdf, 125 KB, inline, signature)
  [1] image.png (image/png, 45 KB)
Body: chars 0–15234 of 45678, source: html – call read_email again with offset=15234 for the rest
---
[Body text here]
```

If no attachments: the line is not shown.

If body is empty: `Body: empty (source: html)`.

## Details

### Body format

After the body is shown:
- `chars X–Y of Z` – range info for paging
- `source: text | html | raw_html | none` – where the body came from
- `quoted history removed` – if `stripQuoted: true` removed something
- `– call read_email again with offset=...` – if more content follows

### Attachments

Each line shows:
- `[index]` – number for `get_attachment`
- `filename` – filename or `(unnamed <mime-type>)`
- `content type, size` – MIME type and formatted size
- Tags: `inline`, `signature` – if present

### markAsRead

If `true` and the message was unread (no `\Seen` flag), it is set. The `Flags` field in the output is updated accordingly.

**In `read-only` mode `markAsRead: true` is refused**, because setting the flag changes the mailbox. The tool throws the error before touching the mailbox and changes nothing:

```
Marking an email as read is not available in `read-only` mode (markAsRead was ignored and nothing was changed). Read it without markAsRead.
```

The description of `read_email` and of the `markAsRead` parameter adapt to the mode (`readEmailDescription`, `markAsReadDescription` in `src/modes.js`). The tool is available in all modes; see `safety/operating-modes.md`.

### BODY.PEEK

The tool internally uses `BODY.PEEK`, so reading does **not** set the `\Seen` flag, unless `markAsRead: true`.

## Implementation

```javascript
// Fetch with BODY.PEEK (implicit in imapflow)
const { parsed, flags } = await fetchParsed(client, uid, folder);
let { body, source } = extractBody(parsed, { format, includeLinks });

// Remove quotes (optional)
if (strip && format !== "raw_html") {
  ({ text: body, removed: quotedRemoved } = stripQuoted(body));
}

// Pagination
const page = paginate(body, offset, maxChars);

// Mark as read (optional)
if (markAsRead && !flags.includes("\\Seen")) {
  await client.messageFlagsAdd(`${uid}`, ["\\Seen"], { uid: true });
  flags.push("\\Seen");
}
```

## Error handling

If UID does not exist: `NotFoundError` with message

```
No message with UID 999 in folder "INBOX".
UIDs are per folder – check the folder name.
```

If invalid format: not explicitly validated, but body could be empty.

If `offset ≥ body.length`: `nextOffset: null` (no more data).
