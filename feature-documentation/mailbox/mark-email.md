**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Tool: mark_email

**Datei:** src/tools/mailbox.js

## Zweck

Setzt oder entfernt IMAP-Flags einer Mail: gelesen/ungelesen, markiert/unmarkiert.

## Parameter

| Parameter | Typ | Beschreibung |
|---|---|---|
| `uid` | number | UID der Mail |
| `folder` | string | Ordner (Standard: `"INBOX"`) |
| `action` | string | `"read"`, `"unread"`, `"flag"`, oder `"unflag"` |

## Rückgabe

MCP-Text-Block:

```javascript
{
  success: true,
  uid: 105,
  action: "read",
}
```

## Aktion-Mapping

| Aktion | IMAP-Flag | Bedeutung |
|---|---|---|
| `"read"` | `\Seen` | Setzt das Flag (Mail sichtbar als gelesen) |
| `"unread"` | `\Seen` | Entfernt das Flag (Mail sichtbar als ungelesen) |
| `"flag"` | `\Flagged` | Setzt das Flag (in Proton: mit Stern markiert) |
| `"unflag"` | `\Flagged` | Entfernt das Flag (Stern entfernt) |

## Besonderheiten

Das Tool kann nur einzelne Mails ändern. Für Batch-Operationen müsste es mehrfach aufgerufen werden.

Flags sind unabhängig – `read` ändert nicht `flag` und umgekehrt.

## Fehlerbehandlung

Falls die Mail nicht existiert: kein Fehler, sondern stilles Fehlschlag (IMAP-Befehl schlägt fehl, wird an MCP zurückgegeben).

Das Tool nutzt `{ idempotent: true }` (Standardeinstellung), daher wird ein Fehler automatisch einmal wiederholt.

---

## English

# Tool: mark_email

**File:** src/tools/mailbox.js

## Purpose

Sets or removes IMAP flags on a message: read/unread, flagged/unflagged.

## Parameters

| Parameter | Type | Description |
|---|---|---|
| `uid` | number | UID of the message |
| `folder` | string | Folder (default: `"INBOX"`) |
| `action` | string | `"read"`, `"unread"`, `"flag"`, or `"unflag"` |

## Return

MCP text block:

```javascript
{
  success: true,
  uid: 105,
  action: "read",
}
```

## Action mapping

| Action | IMAP flag | Meaning |
|---|---|---|
| `"read"` | `\Seen` | Sets the flag (message shown as read) |
| `"unread"` | `\Seen` | Removes the flag (message shown as unread) |
| `"flag"` | `\Flagged` | Sets the flag (in Proton: starred) |
| `"unflag"` | `\Flagged` | Removes the flag (star removed) |

## Details

The tool can only change individual messages. For batch operations, it would need to be called multiple times.

Flags are independent – `read` does not affect `flag` and vice versa.

## Error handling

If the message does not exist: no error, but silent failure (IMAP command fails, returned to MCP).

The tool uses `{ idempotent: true }` (default), so errors are automatically retried once.
