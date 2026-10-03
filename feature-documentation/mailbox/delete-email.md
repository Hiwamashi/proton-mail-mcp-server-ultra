**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Tool: delete_email

**Datei:** src/tools/mailbox.js

## Zweck

Löscht eine Mail: Liegt sie nicht im Papierkorb, wird sie dorthin verschoben. Liegt sie bereits im Papierkorb, wird sie endgültig gelöscht.

**Modi:** Verschieben in den Papierkorb ist in `drafts` und `full` möglich, in `read-only` ist das Tool nicht registriert. **Endgültiges Löschen ist nur in `full` möglich.** In `drafts` bleibt die Mail im Papierkorb; der Nutzer leert ihn in Proton Mail. Siehe `safety/operating-modes.md`.

## Parameter

| Parameter | Typ | Beschreibung |
|---|---|---|
| `uid` | number | UID der Mail (genau eins von `uid` und `uids`) |
| `uids` | number[] | 1 bis 500 UIDs desselben Ordners, siehe `bulk-operations.md` |
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
| Papierkorb | Endgültig löschen (nur `full`) | `deletedPermanently: true` |

Dies folgt dem Standard-Verhalten von Mail-Clients (z. B. Proton).

Außerhalb von `full` wirft das Tool bei einer Mail im Papierkorb **vor** `messageDelete()` den Fehler:

```
Permanent deletion is not available in this mode: it requires PROTON_MCP_MODE=full. The email stays in Trash; the user can empty the trash in Proton Mail.
```

Die Mail bleibt unverändert. Die Tool-Beschreibung (`deleteEmailDescription(mode)`) erwähnt endgültiges Löschen nur in `full`. Annotation: `destructiveHint: true`.

### Papierkorb-Erkennung

Das Tool fragt die Bridge nach dem Spezial-Ordner `\Trash` ab (gecacht). Falls nicht gefunden, nutzt es den Fallback `"Trash"`.

Die Erkennung ist **case-insensitive** – `folder.toLowerCase() === trash.toLowerCase()`.

## Besonderheiten

Das Tool sperrt den Quell-Ordner während des Vorgangs mit `getMailboxLock()`, um Race Conditions zu vermeiden.

Beim Löschen aus dem Papierkorb kann die UID nach dem `messageDelete()` nicht wiederverwendet werden.

## Fehlerbehandlung

Falls die Mail nicht existiert:

```
No message with UID 999 in folder "INBOX". UIDs are per folder – check the folder name.
```

Das Tool nutzt `{ idempotent: false }` bei Schreibvorgängen, daher wird ein Fehler nicht automatisch wiederholt.

Falls die Bridge den Papierkorb nicht kennt: Fallback zu `"Trash"` wird verwendet.

Mit `uids` werden alle vorhandenen Mails in einem Befehl verschoben bzw. (im Papierkorb, nur `full`) gelöscht; die Rückgabe enthält `processed` und `notFound` (siehe `bulk-operations.md`).

---

## English

# Tool: delete_email

**File:** src/tools/mailbox.js

## Purpose

Deletes a message: if it is not in Trash, moves it there. If it is already in Trash, deletes it permanently.

**Modes:** Moving to Trash works in `drafts` and `full`; in `read-only` the tool is not registered. **Permanent deletion works only in `full`.** In `drafts` the message stays in Trash; the user empties it in Proton Mail. See `safety/operating-modes.md`.

## Parameters

| Parameter | Type | Description |
|---|---|---|
| `uid` | number | UID of the message (exactly one of `uid` and `uids`) |
| `uids` | number[] | 1 to 500 UIDs of the same folder, see `bulk-operations.md` |
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
| Trash | Permanently delete (`full` only) | `deletedPermanently: true` |

This follows the standard behavior of mail clients (e.g. Proton).

Outside `full`, for a message in Trash the tool throws **before** `messageDelete()`:

```
Permanent deletion is not available in this mode: it requires PROTON_MCP_MODE=full. The email stays in Trash; the user can empty the trash in Proton Mail.
```

The message stays untouched. The tool description (`deleteEmailDescription(mode)`) mentions permanent deletion only in `full`. Annotation: `destructiveHint: true`.

### Trash detection

The tool queries the Bridge for the special folder `\Trash` (cached). If not found, uses fallback `"Trash"`.

Detection is **case-insensitive** – `folder.toLowerCase() === trash.toLowerCase()`.

## Details

The tool locks the source folder during the operation with `getMailboxLock()` to prevent race conditions.

When deleting from Trash, the UID cannot be reused after `messageDelete()`.

## Error handling

If the message does not exist:

```
No message with UID 999 in folder "INBOX". UIDs are per folder – check the folder name.
```

The tool uses `{ idempotent: false }` for write operations, so errors are not automatically retried.

If the Bridge does not know the Trash folder: fallback to `"Trash"` is used.

With `uids`, all existing messages are moved (or, in Trash and only in `full`, deleted) in one command; the result contains `processed` and `notFound` (see `bulk-operations.md`).
