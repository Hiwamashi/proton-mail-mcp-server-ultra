**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Tool: label_email

**Datei:** src/tools/labels.js (`labelMessages`, `resolveLabel`)

## Zweck

Setzt oder entfernt ein Proton-Label an einer oder mehreren Mails desselben Ordners. Anders als Ordner lassen sich Labels kombinieren. Die Mails bleiben in ihrem Ordner. Verfügbar in den Modi `drafts` und `full`. Das Tool ist nicht destruktiv und idempotent (`destructiveHint: false`, `idempotentHint: true`).

## Parameter

| Parameter | Typ | Default | Beschreibung |
|---|---|---|---|
| `uid` / `uids` | number / number[] | – | Genau eins von beiden, `uids` mit 1 bis 500 UIDs (siehe `mailbox/bulk-operations.md`) |
| `folder` | string | `"INBOX"` | Ordner der UIDs |
| `label` | string | – | Label-Name, mit oder ohne `Labels/` |
| `action` | `"add"` \| `"remove"` | – | Label setzen oder entfernen |

## Wie die Bridge Labels abbildet

Die Bridge zeigt Labels als Ordner unter `Labels/`. Vor der Umsetzung wurde das gegen die laufende Bridge geprüft (Spike vom 2026-10-03, Details in der Design-Datei des Changes `add-mailbox-write-tools`):

- `UID COPY` in `Labels/X` setzt das Label. Die Mail bleibt, wo sie ist, es entsteht kein Duplikat. Ein zweites COPY ändert nichts.
- `STORE \Deleted` + `UID EXPUNGE` in `Labels/X` entfernt nur das Label. Die Mail bleibt in INBOX und „All Mail“, ihre Flags bleiben.

## Ablauf

1. **Label auflösen:** `LIST`, dann zuerst exakter Treffer, sonst Treffer ohne Rücksicht auf Groß-/Kleinschreibung unter `Labels/`. Ein unbekanntes Label schlägt fehl, bevor etwas geschrieben wird: `Label "Stuer" does not exist. Existing labels: Steuer, Privat.`
   - **Systemordner sind keine Labels.** Manche Bridge-Konten führen Sent und Trash unter `Labels/` mit Sonderfunktion; in diesem Account ist das so. Dort würde ein EXPUNGE die Mail löschen, im Papierkorb sogar endgültig, an der Sperre für `drafts` vorbei. Solche Ordner werden abgelehnt (`"Labels/…" is a system folder (\Trash), not a label.`) und tauchen auch nicht in der Liste vorhandener Labels auf.
2. **Im Quellordner:** Existenzprüfung der UIDs wie bei den Sammeloperationen (`processed`, `notFound`).
3. **Hinzufügen:** ein `UID COPY` der vorhandenen UIDs nach `Labels/X`.
4. **Entfernen:**
   - Im Quellordner werden die `Message-ID`s geholt, denn UIDs gelten nur je Ordner.
   - Dann wird in `Labels/X` per `HEADER Message-ID` gesucht (OR-Batches zu 40). Weil die Suche auch Teilstrings trifft, zählen nur Treffer mit exakt passender ID.
   - Diese UIDs bekommen `STORE \Deleted` + `UID EXPUNGE`, und zwar nur in `Labels/X`.
   - Hat der Label-Ordner mehr Kopien einer Message-ID als angefragte Mails mit dieser ID (z. B. die gesendete und die empfangene Kopie einer Mail an dich selbst), lassen sich die Kopien nicht unterscheiden. Sie bleiben dann unverändert und stehen in `ambiguous`.
   - Trägt keine Mail das Label, wird nichts geschrieben, und der Aufruf ist trotzdem erfolgreich.
5. Ist `folder` selbst der Label-Ordner (ohne Rücksicht auf Groß-/Kleinschreibung), ist „add“ ein No-op, und „remove“ entfernt direkt dort.
6. imapflow meldet ein gescheitertes COPY oder EXPUNGE mit `false` statt einer Ausnahme. Das wird geprüft: Bestätigt die Bridge nicht, kommt ein Fehler statt `success: true`.

„All Mail“ wird nie benutzt. Die Bridge aktualisiert diesen Ordner mit einigen Sekunden Verzögerung.

## Rückgabe

```javascript
{ success: true, label: "Steuer", action: "add", processed: [1, 2], notFound: [9] }
{ success: true, label: "Steuer", action: "remove", uid: 1, processed: [1], notFound: [] }   // mit uid
```

Mails ohne `Message-ID` lassen sich beim Entfernen nicht im Label-Ordner finden. Sie stehen in `withoutMessageId`, nicht unterscheidbare Kopien in `ambiguous`; in beiden Fällen kommt eine `warning` dazu.

## Fehlerbehandlung

- Unbekanntes Label: Liste der vorhandenen Labels (siehe oben). Neue Labels legt `create_folder` an.
- Keine der UIDs vorhanden, `uid` und `uids` zusammen: wie bei den Sammeloperationen.
- Schreibvorgänge werden nach einem Verbindungsfehler nicht wiederholt.

## Tests

- `test/labels.test.js` mit dem Fake-Postfach deckt ab: Hinzufügen, Entfernen per Message-ID, Entfernen ohne gesetztes Label, Entfernen im Label-Ordner (auch mit anderer Schreibweise), unbekanntes Label, Systemordner unter `Labels/`, unbestätigtes COPY/EXPUNGE, nicht unterscheidbare Kopien, Mails ohne Message-ID.
- `scripts/smoke.mjs --labels` läuft live:
  1. legt ein Test-Label an
  2. setzt es an einen Entwurf an dich selbst
  3. prüft, dass der Entwurf im Label-Ordner erscheint
  4. entfernt das Label
  5. prüft, dass der Entwurf noch in „Entwürfe“ liegt
  6. räumt auf: Entwurf und Label löschen

---

## English

# Tool: label_email

**File:** src/tools/labels.js (`labelMessages`, `resolveLabel`)

## Purpose

Adds or removes a Proton label on one or more messages of the same folder. Unlike folders, labels can be combined. The messages stay in their folder. Available in `drafts` and `full` mode. The tool is not destructive and is idempotent (`destructiveHint: false`, `idempotentHint: true`).

## Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `uid` / `uids` | number / number[] | – | Exactly one of them, `uids` with 1 to 500 UIDs (see `mailbox/bulk-operations.md`) |
| `folder` | string | `"INBOX"` | Folder of the UIDs |
| `label` | string | – | Label name, with or without `Labels/` |
| `action` | `"add"` \| `"remove"` | – | Add or remove the label |

## How the Bridge maps labels

The Bridge shows labels as folders under `Labels/`. Before implementation this was checked against the running Bridge (spike of 2026-10-03, details in the design file of the `add-mailbox-write-tools` change):

- `UID COPY` into `Labels/X` sets the label. The message stays where it is, and no duplicate is created. A second COPY changes nothing.
- `STORE \Deleted` + `UID EXPUNGE` in `Labels/X` removes only the label. The message stays in INBOX and "All Mail", and its flags stay.

## Flow

1. **Resolve the label:** `LIST`, then an exact match first, otherwise a case-insensitive match under `Labels/`. An unknown label fails before anything is written: `Label "Stuer" does not exist. Existing labels: Steuer, Privat.`
   - **System folders are not labels.** Some Bridge accounts list Sent and Trash under `Labels/` with a special use; this account does. There an EXPUNGE would delete the message, in Trash even permanently, bypassing the `drafts` lock. Such folders are refused (`"Labels/…" is a system folder (\Trash), not a label.`) and do not appear in the list of existing labels either.
2. **In the source folder:** existence check of the UIDs as for bulk operations (`processed`, `notFound`).
3. **Add:** one `UID COPY` of the existing UIDs to `Labels/X`.
4. **Remove:**
   - The `Message-ID`s are fetched in the source folder, because UIDs are only valid per folder.
   - Then `Labels/X` is searched by `HEADER Message-ID` (OR batches of 40). Because the search also matches substrings, only hits with an exactly matching ID count.
   - Those UIDs get `STORE \Deleted` + `UID EXPUNGE`, in `Labels/X` only.
   - If the label folder holds more copies of a Message-ID than requested messages with that ID (e.g. the sent and the received copy of a mail to yourself), the copies cannot be told apart. They are then left unchanged and listed in `ambiguous`.
   - If no message has the label, nothing is written, and the call still succeeds.
5. If `folder` is the label folder itself (case-insensitive), "add" is a no-op and "remove" removes directly there.
6. imapflow reports a failed COPY or EXPUNGE as `false` instead of an exception. This is checked: if the Bridge does not confirm, an error is returned instead of `success: true`.

"All Mail" is never used. The Bridge updates that folder with a delay of a few seconds.

## Return

```javascript
{ success: true, label: "Steuer", action: "add", processed: [1, 2], notFound: [9] }
{ success: true, label: "Steuer", action: "remove", uid: 1, processed: [1], notFound: [] }   // with uid
```

Messages without a `Message-ID` cannot be found in the label folder when removing. They are listed in `withoutMessageId`, indistinguishable copies in `ambiguous`; in both cases a `warning` is added.

## Error handling

- Unknown label: list of the existing labels (see above). New labels are created with `create_folder`.
- None of the UIDs present, `uid` and `uids` together: as for bulk operations.
- Writes are not retried after a connection error.

## Tests

- `test/labels.test.js` with the fake mailbox covers: adding, removing by Message-ID, removing without the label set, removing in the label folder (also with different case), unknown label, system folders under `Labels/`, unconfirmed COPY/EXPUNGE, indistinguishable copies, messages without Message-ID.
- `scripts/smoke.mjs --labels` runs live:
  1. creates a test label
  2. puts it on a draft to yourself
  3. checks that the draft appears in the label folder
  4. removes the label
  5. checks that the draft is still in Drafts
  6. cleans up: deletes the draft and the label
