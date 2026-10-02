**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Tool: send_email

**Datei:** src/tools/compose.js

## Zweck

Verfasst eine neue Mail und versendet sie sofort. Kein Review.

**Verfügbar nur im Modus `full`** (`PROTON_MCP_MODE=full`). In `drafts` (Standard) und `read-only` ist das Tool nicht registriert; stattdessen `create_draft` verwenden, der Nutzer sendet den Entwurf in Proton Mail. Siehe `safety/operating-modes.md`.

## Parameter

| Parameter | Typ | Beschreibung |
|---|---|---|
| `to` | string | Empfänger, kommagetrennt (erforderlich) |
| `subject` | string | Betreff (erforderlich) |
| `body` | string | Plain-Text-Body (erforderlich) |
| `html` | string | HTML-Version des Body (optional) |
| `cc` | string | CC-Empfänger, kommagetrennt (optional) |
| `bcc` | string | BCC-Empfänger, kommagetrennt (optional) |
| `attachments` | array | Absolute Pfade zu lokalen Dateien aus erlaubten Verzeichnissen (optional) |

## Rückgabe

MCP-Text-Block:

```javascript
{
  success: true,
  messageId: "<id@bridge.local>",
  to: "alice@example.com",
  subject: "Betreff",
}
```

## Besonderheiten

- **Sofort:** Die Mail wird sofort versendet, kein Review möglich
- **Versendet-Status:** Die Bridge speichert die Mail automatisch in Sent
- **Keine Retry:** Falls der Versand scheitert, wird nicht automatisch wiederholt
- **Anhänge:** Müssen absolute lokale Pfade sein (z. B. `/path/to/file.pdf`) und in einem erlaubten Verzeichnis liegen (`PROTON_MCP_ATTACHMENT_ROOTS`, siehe `safety/attachment-roots.md`). Versteckte Dateien und Ordner (`.ssh`, `.env`) werden immer abgelehnt
- **Annotationen:** `openWorldHint: true`, nicht schreibgeschützt (siehe `safety/operating-modes.md`)

## Fehlerbehandlung

Falls kein Empfänger: Die Mail wird versendet, aber `to` ist leer.

Falls Anhang-Datei nicht existiert, gilt dieselbe Ablehnung wie bei einem nicht erlaubten Pfad (kein Hinweis, ob die Datei existiert):

```
Error: Attachment refused: /path/to/file.pdf is not an allowed attachment file. Allowed directories: ...
```

Falls ein Anhang außerhalb der erlaubten Verzeichnisse liegt oder versteckt ist: `Error: Attachment refused: ...` mit der Liste der erlaubten Verzeichnisse. Es wird nichts versendet.

Falls Versand scheitert (Bridge nicht erreichbar, etc.): Fehler-Message wird zurückgegeben. Kein automatischer Retry.

---

## English

# Tool: send_email

**File:** src/tools/compose.js

## Purpose

Composes a new message and sends it immediately. No review.

**Available only in `full` mode** (`PROTON_MCP_MODE=full`). In `drafts` (default) and `read-only` the tool is not registered; use `create_draft` instead and let the user send the draft in Proton Mail. See `safety/operating-modes.md`.

## Parameters

| Parameter | Type | Description |
|---|---|---|
| `to` | string | Recipients, comma-separated (required) |
| `subject` | string | Subject line (required) |
| `body` | string | Plain text body (required) |
| `html` | string | HTML version of the body (optional) |
| `cc` | string | CC recipients, comma-separated (optional) |
| `bcc` | string | BCC recipients, comma-separated (optional) |
| `attachments` | array | Absolute paths to local files from allowed directories (optional) |

## Return

MCP text block:

```javascript
{
  success: true,
  messageId: "<id@bridge.local>",
  to: "alice@example.com",
  subject: "Subject",
}
```

## Details

- **Immediate:** The message is sent immediately, no review possible
- **Sent status:** The Bridge automatically stores the message in Sent
- **No retry:** If sending fails, no automatic retry is attempted
- **Attachments:** Must be absolute local paths (e.g. `/path/to/file.pdf`) inside an allowed directory (`PROTON_MCP_ATTACHMENT_ROOTS`, see `safety/attachment-roots.md`). Hidden files and folders (`.ssh`, `.env`) are always refused
- **Annotations:** `openWorldHint: true`, not read-only (see `safety/operating-modes.md`)

## Error handling

If no recipient: the message is sent, but `to` is empty.

If attachment file does not exist, the same refusal applies as for a path that is not allowed (no hint whether the file exists):

```
Error: Attachment refused: /path/to/file.pdf is not an allowed attachment file. Allowed directories: ...
```

If an attachment is outside the allowed directories or hidden: `Error: Attachment refused: ...` with the list of allowed directories. Nothing is sent.

If sending fails (Bridge unreachable, etc.): error message is returned. No automatic retry.
