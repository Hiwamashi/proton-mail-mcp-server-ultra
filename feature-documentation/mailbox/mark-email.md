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
| `uid` | number | UID der Mail (genau eins von `uid` und `uids`) |
| `uids` | number[] | 1 bis 500 UIDs desselben Ordners, siehe `bulk-operations.md` |
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

Falls die Mail nicht existiert: `No message with UID … in folder "…". UIDs are per folder – check the folder name.` (früher meldete das Tool in diesem Fall Erfolg, ohne etwas zu tun). Mit `uids` stehen fehlende UIDs in `notFound`; nur wenn keine existiert, kommt der Fehler (siehe `bulk-operations.md`).

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
| `uid` | number | UID of the message (exactly one of `uid` and `uids`) |
| `uids` | number[] | 1 to 500 UIDs of the same folder, see `bulk-operations.md` |
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

If the message does not exist: `No message with UID … in folder "…". UIDs are per folder – check the folder name.` (previously the tool reported success without doing anything). With `uids`, missing UIDs are listed in `notFound`; only if none exists does the error occur (see `bulk-operations.md`).

The tool uses `{ idempotent: true }` (default), so errors are automatically retried once.
