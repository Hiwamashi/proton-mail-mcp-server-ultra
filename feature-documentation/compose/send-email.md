**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Tool: send_email

**Datei:** src/tools/compose.js

## Zweck

Verfasst eine neue Mail und versendet sie sofort. Kein Review.

## Parameter

| Parameter | Typ | Beschreibung |
|---|---|---|
| `to` | string | Empfänger, kommagetrennt (erforderlich) |
| `subject` | string | Betreff (erforderlich) |
| `body` | string | Plain-Text-Body (erforderlich) |
| `html` | string | HTML-Version des Body (optional) |
| `cc` | string | CC-Empfänger, kommagetrennt (optional) |
| `bcc` | string | BCC-Empfänger, kommagetrennt (optional) |
| `attachments` | array | Absolute Pfade zu lokalen Dateien (optional) |

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
- **Anhänge:** Müssen absolute lokale Pfade sein (z. B. `/path/to/file.pdf`)

## Fehlerbehandlung

Falls kein Empfänger: Die Mail wird versendet, aber `to` ist leer.

Falls Anhang-Datei nicht existiert:

```
Error: Attachment file not found: /path/to/file.pdf
```

Falls Versand scheitert (Bridge nicht erreichbar, etc.): Fehler-Message wird zurückgegeben. Kein automatischer Retry.

---

## English

# Tool: send_email

**File:** src/tools/compose.js

## Purpose

Composes a new message and sends it immediately. No review.

## Parameters

| Parameter | Type | Description |
|---|---|---|
| `to` | string | Recipients, comma-separated (required) |
| `subject` | string | Subject line (required) |
| `body` | string | Plain text body (required) |
| `html` | string | HTML version of the body (optional) |
| `cc` | string | CC recipients, comma-separated (optional) |
| `bcc` | string | BCC recipients, comma-separated (optional) |
| `attachments` | array | Absolute paths to local files (optional) |

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
- **Attachments:** Must be absolute local paths (e.g. `/path/to/file.pdf`)

## Error handling

If no recipient: the message is sent, but `to` is empty.

If attachment file does not exist:

```
Error: Attachment file not found: /path/to/file.pdf
```

If sending fails (Bridge unreachable, etc.): error message is returned. No automatic retry.
