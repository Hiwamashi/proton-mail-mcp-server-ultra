**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Sammeloperationen: uids bei move_email, mark_email, delete_email

**Datei:** src/tools/mailbox.js (`resolveUids`, `existingUids`, `moveMessages`, `markMessages`, `deleteMessages`)

## Zweck

`move_email`, `mark_email` und `delete_email` (und `label_email`, siehe `labels/label-email.md`) verarbeiten mehrere Mails desselben Ordners in einem Aufruf. Beispiel: 30 Newsletter archivieren.

## Parameter

Genau einer von beiden:

| Parameter | Typ | Beschreibung |
|---|---|---|
| `uid` | number | Eine Mail (wie bisher) |
| `uids` | number[] | 1 bis 500 UIDs desselben Ordners; doppelte werden zusammengefasst |

Beide oder keiner: `Use exactly one of uid or uids.` Die Prüfung läuft, bevor das Postfach berührt wird. Mehr als 500 UIDs lehnt schon das Eingabeschema ab.

## Ablauf

1. **Existenzprüfung:** ein `UID SEARCH UID <set>` im gewählten Ordner. Fehlende UIDs kommen nach `notFound`.
2. Gibt es **keine** der UIDs, schlägt der Aufruf fehl, und nichts wird geschrieben:
   - eine UID: `No message with UID … in folder "…". UIDs are per folder – check the folder name.`
   - mehrere: `None of the N UIDs exist in folder "…". …`
3. **Ein** IMAP-Befehl über alle vorhandenen UIDs: `UID MOVE`, `UID STORE +FLAGS/-FLAGS` oder (im Papierkorb) `STORE \Deleted` + `UID EXPUNGE`.
4. Cache-Einträge der betroffenen UIDs werden verworfen (siehe `reading/message-cache.md`).

Ein MOVE oder EXPUNGE, das die Bridge nicht bestätigt (imapflow liefert dann `false`), führt zu einem Fehler statt zu `success: true`.

Schreibvorgänge werden nach einem Verbindungsfehler nicht wiederholt (`move_email`, `delete_email`). Bei `mark_email` ist eine Wiederholung unschädlich, Flags setzen ist idempotent.

`delete_email` im Papierkorb wird außerhalb des Modus `full` abgelehnt, bevor überhaupt gesucht wird (`PERMANENT_DELETE_REFUSAL`).

## Rückgabe

Mit `uids`:

```javascript
// move_email
{ success: true, from: "INBOX", to: "Archive", processed: [10, 11, 12], notFound: [], uidMap: { "10": 101, "11": 102, "12": 103 } }
// mark_email
{ success: true, action: "read", processed: [10, 11], notFound: [999] }
// delete_email
{ success: true, movedTo: "Trash", processed: [10, 12], notFound: [13] }
{ success: true, deletedPermanently: true, processed: [5, 6], notFound: [] }   // im Papierkorb, nur full
```

`uidMap` enthält nur Paare, die der Server meldet (UIDPLUS).

Mit `uid` bleiben die bisherigen Felder unverändert, zum Beispiel `{ success, uid, from, to, newUid }` bei `move_email`. Ein Regressionstest sichert das ab.

**Geändertes Verhalten:** `mark_email` mit einer nicht vorhandenen UID meldete früher Erfolg, ohne etwas zu tun. Jetzt kommt die Nicht-gefunden-Meldung. Die Fehlermeldung von `move_email` und `delete_email` für eine fehlende UID ist dieselbe wie bei `read_email`.

## Tests

`test/bulk.test.js` mit `test/helpers/fake-mailbox.js` deckt ab:
- alle UIDs vorhanden, teilweise fehlend, keine vorhanden
- `uid` und `uids` zusammen, mehr als 500 UIDs
- Papierkorb in den Modi `drafts` und `full`
- Rückgabeform bei einer UID

---

## English

# Bulk operations: uids for move_email, mark_email, delete_email

**File:** src/tools/mailbox.js (`resolveUids`, `existingUids`, `moveMessages`, `markMessages`, `deleteMessages`)

## Purpose

`move_email`, `mark_email` and `delete_email` (and `label_email`, see `labels/label-email.md`) handle several messages of the same folder in one call. Example: archiving 30 newsletters.

## Parameters

Exactly one of:

| Parameter | Type | Description |
|---|---|---|
| `uid` | number | One message (as before) |
| `uids` | number[] | 1 to 500 UIDs of the same folder; duplicates are merged |

Both or neither: `Use exactly one of uid or uids.` The check runs before the mailbox is touched. More than 500 UIDs are already rejected by the input schema.

## Flow

1. **Existence check:** one `UID SEARCH UID <set>` in the selected folder. Missing UIDs go to `notFound`.
2. If **none** of the UIDs exists, the call fails and nothing is written:
   - one UID: `No message with UID … in folder "…". UIDs are per folder – check the folder name.`
   - several: `None of the N UIDs exist in folder "…". …`
3. **One** IMAP command over all existing UIDs: `UID MOVE`, `UID STORE +FLAGS/-FLAGS` or (in Trash) `STORE \Deleted` + `UID EXPUNGE`.
4. Cache entries of the affected UIDs are dropped (see `reading/message-cache.md`).

A MOVE or EXPUNGE the Bridge does not confirm (imapflow then returns `false`) results in an error instead of `success: true`.

Writes are not retried after a connection error (`move_email`, `delete_email`). For `mark_email` a retry is harmless, since setting flags is idempotent.

`delete_email` in Trash is refused outside `full` mode before anything is even searched (`PERMANENT_DELETE_REFUSAL`).

## Return

With `uids`:

```javascript
// move_email
{ success: true, from: "INBOX", to: "Archive", processed: [10, 11, 12], notFound: [], uidMap: { "10": 101, "11": 102, "12": 103 } }
// mark_email
{ success: true, action: "read", processed: [10, 11], notFound: [999] }
// delete_email
{ success: true, movedTo: "Trash", processed: [10, 12], notFound: [13] }
{ success: true, deletedPermanently: true, processed: [5, 6], notFound: [] }   // in Trash, full only
```

`uidMap` only contains pairs the server reports (UIDPLUS).

With `uid`, the previous fields stay unchanged, for example `{ success, uid, from, to, newUid }` for `move_email`. A regression test makes sure of that.

**Changed behavior:** `mark_email` with a UID that does not exist used to report success without doing anything. Now it returns the not-found message. The error message of `move_email` and `delete_email` for a missing UID is the same as for `read_email`.

## Tests

`test/bulk.test.js` with `test/helpers/fake-mailbox.js` covers:
- all UIDs present, partly missing, none present
- `uid` and `uids` together, more than 500 UIDs
- Trash in `drafts` and `full` mode
- the result shape for a single UID
