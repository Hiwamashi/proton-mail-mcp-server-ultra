**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Weiterleiten: forward_email und create_draft mit forwardUid

**Dateien:** src/compose.js (`forwardSubject`, `forwardHeaderText`, `forwardHeaderHtml`), src/tools/compose.js (`composeOptions` mit `forward`, Tool `forward_email`, Parameter von `create_draft`)

## Zweck

Leitet eine Mail weiter: Betreff mit `Fwd:`, eine optionale Einleitung, darunter ein Kopfblock der Original-Mail, ihr Text und standardmäßig ihre Anhänge.

- `forward_email` sendet sofort und existiert nur im Modus `full` (`openWorldHint: true`).
- `create_draft` mit `forwardUid` legt dieselbe Weiterleitung als Entwurf an und ist ab Modus `drafts` verfügbar. `to` darf dabei leer bleiben; der Mensch adressiert und sendet in Proton Mail.

## Parameter

### forward_email

| Parameter | Typ | Default | Beschreibung |
|---|---|---|---|
| `uid` | number | – | UID der weiterzuleitenden Mail |
| `folder` | string | `"INBOX"` | Ordner dieser UID |
| `to` | string | – | Empfänger, kommagetrennt (Pflicht) |
| `cc`, `bcc` | string | – | Weitere Empfänger |
| `body` | string | – | Einleitung über der weitergeleiteten Mail (Text) |
| `html` | string | – | HTML-Version der Einleitung |
| `includeAttachments` | boolean | `true` | Anhänge des Originals mitschicken |

### create_draft (zusätzliche Parameter)

| Parameter | Typ | Default | Beschreibung |
|---|---|---|---|
| `forwardUid` | number | – | UID der weiterzuleitenden Mail |
| `forwardFolder` | string | `"INBOX"` | Ordner dieser UID |
| `includeAttachments` | boolean | `true` | Anhänge des Originals übernehmen |

`body` ist bei `create_draft` nur noch Pflicht, wenn der Entwurf keine Weiterleitung ist.

## Aufbau der Nachricht

- **Betreff:** `forwardSubject()` setzt `Fwd: ` davor, außer der Betreff beginnt schon mit `Fwd:`, `Fw:` oder `WG:` (Groß-/Kleinschreibung egal). `Re:` zählt nicht, aus `Re: X` wird `Fwd: Re: X`. Ein eigenes, nicht leeres `subject` hat Vorrang.
- **Text:** Einleitung, Leerzeile, Kopfblock, Leerzeile, lesbarer Body des Originals (`extractBody`).
- **Kopfblock** (Sprache und Zeitzone wie das Antwortzitat: `PROTON_MCP_LOCALE`, `PROTON_MCP_TIMEZONE`; hier mit `de`):
  ```
  ---------- Weitergeleitete Nachricht ----------
  Von: Jürgen Müller <juergen@example.com>
  Datum: 06.10.2026, 09:15
  Betreff: Rechnung Oktober
  An: Anna Beispiel <anna@example.com>
  Cc: team@example.com
  ```
  Eine leere Cc-Zeile fehlt. Die Bezeichnungen folgen der Sprache, z. B. `en`: `---------- Forwarded message ---------`, `From`, `Date`, `Subject`, `To`, `Cc`. `stripQuoted()` erkennt die Trennzeile, `read_email` mit `stripQuoted: true` zeigt also nur die Einleitung.
- **HTML:** Es entsteht, wenn die Einleitung als HTML kommt oder das Original HTML hat. Aufbau: Einleitung (bei Bedarf aus dem Text erzeugt), dann `<div class="protonmail_forward">` mit dem Kopfblock und dem **Original-HTML**. `cid:`-Verweise bleiben erhalten.
- **Anhänge:** `carryAttachments(original)` übernimmt alle Anhänge, auch eingebettete Bilder mit ihrer `cid`. Signaturteile (PKCS#7, PGP) fallen weg, weil sie zur neuen Nachricht nicht mehr passen. Mit `includeAttachments: false` gibt es keine Anhänge. Eingebettete Bilder im Original-HTML werden dann nicht angezeigt.
- **Threading:** Es wird kein `In-Reply-To` und kein `References` gesetzt. Eine Weiterleitung beginnt eine neue Unterhaltung.

Das Original wird über `loadMessage()` vollständig geladen (nicht teilweise), damit die Anhänge ihren Inhalt haben.

## Rückgabe

`forward_email`:

```javascript
{ success: true, messageId: "<…>", to: "buchhaltung@example.com", cc: "", subject: "Fwd: Rechnung Oktober", attachments: ["logo.png", "Rechnung.pdf"] }
```

`create_draft` mit `forwardUid` liefert die übliche Entwurfs-Zusammenfassung (siehe `create-draft.md`) mit `inReplyTo: null`.

## Fehlerbehandlung

- `replyToUid` und `forwardUid` zusammen: `Use either replyToUid or forwardUid, not both: a draft is a reply or a forward.` Die Prüfung läuft, bevor das Postfach berührt wird.
- `create_draft` ohne `body` und ohne `forwardUid`: `body is required unless the draft forwards an email (forwardUid).`
- Unbekannte UID: `No message with UID … in folder "…". UIDs are per folder – check the folder name.`
- Zu große Anhänge für Proton: Der SMTP-Fehler kommt unverändert zurück. Als Ausweg bleibt `includeAttachments: false`.
- `forward_email` wird wie jeder Versand nicht wiederholt (siehe `connections/smtp-send.md`).

## Tests

`test/forward.test.js` prüft Folgendes:
- die Präfixe `Fwd:`/`Fw:`/`WG:` und den Kopfblock in Text und HTML; eine leere Cc-Zeile fehlt
- dass `stripQuoted` die Trennzeile erkennt
- Aufbau ohne Threading-Header
- mit dem MIME-Fixture `test/fixtures/forward-source.eml`: PDF und eingebettetes Bild sind enthalten (`cid` bleibt), die Signatur fehlt
- `includeAttachments: false`
- den Konflikt `replyToUid` + `forwardUid` sowie die Modi

`scripts/smoke.mjs --drafts` legt live einen Weiterleitungs-Entwurf der neuesten INBOX-Mail an und löscht ihn wieder.

---

## English

# Forwarding: forward_email and create_draft with forwardUid

**Files:** src/compose.js (`forwardSubject`, `forwardHeaderText`, `forwardHeaderHtml`), src/tools/compose.js (`composeOptions` with `forward`, tool `forward_email`, parameters of `create_draft`)

## Purpose

Forwards a message: subject with `Fwd:`, an optional introduction, below it a header block of the original message, its text and, by default, its attachments.

- `forward_email` sends immediately and exists only in `full` mode (`openWorldHint: true`).
- `create_draft` with `forwardUid` creates the same forward as a draft and is available from `drafts` mode on. `to` may stay empty; the human addresses and sends it in Proton Mail.

## Parameters

### forward_email

| Parameter | Type | Default | Description |
|---|---|---|---|
| `uid` | number | – | UID of the message to forward |
| `folder` | string | `"INBOX"` | Folder of that UID |
| `to` | string | – | Recipients, comma-separated (required) |
| `cc`, `bcc` | string | – | Further recipients |
| `body` | string | – | Introduction above the forwarded message (text) |
| `html` | string | – | HTML version of the introduction |
| `includeAttachments` | boolean | `true` | Send the original attachments along |

### create_draft (additional parameters)

| Parameter | Type | Default | Description |
|---|---|---|---|
| `forwardUid` | number | – | UID of the message to forward |
| `forwardFolder` | string | `"INBOX"` | Folder of that UID |
| `includeAttachments` | boolean | `true` | Carry over the original attachments |

For `create_draft`, `body` is now only required when the draft is not a forward.

## Structure of the message

- **Subject:** `forwardSubject()` prefixes `Fwd: `, unless the subject already starts with `Fwd:`, `Fw:` or `WG:` (case-insensitive). `Re:` does not count; `Re: X` becomes `Fwd: Re: X`. An explicit, non-empty `subject` wins.
- **Text:** introduction, blank line, header block, blank line, readable body of the original (`extractBody`).
- **Header block** (same language and time zone as the reply quote: `PROTON_MCP_LOCALE`, `PROTON_MCP_TIMEZONE`; shown with `de`):
  ```
  ---------- Weitergeleitete Nachricht ----------
  Von: Jürgen Müller <juergen@example.com>
  Datum: 06.10.2026, 09:15
  Betreff: Rechnung Oktober
  An: Anna Beispiel <anna@example.com>
  Cc: team@example.com
  ```
  An empty Cc line is left out. The labels follow the language, e.g. `en`: `---------- Forwarded message ---------`, `From`, `Date`, `Subject`, `To`, `Cc`. `stripQuoted()` recognizes the separator line, so `read_email` with `stripQuoted: true` shows only the introduction.
- **HTML:** It is created when the introduction comes as HTML or the original has HTML. Structure: introduction (generated from the text if needed), then `<div class="protonmail_forward">` with the header block and the **original HTML**. `cid:` references are kept.
- **Attachments:** `carryAttachments(original)` carries over all attachments, including embedded images with their `cid`. Signature parts (PKCS#7, PGP) are dropped because they no longer match the new message. With `includeAttachments: false` there are no attachments. Embedded images in the original HTML are then not displayed.
- **Threading:** No `In-Reply-To` and no `References` are set. A forward starts a new conversation.

The original is loaded completely through `loadMessage()` (not partially), so the attachments have their content.

## Return

`forward_email`:

```javascript
{ success: true, messageId: "<…>", to: "buchhaltung@example.com", cc: "", subject: "Fwd: Rechnung Oktober", attachments: ["logo.png", "Rechnung.pdf"] }
```

`create_draft` with `forwardUid` returns the usual draft summary (see `create-draft.md`) with `inReplyTo: null`.

## Error handling

- `replyToUid` and `forwardUid` together: `Use either replyToUid or forwardUid, not both: a draft is a reply or a forward.` The check runs before the mailbox is touched.
- `create_draft` without `body` and without `forwardUid`: `body is required unless the draft forwards an email (forwardUid).`
- Unknown UID: `No message with UID … in folder "…". UIDs are per folder – check the folder name.`
- Attachments too large for Proton: the SMTP error is returned unchanged. The workaround is `includeAttachments: false`.
- Like every send, `forward_email` is not retried (see `connections/smtp-send.md`).

## Tests

`test/forward.test.js` checks the following:
- the prefixes `Fwd:`/`Fw:`/`WG:` and the header block in text and HTML; an empty Cc line is left out
- that `stripQuoted` recognizes the separator line
- the structure without threading headers
- with the MIME fixture `test/fixtures/forward-source.eml`: the PDF and the embedded image are included (`cid` kept), the signature is left out
- `includeAttachments: false`
- the `replyToUid` + `forwardUid` conflict and the modes

`scripts/smoke.mjs --drafts` creates a forward draft of the newest INBOX message live and deletes it again.
