**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Tool: reply_to_email

**Datei:** src/tools/compose.js

## Zweck

Antwortet auf eine Mail und versendet sie sofort. Setzt automatisch Empfänger, Betreff und Zitat.

## Parameter

| Parameter | Typ | Default | Beschreibung |
|---|---|---|---|
| `uid` | number | – | UID der Mail, auf die geantwortet wird |
| `folder` | string | `"INBOX"` | Ordner der Original-Mail |
| `body` | string | – | Antwort-Text (ohne Zitat) |
| `html` | string | – | HTML-Version der Antwort (optional) |
| `replyAll` | boolean | `false` | Allen antworten (To + Cc) |
| `quoteOriginal` | boolean | `true` | Zitat der Original-Mail anhängen |
| `attachments` | array | – | Absolute Pfade zu lokalen Dateien (optional) |

## Rückgabe

MCP-Text-Block:

```javascript
{
  success: true,
  messageId: "<id@bridge.local>",
  to: "alice@example.com",
  cc: "bob@example.com",
  subject: "Re: Betreff",
}
```

## Verhalten

1. **Original laden:** Die Original-Mail wird aus `folder` mit UID `uid` geladen
2. **Empfänger:** Mit `replyRecipients(original, { replyAll, selfAddresses })` berechnet
3. **Betreff:** Mit `replySubject(original.subject)` erzeugt
4. **Threading-Header:** `Message-ID`, `In-Reply-To`, `References` werden gesetzt
5. **Zitat:** Falls `quoteOriginal: true`, wird das Original-Body nach dem neuen Text angehängt
6. **Sofort versendet:** Kein Review

## Besonderheiten

- **Automatische Empfänger:** Falls nur `body` übergeben wird, werden `to`/`cc` von der Original-Mail berechnet
- **Manuelle Override:** Mit `to`, `cc`, `subject` können die automatischen Werte überschrieben werden
- **quoteOriginal:** Falls `false`, wird nur der neue Text versendet
- **replyAll:** Falls `true`, werden Cc-Empfänger mitgezogen (außer Selbst)

## Fehlerbehandlung

Falls Original-Mail nicht existiert:

```
Error: No message with UID 999 in folder "INBOX".
UIDs are per folder – check the folder name.
```

Falls keine Empfänger bestimmt werden können (Original-Mail hat kein From, To, Reply-To):

```
Error: Could not determine any recipient for the reply.
```

Falls Anhang nicht existiert: Error (siehe `send_email`).

---

## English

# Tool: reply_to_email

**File:** src/tools/compose.js

## Purpose

Replies to a message and sends it immediately. Automatically sets recipients, subject and quote.

## Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `uid` | number | – | UID of the message to reply to |
| `folder` | string | `"INBOX"` | Folder of the original message |
| `body` | string | – | Reply text (without quote) |
| `html` | string | – | HTML version of the reply (optional) |
| `replyAll` | boolean | `false` | Reply to all (To + Cc) |
| `quoteOriginal` | boolean | `true` | Append quote of original message |
| `attachments` | array | – | Absolute paths to local files (optional) |

## Return

MCP text block:

```javascript
{
  success: true,
  messageId: "<id@bridge.local>",
  to: "alice@example.com",
  cc: "bob@example.com",
  subject: "Re: Subject",
}
```

## Behavior

1. **Load original:** The original message is loaded from `folder` with UID `uid`
2. **Recipients:** Calculated with `replyRecipients(original, { replyAll, selfAddresses })`
3. **Subject:** Created with `replySubject(original.subject)`
4. **Threading headers:** `Message-ID`, `In-Reply-To`, `References` are set
5. **Quote:** If `quoteOriginal: true`, the original body is appended after the new text
6. **Sent immediately:** No review

## Details

- **Automatic recipients:** If only `body` is passed, `to`/`cc` are calculated from the original message
- **Manual override:** `to`, `cc`, `subject` can override the automatic values
- **quoteOriginal:** If `false`, only the new text is sent
- **replyAll:** If `true`, Cc recipients are included (except self)

## Error handling

If original message does not exist:

```
Error: No message with UID 999 in folder "INBOX".
UIDs are per folder – check the folder name.
```

If no recipients can be determined (original message has no From, To, Reply-To):

```
Error: Could not determine any recipient for the reply.
```

If attachment does not exist: error (see `send_email`).
