**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Nachrichten-Cache und teilweiser Download

**Dateien:** src/message-cache.js, src/partial-fetch.js, src/connections.js (`loadMessage`, `loadAttachment`), src/config.js, src/attachments.js

## Zweck

`read_email` und `get_attachment` luden bisher bei jedem Aufruf die komplette Mail neu, auch wenn mehrere Anhänge derselben Mail nacheinander geöffnet wurden. Zwei Mechanismen verringern das:

1. **Cache** geparster Mails im Arbeitsspeicher (`MessageCache`).
2. **Teilweiser Download** großer Mails: nur Header und Textteile werden geholt, ein Anhang erst auf Anforderung.

Beides ist in `loadMessage()` gebündelt, das alle Tools statt des früheren `fetchParsed()` verwenden.

## Einstellungen

| Variable | Standard | Bedeutung |
|---|---|---|
| `PROTON_MCP_CACHE_MAX_BYTES` | `67108864` (64 MB) | Gesamtbudget des Caches in Bytes. `0` schaltet den Cache aus |
| `PROTON_MCP_CACHE_TTL_MS` | `600000` (10 min) | Lebensdauer eines Eintrags in Millisekunden |
| `PROTON_MCP_PARTIAL_FETCH_BYTES` | `5242880` (5 MB) | Ab dieser Nachrichtengröße wird teilweise geladen. Ein sehr hoher Wert (z. B. `999999999999`) schaltet den Teilpfad faktisch aus |
| `PROTON_MCP_MAX_INLINE_IMAGE_BYTES` | `1048576` (1 MB) | Größte Bilddatei, die `get_attachment` als Bild zurückgibt; größere werden gespeichert |

Alle vier stehen in `CONFIG` (`cacheMaxBytes`, `cacheTtlMs`, `partialFetchBytes`, `maxInlineImageBytes`). Siehe auch `configuration.md`.

## Cache (`MessageCache`)

- **Schlüssel:** Ordner + UIDVALIDITY + UID (`folder|uidValidity|uid`). Ändert sich UIDVALIDITY eines Ordners, treffen alte Einträge nie mehr, weil der Schlüssel ein anderer ist.
- **Inhalt:** das geparste Mail-Objekt (`parsed`) und bei Teilladung die Angaben zum Nachladen der Anhänge. Nur im Arbeitsspeicher, nie auf der Festplatte.
- **Budget:** LRU nach Bytes. Gezählt wird die Rohgröße der Nachricht (bei Teilladung die Größe des Gerüsts), nicht die Größe des geparsten Objekts. Ist das Budget überschritten, fliegen die am längsten unbenutzten Einträge zuerst raus.
- **TTL:** Jeder Eintrag läuft nach `PROTON_MCP_CACHE_TTL_MS` ab. Abgelaufene Einträge werden beim Zugriff und vor dem Speichern entfernt.
- **Zu große Einträge:** Ein Eintrag über der Hälfte des Budgets wird nicht gespeichert (`set()` gibt `false` zurück), damit er nicht den ganzen Cache verdrängt.
- **Flags immer frisch:** Auch bei einem Treffer holt `loadMessage()` die Flags in einer eigenen kleinen Anfrage. Flags ändern sich, ohne dass sich der Inhalt ändert. Ist die Nachricht dabei verschwunden, wird der Eintrag verworfen und `NotFoundError` geworfen.
- **Kein `\Seen`:** imapflow holt den Inhalt mit `BODY.PEEK`, Lesen setzt das Flag nicht.
- **Gemeinsames Objekt:** `parsed` kann mit dem Cache geteilt sein und darf nicht verändert werden.

### Invalidierung

IMAP-Inhalt ist für eine feste Kombination aus UIDVALIDITY und UID unveränderlich. Veralten kann ein Eintrag nur, wenn die Nachricht verschoben, gelöscht oder ersetzt wird. Deshalb rufen diese Stellen `messageCache.invalidate(folder, uid)` auf (entfernt alle Einträge des Ordners und der UID, gleich welche UIDVALIDITY):

| Stelle | Datei | Ordner |
|---|---|---|
| `move_email` | src/tools/mailbox.js | Quellordner |
| `delete_email` (Papierkorb, endgültig) | src/tools/mailbox.js | Ordner der Mail |
| `delete_email` (in den Papierkorb) | src/tools/mailbox.js | Ordner der Mail |
| `update_draft` (nach dem Löschen des alten Entwurfs) | src/tools/compose.js | Entwürfe |
| `send_draft` (nach dem Löschen des Entwurfs) | src/tools/compose.js | Entwürfe |
| `delete_draft` | src/tools/compose.js | Entwürfe |

`loadMessage()` selbst verwirft den Eintrag, wenn die Flags-Anfrage die Nachricht nicht mehr findet. `shutdownConnections()` leert den Cache (`clear()`).

## Teilweiser Download

`loadMessage(client, folder, uid, { allowPartial })` entscheidet den Pfad:

1. Treffer im Cache (und passend zu `allowPartial`): nur Flags holen.
2. Sonst, nur mit `allowPartial: true`: `loadPartial()` fragt Größe und BODYSTRUCTURE ab. Ist die Nachricht nicht größer als `PROTON_MCP_PARTIAL_FETCH_BYTES`, ist das Ergebnis `null`.
3. Sonst `loadFull()`: ganze Quelle holen und mit `simpleParser` (`skipImageLinks: true`) parsen.

Nur `read_email` und `get_attachment` übergeben `allowPartial: true`. Alles, was eine Mail neu aufbaut oder verschickt (Antworten, `update_draft`, `send_draft`, `delete_draft`), nimmt immer den vollen Pfad und bekommt nie einen teilweise geladenen Eintrag. Ist für eine UID nur ein Teileintrag im Cache, laden diese Aufrufer die Mail voll und ersetzen den Eintrag.

### Ablauf in `loadPartially()` (src/partial-fetch.js)

1. `planPartialFetch()` geht den BODYSTRUCTURE-Baum durch und plant: Anhangsteile, Textteile (`text/plain`, `text/html`, `message/delivery-status`) und alle MIME-Köpfe.
2. Es werden geholt: die Hauptkopfzeilen, der MIME-Kopf jedes Teils (`<teil>.mime`) und die Textteile.
3. Daraus wird ein Gerüst gebaut: Originalkopfzeilen, MIME-Köpfe und Textkörper, die Anhangskörper bleiben leer.
4. **mailparser** parst das Gerüst. Kopfzeilen, Text, HTML und die Anhangsliste (Reihenfolge, Dateiname, Typ, Disposition, cid, related) stammen damit von mailparser selbst und können nicht vom vollen Pfad abweichen.
5. **Gegenprobe (Index-Stabilität):** Die von mailparser gefundenen Anhänge müssen genau die aus BODYSTRUCTURE geplanten Teile sein, in derselben Reihenfolge (`partId` je Anhang). Sonst Rückfall auf den vollen Pfad. Dadurch bleibt der Anhangs-Index von `read_email` für `get_attachment` gültig.
6. Die dekodierte Größe eines base64-Anhangs wird aus der kodierten Größe plus den ersten 200 und den letzten 8 Bytes berechnet (`decodedBase64Size`). Das sind zwei zusätzliche kleine FETCH-Anfragen je base64-Anhang.

Die Anhänge im Ergebnis haben `content: null`. `partial.parts[i]` ist die IMAP-Teilnummer von Anhang `i`, `partial.encodings[i]` seine Kodierung.

### Rückfälle auf den vollen Pfad

`loadPartially()` liefert `null`, und `loadMessage()` lädt die ganze Mail, wenn:

- die Nachricht nicht größer als der Schwellwert ist oder keine BODYSTRUCTURE hat,
- die Wurzel kein bekanntes `multipart/*` mit Begrenzer ist (Einzelteil-Nachrichten),
- `multipart/encrypted` oder ein unbekannter multipart-Typ vorkommt,
- `application/pkcs7-mime` / `application/x-pkcs7-mime` (S/MIME) oder `text/x-amp-html` vorkommt,
- eine eingebettete Nachricht (`message/rfc822` mit Disposition `inline`) vorkommt, in die mailparser hineinschaut,
- ein Anhang quoted-printable oder anders kodiert ist (erlaubt sind identity-Kodierungen und base64),
- ein Teil keine Teilnummer hat, ein MIME-Kopf nicht mit einer Leerzeile endet oder der Server binäre Teile liefert,
- mailparser das Gerüst nicht parsen kann,
- die Gegenprobe der Anhangsliste fehlschlägt (Anzahl oder `partId` weichen ab),
- die Größe eines base64-Anhangs nicht bestimmt werden kann.

### Anhang laden (`loadAttachment`)

Für teilweise geladene Mails holt `loadAttachment()` nur den einen angeforderten Teil mit **einer** Anfrage (`bodyParts`, nicht in 1-MB-Blöcken wie `client.download()`) und dekodiert ihn im Prozess (base64 oder unverändert). Der Anhang wird nicht gecacht, `size` entspricht der tatsächlichen Länge. Bei vollständig geladenen Mails kommt der Anhang direkt aus `parsed`.

## Bild-Limit

`attachmentToContent()` (src/attachments.js) gibt ein Bild nur zurück, wenn `size ≤ PROTON_MCP_MAX_INLINE_IMAGE_BYTES`. Der Standard ist **1 MB** (früher 5 MB). Größere Bilder werden gespeichert, die Antwort lautet:

```
Image exceeds the inline limit of <größe> (PROTON_MCP_MAX_INLINE_IMAGE_BYTES) and is not shown inline. Saved to: <pfad>
```

Das alte Verhalten stellt `PROTON_MCP_MAX_INLINE_IMAGE_BYTES=5242880` wieder her.

## Rückbau

| Ziel | Einstellung |
|---|---|
| Cache aus | `PROTON_MCP_CACHE_MAX_BYTES=0` |
| Teilpfad aus | `PROTON_MCP_PARTIAL_FETCH_BYTES=999999999999` |
| Bild-Limit wie früher | `PROTON_MCP_MAX_INLINE_IMAGE_BYTES=5242880` |

Mit Cache aus und Teilpfad aus verhält sich `loadMessage()` wie das frühere `fetchParsed()`.

## Messung (Live-Bridge, nur Zahlen)

Quelle: `openspec/changes/reduce-message-refetch/measurements.md`. Lokale Bridge, Werte schwanken; die Größenordnung zählt.

**Vergleich voller und teilweiser Pfad:** 106 Nachrichten über 5 242 880 Bytes (5 bis 47 MB) in „All Mail“. In 106 von 106 wurde der Teilpfad genutzt (kein Rückfall), und Anhangsliste, Text/HTML, Kopfzeilen und Anhangsinhalt waren identisch (0 Abweichungen).

**Zeiten über den gebauten Server, UID 32864 (46,7 MB, ein PDF), in ms:**

| Einstellung | read 1 | attach 1 | read 2 | attach 2 |
|---|---|---|---|---|
| Vorher (Cache aus, Teilpfad aus) | 615 | 408 | 374 | 421 |
| Teilpfad, vor der Korrekturrunde (Anhang in 1-MB-Blöcken) | 304 | 1129 | 121 | 1539 |
| Teilpfad, nach der Korrekturrunde | 329 | 236 | 72 | 199 |
| Standard, vor der Korrekturrunde | 295 | 1028 | 2 | 1008 |
| Standard, nach der Korrekturrunde | 310 | 177 | 2 | 131 |

UID 8495 (29,7 MB, 11 Anhänge), Vorher gegen nur Cache: zweites `read_email` 265 gegen 2 ms, zweites `get_attachment` 241 gegen 5 ms.

## Bekannte Grenzen

- **Budget zählt Rohgröße.** Das Budget rechnet mit der Größe der Rohnachricht (bei Teilladung mit der des Gerüsts). Das geparste Objekt kann im Speicher größer sein; der tatsächliche Speicherbedarf kann das Budget deshalb übersteigen.
- **Teileinträge nur für Lesen.** Teilweise geladene Einträge bekommen nur `read_email` und `get_attachment`. `update_draft`, `send_draft`, `delete_draft` und das Laden für Antworten laden immer voll.
- **Zusätzliche Anfragen bei einem Fehlzugriff.** Der Teilpfad kostet bei einem Cache-Fehlzugriff mehr FETCH-Anfragen: Größe und BODYSTRUCTURE, Kopf- und Textteile, je base64-Anhang zwei kleine Größenanfragen. Gegen eine lokale Bridge ist der volle Download schnell; der Nutzen des Teilpfads liegt vor allem in der übertragenen Datenmenge.
- **Anhänge werden nicht gecacht.** Jeder `get_attachment`-Aufruf einer Teilmail holt den Anhang erneut.
- **Nur ein Prozess.** Der Cache gilt je Serverprozess und überlebt keinen Neustart.

---

## English

# Message Cache and Partial Download

**Files:** src/message-cache.js, src/partial-fetch.js, src/connections.js (`loadMessage`, `loadAttachment`), src/config.js, src/attachments.js

## Purpose

`read_email` and `get_attachment` used to download the whole message on every call, even when several attachments of the same message were opened one after another. Two mechanisms reduce that:

1. A **cache** of parsed messages in memory (`MessageCache`).
2. **Partial download** of large messages: only headers and text parts are fetched, an attachment only on request.

Both are bundled in `loadMessage()`, which all tools use instead of the former `fetchParsed()`.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `PROTON_MCP_CACHE_MAX_BYTES` | `67108864` (64 MB) | Total cache budget in bytes. `0` disables the cache |
| `PROTON_MCP_CACHE_TTL_MS` | `600000` (10 min) | Lifetime of an entry in milliseconds |
| `PROTON_MCP_PARTIAL_FETCH_BYTES` | `5242880` (5 MB) | From this message size on, the message is loaded partially. A very high value (e.g. `999999999999`) effectively disables the partial path |
| `PROTON_MCP_MAX_INLINE_IMAGE_BYTES` | `1048576` (1 MB) | Largest image file `get_attachment` returns as an image; larger ones are saved |

All four are in `CONFIG` (`cacheMaxBytes`, `cacheTtlMs`, `partialFetchBytes`, `maxInlineImageBytes`). See also `configuration.md`.

## Cache (`MessageCache`)

- **Key:** folder + UIDVALIDITY + UID (`folder|uidValidity|uid`). If the UIDVALIDITY of a folder changes, old entries never match again because the key differs.
- **Content:** the parsed message object (`parsed`) and, for a partial load, the data needed to fetch attachments later. In memory only, never on disk.
- **Budget:** LRU by bytes. What is counted is the raw size of the message (for a partial load, the size of the skeleton), not the size of the parsed object. When the budget is exceeded, the least recently used entries go first.
- **TTL:** Every entry expires after `PROTON_MCP_CACHE_TTL_MS`. Expired entries are removed on access and before storing.
- **Oversize entries:** An entry above half the budget is not stored (`set()` returns `false`), so it cannot push out the whole cache.
- **Flags always fresh:** Even on a hit, `loadMessage()` fetches the flags in a separate small request. Flags change without the content changing. If the message has disappeared meanwhile, the entry is dropped and `NotFoundError` is thrown.
- **No `\Seen`:** imapflow fetches the content with `BODY.PEEK`, reading does not set the flag.
- **Shared object:** `parsed` may be shared with the cache and must not be mutated.

### Invalidation

IMAP content is immutable for a fixed combination of UIDVALIDITY and UID. An entry can only go stale when the message is moved, deleted or replaced. That is why these places call `messageCache.invalidate(folder, uid)` (removes all entries of that folder and UID, whatever the UIDVALIDITY):

| Place | File | Folder |
|---|---|---|
| `move_email` | src/tools/mailbox.js | source folder |
| `delete_email` (in Trash, permanent) | src/tools/mailbox.js | folder of the message |
| `delete_email` (move to Trash) | src/tools/mailbox.js | folder of the message |
| `update_draft` (after deleting the old draft) | src/tools/compose.js | Drafts |
| `send_draft` (after deleting the draft) | src/tools/compose.js | Drafts |
| `delete_draft` | src/tools/compose.js | Drafts |

`loadMessage()` itself drops the entry if the flags request no longer finds the message. `shutdownConnections()` empties the cache (`clear()`).

## Partial download

`loadMessage(client, folder, uid, { allowPartial })` decides the path:

1. Cache hit (and compatible with `allowPartial`): fetch the flags only.
2. Otherwise, only with `allowPartial: true`: `loadPartial()` queries size and BODYSTRUCTURE. If the message is not larger than `PROTON_MCP_PARTIAL_FETCH_BYTES`, the result is `null`.
3. Otherwise `loadFull()`: fetch the whole source and parse it with `simpleParser` (`skipImageLinks: true`).

Only `read_email` and `get_attachment` pass `allowPartial: true`. Everything that rebuilds or sends a message (replies, `update_draft`, `send_draft`, `delete_draft`) always takes the full path and never receives a partially loaded entry. If only a partial entry is cached for a UID, these callers load the message in full and replace the entry.

### Flow in `loadPartially()` (src/partial-fetch.js)

1. `planPartialFetch()` walks the BODYSTRUCTURE tree and plans: attachment parts, text parts (`text/plain`, `text/html`, `message/delivery-status`) and all MIME headers.
2. It fetches: the main headers, the MIME header of every part (`<part>.mime`) and the text parts.
3. From these it builds a skeleton: original headers, MIME headers and text bodies, with the attachment bodies left empty.
4. **mailparser** parses the skeleton. Headers, text, HTML and the attachment list (order, filename, type, disposition, cid, related) therefore come from mailparser itself and cannot drift from the full path.
5. **Cross-check (index stability):** The attachments mailparser finds must be exactly the parts planned from BODYSTRUCTURE, in the same order (`partId` per attachment). Otherwise it falls back to the full path. This keeps the attachment index from `read_email` valid for `get_attachment`.
6. The decoded size of a base64 attachment is computed from the encoded size plus the first 200 and the last 8 bytes (`decodedBase64Size`). That is two extra small FETCH requests per base64 attachment.

The attachments in the result have `content: null`. `partial.parts[i]` is the IMAP part number of attachment `i`, `partial.encodings[i]` its encoding.

### Fallbacks to the full path

`loadPartially()` returns `null`, and `loadMessage()` loads the whole message, when:

- the message is not larger than the threshold or has no BODYSTRUCTURE,
- the root is not a known `multipart/*` with a boundary (single-part messages),
- `multipart/encrypted` or an unknown multipart type occurs,
- `application/pkcs7-mime` / `application/x-pkcs7-mime` (S/MIME) or `text/x-amp-html` occurs,
- an embedded message (`message/rfc822` with disposition `inline`) occurs, which mailparser descends into,
- an attachment is quoted-printable or otherwise encoded (identity encodings and base64 are allowed),
- a part has no part number, a MIME header does not end with a blank line, or the server returns binary parts,
- mailparser cannot parse the skeleton,
- the cross-check of the attachment list fails (count or `partId` differ),
- the size of a base64 attachment cannot be determined.

### Loading an attachment (`loadAttachment`)

For partially loaded messages, `loadAttachment()` fetches only the one requested part with **one** request (`bodyParts`, not in 1 MB chunks like `client.download()`) and decodes it in-process (base64 or as is). The attachment is not cached, and `size` is the actual length. For fully loaded messages the attachment comes straight from `parsed`.

## Image limit

`attachmentToContent()` (src/attachments.js) returns an image only if `size ≤ PROTON_MCP_MAX_INLINE_IMAGE_BYTES`. The default is **1 MB** (previously 5 MB). Larger images are saved, and the reply reads:

```
Image exceeds the inline limit of <size> (PROTON_MCP_MAX_INLINE_IMAGE_BYTES) and is not shown inline. Saved to: <path>
```

`PROTON_MCP_MAX_INLINE_IMAGE_BYTES=5242880` restores the old behavior.

## Rollback

| Goal | Setting |
|---|---|
| Cache off | `PROTON_MCP_CACHE_MAX_BYTES=0` |
| Partial path off | `PROTON_MCP_PARTIAL_FETCH_BYTES=999999999999` |
| Image limit as before | `PROTON_MCP_MAX_INLINE_IMAGE_BYTES=5242880` |

With the cache off and the partial path off, `loadMessage()` behaves like the former `fetchParsed()`.

## Measurement (live Bridge, numbers only)

Source: `openspec/changes/reduce-message-refetch/measurements.md`. Local Bridge, values vary; orders of magnitude matter.

**Full vs partial path comparison:** 106 messages above 5,242,880 bytes (5 to 47 MB) in "All Mail". In 106 of 106 the partial path was used (no fallback), and attachment list, text/HTML, headers and attachment content were identical (0 mismatches).

**Timings through the built server, UID 32864 (46.7 MB, one PDF), in ms:**

| Setting | read 1 | attach 1 | read 2 | attach 2 |
|---|---|---|---|---|
| Before (cache off, partial off) | 615 | 408 | 374 | 421 |
| Partial only, before fix round (attachment in 1 MB chunks) | 304 | 1129 | 121 | 1539 |
| Partial only, after fix round | 329 | 236 | 72 | 199 |
| Defaults, before fix round | 295 | 1028 | 2 | 1008 |
| Defaults, after fix round | 310 | 177 | 2 | 131 |

UID 8495 (29.7 MB, 11 attachments), before vs cache only: second `read_email` 265 vs 2 ms, second `get_attachment` 241 vs 5 ms.

## Known limits

- **Budget counts raw size.** The budget uses the size of the raw message (for a partial load, of the skeleton). The parsed object can be larger in memory, so the real memory use can exceed the budget.
- **Partial entries for reading only.** Only `read_email` and `get_attachment` get partially loaded entries. `update_draft`, `send_draft`, `delete_draft` and loading for replies always load in full.
- **Extra requests on a miss.** On a cache miss the partial path costs more FETCH requests: size and BODYSTRUCTURE, headers and text parts, plus two small size probes per base64 attachment. Against a local Bridge the full download is fast; the benefit of the partial path is mainly the transferred data volume.
- **Attachments are not cached.** Every `get_attachment` call on a partial message fetches the attachment again.
- **One process only.** The cache is per server process and does not survive a restart.
