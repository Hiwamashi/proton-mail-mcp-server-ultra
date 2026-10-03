**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Tool: get_thread

**Dateien:** src/thread.js (Logik), src/tools/mailbox.js (Registrierung)

## Zweck

Liefert die ganze Konversation zu einer Mail: worauf sie antwortet und alle Antworten darauf, über alle Ordner hinweg, auch die eigenen Antworten aus „Gesendet“. Die Nachrichten kommen chronologisch, die älteste zuerst. Auf Wunsch sind die Bodies ohne zitierten Verlauf enthalten, und alle Bodies teilen sich ein gemeinsames Zeichenbudget.

Proton gibt seine eigene Konversationsgruppierung über IMAP nicht heraus. Der Thread wird deshalb aus den Headern `Message-ID`, `In-Reply-To` und `References` rekonstruiert.

Das Tool ist rein lesend und in allen Betriebsmodi verfügbar (`readOnlyHint: true`).

## Parameter

| Parameter | Typ | Default | Beschreibung |
|---|---|---|---|
| `uid` | number | – | UID einer Mail der Konversation |
| `folder` | string | `"INBOX"` | Ordner dieser UID |
| `includeBodies` | boolean | `true` | Bodies ohne zitierten Verlauf mitliefern; `false` liefert nur Zusammenfassungen |
| `maxChars` | number | `20000` | Gesamtbudget für alle Bodies zusammen (500 bis 100000) |

## Rückgabe

```javascript
{
  folder: "All Mail",            // Ordner, in dem die UIDs unten gelten
  startFolder: "INBOX",
  startUid: 4932,
  count: 3,
  truncated: false,
  note: "…",                     // nur bei Abbruch oder Sonderfall
  foldersChecked: ["INBOX", "Sent", "Drafts"],
  bodies: { maxChars: 20000, quotedHistoryRemoved: true, shortened: [], omitted: [] },
  messages: [
    {
      uid: 10, date, from, to, subject, unread, flagged, hasAttachments, size,
      messageId: "<a@x>",
      inReplyTo: null,
      folders: ["INBOX"],         // nur aus foldersChecked
      duplicateUids: [11],        // nur wenn Proton die Mail doppelt in „All Mail“ führt
      bodyStatus: "full",         // full | shortened | omitted
      body: "…"
    },
    { …, start: true }            // die Ausgangsmail
  ]
}
```

Hat die Ausgangsmail keine `Message-ID`, kommt nur sie selbst zurück, mit ihrer UID im Ausgangsordner und einem Hinweis in `note`.

## Ablauf

1. **Ordnerliste** – ein `LIST` mit `STATUS (MESSAGES)`. Daraus kommen „All Mail“ (Special-Use `\All`, Fallback `"All Mail"`) und die Größe der Ordner für Schritt 4.
2. **Ausgangsmail** – im angegebenen Ordner werden nur die drei Thread-Header geholt (über `BODY.PEEK`).
3. **Breitensuche in „All Mail“**:
   - Runde 1 sucht die eigene `Message-ID` und alle IDs aus `References` und `In-Reply-To`. Gesucht wird per `HEADER Message-ID`, um die Vorgänger zu finden, und per `HEADER References` und `HEADER In-Reply-To`, um die Antworten zu finden.
   - Jede weitere Runde sucht die Antworten auf die Mails, die in der Runde davor neu gefunden wurden.
   - Alle IDs einer Runde gehen als **ein** OR-Batch an den Server, aufgeteilt in Pakete zu 40 IDs.
   - Die Suche endet, wenn eine Runde nichts Neues bringt, nach 10 Runden (`truncated: true`, `note` nennt die Runden) oder wenn mehr als 100 Mails nötig wären (`truncated: true`). Bei diesem Abbruch bleiben die Mails aus den frühesten Runden; innerhalb einer Runde kommen die Ausgangsmail und ihre Vorgänger vor den Antworten.
4. **Ordnerzugehörigkeit** – mit einer `HEADER Message-ID`-Suche im Ausgangsordner und in den Special-Use-Ordnern INBOX, Sent, Drafts, Archive, Trash und Spam. Durchsucht werden nur Ordner mit höchstens 5000 Nachrichten. Welche Ordner das waren, steht in `foldersChecked`. Ein leeres `folders` heißt also nur, dass die Mail in keinem der geprüften Ordner liegt, typischerweise in einem großen Archiv.
5. **Bodies** – sie werden von der neuesten Mail aus über `loadMessage()` geladen, also mit Cache und Teil-Download. Dann laufen `extractBody()` und `stripQuoted()` darüber. Ist das Budget aufgebraucht, werden die älteren Mails gar nicht erst geladen.

## Besonderheiten

### Prüfung der Treffer

`HEADER`-Suche ist auf dem Server eine Teilstring-Suche. Eine ID findet sich auch ohne spitze Klammern. Jeder Treffer wird deshalb lokal gegen seine geholten Header geprüft. Er zählt nur, wenn seine `Message-ID` gesucht wurde oder seine `References`/`In-Reply-To` eine gesuchte ID enthalten. Unpassende Treffer werden gemerkt und in späteren Runden nicht erneut geholt.

### Doppelte Kopien

Proton legt manche Mails zweimal mit derselben `Message-ID` in „All Mail“ ab, etwa eine empfangene Kopie und eine Kopie an eine zweite eigene Adresse. Solche Kopien bilden einen Eintrag. Die weiteren UIDs stehen in `duplicateUids`. Das 100er-Limit und das Body-Budget zählen jede Mail einmal.

### Body-Budget (`applyBodyBudget`)

- Die neuesten Mails bekommen ihren vollen Body.
- Die Mail, bei der das Budget ausgeht, wird gekürzt (`shortened`). Gekürzt wird an einem Zeilenumbruch, möglichst nahe an der Grenze.
- Ältere Mails werden weggelassen (`omitted`), ebenso ein Rest unter 100 Zeichen. Ist eine Mail weggelassen, gilt das auch für alle älteren, selbst wenn sie kurz wären.
- `bodies.shortened` und `bodies.omitted` nennen die betroffenen UIDs.

### Keine Nebenwirkungen

Header und Bodies werden mit `BODY.PEEK` gelesen. Kein Flag ändert sich, auch ungelesene Antworten bleiben ungelesen.

### Laufzeit

Jede `SEARCH` in „All Mail“ durchläuft den ganzen Ordner. Gemessen am 2026-10-03 mit 31 504 Nachrichten: 1,6 bis 2,9 s pro Suche, fast unabhängig von der Zahl der Kriterien (OR-Batch mit 40 IDs × 3 Kriterien: 2,3 s). Ein typischer Thread braucht eine bis drei Runden, live gemessen also 2,6 bis 5,6 s. Kleine Ordner kosten bei der Ordnerprüfung nur Millisekunden. Archive mit 27 717 Nachrichten bräuchte etwa 1,9 s und wird deshalb übersprungen.

## Fehlerbehandlung

- Unbekannte UID im Ausgangsordner: `No message with UID … in folder "…". UIDs are per folder – check the folder name.`
- Wird die Ausgangsmail in „All Mail“ nicht gefunden, kommt der Thread trotzdem zurück. `note` sagt dann `The start message itself was not found in All Mail.`

## Tests

`test/thread.test.js` deckt mit `test/helpers/fake-mailbox.js` folgende Fälle ab: Kette A → B → C, eigene Antworten in Sent, Mail ohne Thread-Header, Abbruch bei 100, Rundenlimit, doppelte Kopien, Prüfung der Treffer, Bodies, keine Flag-Änderung sowie die Budget-Logik.

---

## English

# Tool: get_thread

**Files:** src/thread.js (logic), src/tools/mailbox.js (registration)

## Purpose

Returns the whole conversation of a message: what it replies to and every reply to it, across all folders, including the user's own replies from "Sent". Messages come in chronological order, oldest first. Optionally the bodies are included without quoted history, and all bodies share one character budget.

Proton does not expose its own conversation grouping over IMAP. The thread is therefore rebuilt from the `Message-ID`, `In-Reply-To` and `References` headers.

The tool is read-only and available in every operating mode (`readOnlyHint: true`).

## Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `uid` | number | – | UID of one message of the conversation |
| `folder` | string | `"INBOX"` | Folder of that UID |
| `includeBodies` | boolean | `true` | Include bodies without quoted history; `false` returns summaries only |
| `maxChars` | number | `20000` | Total budget for all bodies together (500 to 100000) |

## Return

```javascript
{
  folder: "All Mail",            // folder in which the UIDs below are valid
  startFolder: "INBOX",
  startUid: 4932,
  count: 3,
  truncated: false,
  note: "…",                     // only on truncation or special cases
  foldersChecked: ["INBOX", "Sent", "Drafts"],
  bodies: { maxChars: 20000, quotedHistoryRemoved: true, shortened: [], omitted: [] },
  messages: [
    {
      uid: 10, date, from, to, subject, unread, flagged, hasAttachments, size,
      messageId: "<a@x>",
      inReplyTo: null,
      folders: ["INBOX"],         // only from foldersChecked
      duplicateUids: [11],        // only when Proton keeps the message twice in "All Mail"
      bodyStatus: "full",         // full | shortened | omitted
      body: "…"
    },
    { …, start: true }            // the start message
  ]
}
```

If the start message has no `Message-ID`, only the message itself is returned, with its UID in the start folder and a remark in `note`.

## Flow

1. **Folder list** – one `LIST` with `STATUS (MESSAGES)`. It provides "All Mail" (special-use `\All`, fallback `"All Mail"`) and the folder sizes for step 4.
2. **Start message** – only the three thread headers are fetched in the given folder (via `BODY.PEEK`).
3. **Breadth-first search in "All Mail"**:
   - Round 1 searches the message's own `Message-ID` and all IDs from `References` and `In-Reply-To`. It searches by `HEADER Message-ID` to find the ancestors and by `HEADER References` and `HEADER In-Reply-To` to find the replies.
   - Every further round searches the replies to the messages newly found in the round before.
   - All IDs of a round go to the server as **one** OR batch, split into chunks of 40 IDs.
   - The search ends when a round finds nothing new, after 10 rounds (`truncated: true`, `note` names the rounds), or when more than 100 messages would be needed (`truncated: true`). On that cutoff the messages from the earliest rounds are kept; within a round, the start message and its ancestors come before the replies.
4. **Folder membership** – with one `HEADER Message-ID` search in the start folder and in the special-use folders INBOX, Sent, Drafts, Archive, Trash and Spam. Only folders with at most 5000 messages are searched. Which ones were searched is listed in `foldersChecked`. An empty `folders` therefore only means the message is in none of the checked folders, typically in a large archive.
5. **Bodies** – they are loaded starting with the newest message through `loadMessage()`, so with cache and partial download. Then `extractBody()` and `stripQuoted()` run over them. Once the budget is used up, older messages are not loaded at all.

## Details

### Checking the hits

`HEADER` search is a substring search on the server. An ID also matches without its angle brackets. Every hit is therefore checked locally against its fetched headers. It only counts if its `Message-ID` was searched or its `References`/`In-Reply-To` contain a searched ID. Unrelated hits are remembered and not fetched again in later rounds.

### Duplicate copies

Proton keeps some messages twice with the same `Message-ID` in "All Mail", e.g. a received copy and a copy to a second own address. Such copies form one entry. The other UIDs are listed in `duplicateUids`. The 100-message limit and the body budget count each message once.

### Body budget (`applyBodyBudget`)

- The newest messages get their full body.
- The message where the budget runs out is shortened (`shortened`). It is cut at a line break as close to the limit as possible.
- Older messages are omitted (`omitted`), as is a remainder under 100 characters. Once a message is omitted, so are all older ones, even short ones.
- `bodies.shortened` and `bodies.omitted` list the affected UIDs.

### No side effects

Headers and bodies are read with `BODY.PEEK`. No flag changes, and unread replies stay unread.

### Run time

Every `SEARCH` in "All Mail" scans the whole folder. Measured on 2026-10-03 with 31 504 messages: 1.6 to 2.9 s per search, almost independent of the number of criteria (OR batch with 40 IDs × 3 criteria: 2.3 s). A typical thread needs one to three rounds, measured live at 2.6 to 5.6 s. Small folders cost only milliseconds in the folder check. Archive with 27 717 messages would take about 1.9 s and is therefore skipped.

## Error handling

- Unknown UID in the start folder: `No message with UID … in folder "…". UIDs are per folder – check the folder name.`
- If the start message is not found in "All Mail", the thread is still returned. `note` then says `The start message itself was not found in All Mail.`

## Tests

`test/thread.test.js` uses `test/helpers/fake-mailbox.js` to cover these cases: chain A → B → C, own replies in Sent, message without thread headers, cutoff at 100, round limit, duplicate copies, checking the hits, bodies, no flag change, and the budget logic.
