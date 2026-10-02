**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Tool: create_draft

**Datei:** src/tools/compose.js

## Zweck

Speichert eine Mail als Entwurf, ohne sie zu versenden. Der Entwurf ist sichtbar in Proton Mail unter Entwürfe und kann dort weiterbearbeitet werden.

## Parameter

| Parameter | Typ | Beschreibung |
|---|---|---|
| `to` | string | Empfänger (optional für Antwort-Entwürfe) |
| `subject` | string | Betreff (optional für Antwort-Entwürfe) |
| `body` | string | Plain-Text-Body (erforderlich) |
| `html` | string | HTML-Version (optional) |
| `cc` | string | CC-Empfänger (optional) |
| `bcc` | string | BCC-Empfänger (optional) |
| `attachments` | array | Absolute Pfade zu lokalen Dateien (optional) |
| `replyToUid` | number | UID der Original-Mail (optional, für Antwort-Entwürfe) |
| `replyFolder` | string | Ordner der Original-Mail (Standard: `"INBOX"`) |
| `replyAll` | boolean | Alle antworten (Standard: `false`) |
| `quoteOriginal` | boolean | Zitat anhängen (Standard: `true`) |

## Rückgabe

MCP-Text-Block:

```javascript
{
  success: true,
  draftUid: 5,
  folder: "Drafts",
  to: "alice@example.com",
  cc: "bob@example.com",
  bcc: "",
  subject: "Re: Betreff",
  inReplyTo: "<original-id@example.com>",
  attachments: ["file1.pdf", "file2.docx"],
  hint: "The draft is visible in Proton Mail under Drafts. Use send_draft to send it or update_draft to change it.",
}
```

## Verhalten

### Neue Entwürfe

Einfach `to`, `subject`, `body` übergeben. Der Entwurf wird im Drafts-Ordner gespeichert.

### Antwort-Entwürfe

Übergeben Sie `replyToUid` und optional `replyFolder`. Dann werden automatisch berechnet:
- `to` und `cc` (per `replyRecipients()`)
- `subject` (per `replySubject()`)
- `inReplyTo` und `references` (Threading)
- Zitat (falls `quoteOriginal: true`)

Diese Werte können explizit mit `to`, `subject` überschrieben werden.

### Append-then-Delete-Strategie

Der Entwurf wird direkt mit `append()` zum Drafts-Ordner hinzugefügt. Falls Fehler später beim Aktualisieren auftreten, bleibt zumindest eine Kopie.

Falls der Server kein UIDPLUS unterstützt, wird die UID durch Suche nach der Message-ID bestimmt.

## Besonderheiten

- **Sichtbar in Proton:** Der Entwurf taucht sofort in der Proton-Web-UI oder dem Client auf
- **BCC für Entwürfe:** Der BCC-Header wird gespeichert (ungewöhnlich für Entwürfe, wird aber beim Versenden verwendet)
- **Signaturen:** Neue Entwürfe erhalten keine Signatur; das wird vom Client übernommen

## Fehlerbehandlung

Falls Original-Mail nicht existiert (bei Antwort-Entwürfen):

```
Error: No message with UID 999 in folder "INBOX".
```

Falls kein Ordner zum Speichern gefunden wird: IMAP-Fehler.

Falls Anhang nicht existiert: `Error: Attachment file not found: ...`

---

## English

# Tool: create_draft

**File:** src/tools/compose.js

## Purpose

Saves a message as a draft without sending it. The draft is visible in Proton Mail under Drafts and can be edited there.

## Parameters

| Parameter | Type | Description |
|---|---|---|
| `to` | string | Recipients (optional for reply drafts) |
| `subject` | string | Subject line (optional for reply drafts) |
| `body` | string | Plain text body (required) |
| `html` | string | HTML version (optional) |
| `cc` | string | CC recipients (optional) |
| `bcc` | string | BCC recipients (optional) |
| `attachments` | array | Absolute paths to local files (optional) |
| `replyToUid` | number | UID of original message (optional, for reply drafts) |
| `replyFolder` | string | Folder of original message (default: `"INBOX"`) |
| `replyAll` | boolean | Reply to all (default: `false`) |
| `quoteOriginal` | boolean | Append quote (default: `true`) |

## Return

MCP text block:

```javascript
{
  success: true,
  draftUid: 5,
  folder: "Drafts",
  to: "alice@example.com",
  cc: "bob@example.com",
  bcc: "",
  subject: "Re: Subject",
  inReplyTo: "<original-id@example.com>",
  attachments: ["file1.pdf", "file2.docx"],
  hint: "The draft is visible in Proton Mail under Drafts. Use send_draft to send it or update_draft to change it.",
}
```

## Behavior

### New drafts

Simply pass `to`, `subject`, `body`. The draft is saved in the Drafts folder.

### Reply drafts

Pass `replyToUid` and optionally `replyFolder`. Then automatically calculated:
- `to` and `cc` (via `replyRecipients()`)
- `subject` (via `replySubject()`)
- `inReplyTo` and `references` (threading)
- Quote (if `quoteOriginal: true`)

These values can be explicitly overridden with `to`, `subject`.

### Append-then-delete strategy

The draft is directly added to the Drafts folder with `append()`. If errors occur later during update, at least a copy remains.

If the server does not support UIDPLUS, the UID is determined by searching for the Message-ID.

## Details

- **Visible in Proton:** The draft appears immediately in the Proton Web UI or client
- **BCC for drafts:** The BCC header is saved (unusual for drafts, but used when sending)
- **Signatures:** New drafts do not receive a signature; that is handled by the client

## Error handling

If original message does not exist (for reply drafts):

```
Error: No message with UID 999 in folder "INBOX".
```

If no folder found to save: IMAP error.

If attachment does not exist: `Error: Attachment file not found: ...`
