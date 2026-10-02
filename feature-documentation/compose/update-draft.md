**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Tool: update_draft

**Datei:** src/tools/compose.js

## Zweck

Ändert einen gespeicherten Entwurf: Empfänger, Betreff, Body, HTML, Anhänge. Nur die angegebenen Felder werden ersetzt; nicht angegebene bleiben unverändert.

## Parameter

| Parameter | Typ | Beschreibung |
|---|---|---|
| `uid` | number | UID des Entwurfs (von `list_drafts`) |
| `to` | string | Neue Empfänger (optional) |
| `cc` | string | Neue CC-Empfänger (optional) |
| `bcc` | string | Neue BCC-Empfänger (optional) |
| `subject` | string | Neuer Betreff (optional) |
| `body` | string | Neuer Body (ersetzt komplett, auch Zitate) |
| `html` | string | Neuer HTML-Body (optional; leerer String entfernt HTML) |
| `addAttachments` | array | Pfade zu neuen Anhängen (optional) |
| `removeAttachments` | array | Indizes zu löschender Anhänge (optional) |

## Rückgabe

MCP-Text-Block:

```javascript
{
  success: true,
  draftUid: 150,  // neue UID (da Entwurf ersetzt wird)
  folder: "Drafts",
  to: "alice@example.com",
  cc: "bob@example.com",
  bcc: "",
  subject: "Updated subject",
  inReplyTo: "<original-id@example.com>",
  attachments: ["file1.pdf"],
  replacedUid: 105,  // alte UID
  hint: "...",
}
```

Falls die alte UID gelöscht werden konnte:
```javascript
// Ohne warning
```

Falls Löschen der alten Entwurf-UID fehlschlägt:
```javascript
{
  ...,
  warning: "New draft saved, but the old draft UID 105 could not be deleted (...). Delete it with delete_draft.",
}
```

## Verhalten

### Append-then-Delete-Strategie

1. Einen **neuen** Entwurf mit den aktualisierten Werten hinzufügen
2. Den **alten** Entwurf löschen (optional; falls fehlschlag, bleibt der alte)

Dies gewährleistet, dass falls etwas schief geht, mindestens der neue Entwurf existiert.

### Body-Handling

Ein neuer `body` **ersetzt den gesamten Text, einschließlich Zitate**. Wenn HTML nicht angegeben ist und der alte Entwurf HTML hatte:

- Falls `body` neu: HTML wird regeneriert (Plain Text → HTML via `textToHtml()`)
- Falls `html` explizit angegeben: wird das benutzt

Ein leerer String `html: ""` **entfernt** die HTML-Version.

### Inline-Bilder

Falls `body` oder `html` neu, werden alte Inline-Bilder (nur im alten HTML referenziert) entfernt.

### Anhänge

- **Behalten:** Alte Anhänge, die nicht in `removeAttachments` aufgelistet sind
- **Entfernen:** Mit Index aus `removeAttachments`
- **Hinzufügen:** Mit `addAttachments` (absolute Pfade)
- **Signaturen:** Werden nicht übernommen (wie in `create_draft`)

## Fehlerbehandlung

Falls Entwurf-UID nicht existiert: IMAP-Fehler.

Falls Anhang-Datei nicht existiert: `Error: Attachment file not found: ...`

Falls `cc: ""` oder `bcc: ""`: Diese Felder werden gelöscht (leer).

---

## English

# Tool: update_draft

**File:** src/tools/compose.js

## Purpose

Changes a saved draft: recipients, subject, body, HTML, attachments. Only specified fields are replaced; unspecified fields remain unchanged.

## Parameters

| Parameter | Type | Description |
|---|---|---|
| `uid` | number | UID of the draft (from `list_drafts`) |
| `to` | string | New recipients (optional) |
| `cc` | string | New CC recipients (optional) |
| `bcc` | string | New BCC recipients (optional) |
| `subject` | string | New subject (optional) |
| `body` | string | New body (replaces completely, including quotes) |
| `html` | string | New HTML body (optional; empty string removes HTML) |
| `addAttachments` | array | Paths to new attachments (optional) |
| `removeAttachments` | array | Indexes of attachments to remove (optional) |

## Return

MCP text block:

```javascript
{
  success: true,
  draftUid: 150,  // new UID (since draft is replaced)
  folder: "Drafts",
  to: "alice@example.com",
  cc: "bob@example.com",
  bcc: "",
  subject: "Updated subject",
  inReplyTo: "<original-id@example.com>",
  attachments: ["file1.pdf"],
  replacedUid: 105,  // old UID
  hint: "...",
}
```

If old draft UID was deleted:
```javascript
// without warning
```

If deleting old draft UID fails:
```javascript
{
  ...,
  warning: "New draft saved, but the old draft UID 105 could not be deleted (...). Delete it with delete_draft.",
}
```

## Behavior

### Append-then-delete strategy

1. Add a **new** draft with the updated values
2. Delete the **old** draft (optional; if it fails, the old one remains)

This ensures that if something goes wrong, at least the new draft exists.

### Body handling

A new `body` **replaces the entire text, including quotes**. If HTML is not specified and the old draft had HTML:

- If `body` is new: HTML is regenerated (plain text → HTML via `textToHtml()`)
- If `html` is explicitly specified: that is used

An empty string `html: ""` **removes** the HTML version.

### Inline images

If `body` or `html` is new, old inline images (referenced only in old HTML) are removed.

### Attachments

- **Keep:** Old attachments not listed in `removeAttachments`
- **Remove:** By index from `removeAttachments`
- **Add:** Via `addAttachments` (absolute paths)
- **Signatures:** Are not carried over (as in `create_draft`)

## Error handling

If draft UID does not exist: IMAP error.

If attachment file does not exist: `Error: Attachment file not found: ...`

If `cc: ""` or `bcc: ""`: these fields are deleted (emptied).
