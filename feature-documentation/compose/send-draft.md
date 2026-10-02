**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Tool: send_draft

**Datei:** src/tools/compose.js

## Zweck

Versendet einen Entwurf und entfernt ihn aus den Entwürfen.

**Verfügbar nur im Modus `full`** (`PROTON_MCP_MODE=full`). In `drafts` (Standard) und `read-only` ist das Tool nicht registriert; der Nutzer prüft und sendet den Entwurf dann in Proton Mail. Siehe `safety/operating-modes.md`. Annotation: `openWorldHint: true`.

## Parameter

| Parameter | Typ | Beschreibung |
|---|---|---|
| `uid` | number | UID des Entwurfs (von `list_drafts`) |

## Rückgabe

MCP-Text-Block:

```javascript
{
  success: true,
  messageId: "<id@bridge.local>",
  to: "alice@example.com",
  cc: "bob@example.com",
  bcc: "",
  subject: "Betreff",
}
```

Falls die alte Entwurf-UID nicht gelöscht werden konnte:

```javascript
{
  success: true,
  messageId: "<id@bridge.local>",
  to: "alice@example.com",
  cc: "bob@example.com",
  bcc: "",
  subject: "Betreff",
  warning: "Sent, but the draft UID 105 could not be removed (...). Do not send it again – delete it with delete_draft.",
}
```

## Verhalten

1. Entwurf mit UID laden
2. SMTP-Versand (via `sendMail()`)
3. **Entwurf löschen** (optional; falls fehlschlag, bleibt Warnung, aber Mail ist versendet)

Die Mail ist an diesem Punkt versendet. Ein fehlgeschlagenes Cleanup wird nicht als fehlgeschlagener Versand behandelt.

## Fehlerbehandlung

Falls Entwurf-UID nicht existiert: IMAP-Fehler.

Falls Entwurf-UID keine Empfänger hat:

```
Error: Draft UID 105 has no recipients – add them with update_draft first.
```

Falls Versand scheitert: Standard-SMTP-Fehler (keine Retry).

Falls das Löschen des Entwurfs scheitert: `warning` im Response, aber Mail ist versendet.

---

## English

# Tool: send_draft

**File:** src/tools/compose.js

## Purpose

Sends a draft and removes it from drafts.

**Available only in `full` mode** (`PROTON_MCP_MODE=full`). In `drafts` (default) and `read-only` the tool is not registered; the user then reviews and sends the draft in Proton Mail. See `safety/operating-modes.md`. Annotation: `openWorldHint: true`.

## Parameters

| Parameter | Type | Description |
|---|---|---|
| `uid` | number | UID of the draft (from `list_drafts`) |

## Return

MCP text block:

```javascript
{
  success: true,
  messageId: "<id@bridge.local>",
  to: "alice@example.com",
  cc: "bob@example.com",
  bcc: "",
  subject: "Subject",
}
```

If the old draft UID could not be deleted:

```javascript
{
  success: true,
  messageId: "<id@bridge.local>",
  to: "alice@example.com",
  cc: "bob@example.com",
  bcc: "",
  subject: "Subject",
  warning: "Sent, but the draft UID 105 could not be removed (...). Do not send it again – delete it with delete_draft.",
}
```

## Behavior

1. Load draft with UID
2. SMTP send (via `sendMail()`)
3. **Delete draft** (optional; if it fails, warning remains, but mail is sent)

The message is sent at this point. A failed cleanup is not treated as a failed send.

## Error handling

If draft UID does not exist: IMAP error.

If draft UID has no recipients:

```
Error: Draft UID 105 has no recipients – add them with update_draft first.
```

If sending fails: standard SMTP error (no retry).

If deleting the draft fails: `warning` in response, but mail is sent.
