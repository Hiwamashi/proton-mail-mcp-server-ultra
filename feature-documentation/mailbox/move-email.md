**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Tool: move_email

**Datei:** src/tools/mailbox.js

## Zweck

Verschiebt eine Mail von einem Ordner in einen anderen (z. B. von INBOX in Archive oder Spam).

## Parameter

| Parameter | Typ | Beschreibung |
|---|---|---|
| `uid` | number | UID der Mail (genau eins von `uid` und `uids`) |
| `uids` | number[] | 1 bis 500 UIDs desselben Ordners, siehe `bulk-operations.md` |
| `sourceFolder` | string | Quell-Ordner (Standard: `"INBOX"`) |
| `destinationFolder` | string | Ziel-Ordner (wie von `list_folders` geliefert) |

## Rückgabe

MCP-Text-Block:

```javascript
{
  success: true,
  uid: 105,
  from: "INBOX",
  to: "Archive",
  newUid: 150,  // oder null, falls nicht verfügbar
}
```

**newUid** ist die UID der Mail im Ziel-Ordner. Sie kann sich unterscheiden, da der IMAP-Server neue UIDs vergeben kann. Falls der Server UIDPLUS nicht unterstützt, ist `newUid: null`.

## Besonderheiten

### UID-Änderung

Nach einem Move ändert sich die UID. Der `newUid` in der Rückgabe sollte für zukünftige Operationen verwendet werden.

Falls `newUid` `null` ist (kein UIDPLUS): Die Mail ist im Ziel-Ordner vorhanden, aber die neue UID ist nicht bekannt. Mit `search_emails` oder `list_emails` im Ziel-Ordner findet man sie wieder.

### Ordner-Pfade

Pfade müssen exakt von `list_folders` stammen, z. B. `"Archive"`, `"Folders/MyFolder"`, `"[Gmail]/All Mail"`.

## Fehlerbehandlung

Falls die Mail im Quell-Ordner nicht existiert:

```
No message with UID 999 in folder "INBOX". UIDs are per folder – check the folder name.
```

Falls der Ziel-Ordner nicht existiert: IMAP-Fehler von der Bridge bzw. `Could not move UID … from "…" to "…".`

Mit `uids` enthält die Rückgabe `processed`, `notFound` und `uidMap` statt `uid`/`newUid` (siehe `bulk-operations.md`).

Das Tool nutzt `{ idempotent: false }`, daher wird ein Fehler nicht automatisch wiederholt.

---

## English

# Tool: move_email

**File:** src/tools/mailbox.js

## Purpose

Moves a message from one folder to another (e.g. from INBOX to Archive or Spam).

## Parameters

| Parameter | Type | Description |
|---|---|---|
| `uid` | number | UID of the message (exactly one of `uid` and `uids`) |
| `uids` | number[] | 1 to 500 UIDs of the same folder, see `bulk-operations.md` |
| `sourceFolder` | string | Source folder (default: `"INBOX"`) |
| `destinationFolder` | string | Destination folder (as returned by `list_folders`) |

## Return

MCP text block:

```javascript
{
  success: true,
  uid: 105,
  from: "INBOX",
  to: "Archive",
  newUid: 150,  // or null if not available
}
```

**newUid** is the UID of the message in the destination folder. It may differ because the IMAP server can assign new UIDs. If the server does not support UIDPLUS, `newUid: null`.

## Details

### UID change

After a move, the UID changes. The `newUid` in the return should be used for future operations.

If `newUid` is `null` (no UIDPLUS): the message is in the destination folder, but the new UID is not known. Find it again with `search_emails` or `list_emails` in the destination folder.

### Folder paths

Paths must match exactly from `list_folders`, e.g. `"Archive"`, `"Folders/MyFolder"`, `"[Gmail]/All Mail"`.

## Error handling

If the message does not exist in the source folder:

```
No message with UID 999 in folder "INBOX". UIDs are per folder – check the folder name.
```

If the destination folder does not exist: IMAP error from the Bridge or `Could not move UID … from "…" to "…".`

With `uids` the result contains `processed`, `notFound` and `uidMap` instead of `uid`/`newUid` (see `bulk-operations.md`).

The tool uses `{ idempotent: false }`, so errors are not automatically retried.
