**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Tool: delete_email

**Datei:** src/tools/mailbox.js

## Zweck

Löscht eine Mail: Liegt sie nicht im Papierkorb, wird sie dorthin verschoben. Liegt sie bereits im Papierkorb, wird sie endgültig gelöscht.

## Parameter

| Parameter | Typ | Beschreibung |
|---|---|---|
| `uid` | number | UID der Mail |
| `folder` | string | Ordner (Standard: `"INBOX"`) |

## Rückgabe

MCP-Text-Block:

```javascript
{
  success: true,
  uid: 105,
  deletedPermanently: true,  // oder false (in Papierkorb verschoben)
}
```

Wenn verschoben:
```javascript
{
  success: true,
  uid: 105,
  movedTo: "Trash",  // oder aktueller Papierkorb-Pfad
}
```

## Verhalten

### Logik: Zwei-Phasen-Löschen

| Aktueller Ordner | Aktion | Rückgabe |
|---|---|---|
| Nicht Papierkorb | Verschieben nach Papierkorb | `movedTo: "Trash"` |
| Papierkorb | Endgültig löschen | `deletedPermanently: true` |

Dies folgt dem Standard-Verhalten von Mail-Clients (z. B. Proton).

### Papierkorb-Erkennung

Das Tool fragt die Bridge nach dem Spezial-Ordner `\Trash` ab (gecacht). Falls nicht gefunden, nutzt es den Fallback `"Trash"`.

Die Erkennung ist **case-insensitive** – `folder.toLowerCase() === trash.toLowerCase()`.

## Besonderheiten

Das Tool sperrt den Quell-Ordner während des Vorgangs mit `getMailboxLock()`, um Race Conditions zu vermeiden.

Beim Löschen aus dem Papierkorb kann die UID nach dem `messageDelete()` nicht wiederverwendet werden.

## Fehlerbehandlung

Falls die Mail nicht existiert:

```
Error: Could not move UID 999 from "INBOX" to Trash – does it exist there?
```

Das Tool nutzt `{ idempotent: false }` bei Schreibvorgängen, daher wird ein Fehler nicht automatisch wiederholt.

Falls die Bridge den Papierkorb nicht kennt: Fallback zu `"Trash"` wird verwendet.

---

## English

# Tool: delete_email

**File:** src/tools/mailbox.js

## Purpose

Deletes a message: if it is not in Trash, moves it there. If it is already in Trash, deletes it permanently.

## Parameters

| Parameter | Type | Description |
|---|---|---|
| `uid` | number | UID of the message |
| `folder` | string | Folder (default: `"INBOX"`) |

## Return

MCP text block:

```javascript
{
  success: true,
  uid: 105,
  deletedPermanently: true,  // or false (moved to Trash)
}
```

If moved:
```javascript
{
  success: true,
  uid: 105,
  movedTo: "Trash",  // or current Trash folder path
}
```

## Behavior

### Logic: two-phase delete

| Current folder | Action | Return |
|---|---|---|
| Not Trash | Move to Trash | `movedTo: "Trash"` |
| Trash | Permanently delete | `deletedPermanently: true` |

This follows the standard behavior of mail clients (e.g. Proton).

### Trash detection

The tool queries the Bridge for the special folder `\Trash` (cached). If not found, uses fallback `"Trash"`.

Detection is **case-insensitive** – `folder.toLowerCase() === trash.toLowerCase()`.

## Details

The tool locks the source folder during the operation with `getMailboxLock()` to prevent race conditions.

When deleting from Trash, the UID cannot be reused after `messageDelete()`.

## Error handling

If the message does not exist:

```
Error: Could not move UID 999 from "INBOX" to Trash – does it exist there?
```

The tool uses `{ idempotent: false }` for write operations, so errors are not automatically retried.

If the Bridge does not know the Trash folder: fallback to `"Trash"` is used.
