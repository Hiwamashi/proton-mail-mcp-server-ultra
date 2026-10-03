# Measurements: reduce-message-refetch

[Deutsch](#deutsch) | [English](#english)

## Deutsch

Live-Messung gegen die lokal laufende Proton Mail Bridge (127.0.0.1, nur lesend). Es sind nur UIDs, Größen, Anzahlen, Wahrheitswerte und Zeiten festgehalten, keine Mailinhalte. Messwerte schwanken, weil die Bridge lokal läuft und Netzwerkzeit fehlt; Größenordnungen zählen, nicht einzelne Millisekunden.

Skripte: `scripts/compare-partial.mjs` (Vergleich voller und teilweiser Pfad), `scripts/measure-read.mjs` (Zeiten über den gebauten Server).

### Vergleich voller und teilweiser Pfad

Alle 106 Nachrichten in "All Mail" über der Schwelle von 5 242 880 Bytes (5 bis 47 MB) wurden geprüft.

| Ergebnis | Wert |
|---|---|
| Nachrichten geprüft | 106 |
| Teilpfad verwendet (kein Rückfall auf den vollen Pfad) | 106 von 106 |
| Anhangsliste identisch (Dateiname, Typ, Disposition, cid, related, partId, Größe) | 106 von 106 |
| Text und HTML identisch | 106 von 106 |
| Kopfzeilen (Betreff, Absender, Empfänger, Datum, Message-ID) identisch | 106 von 106 |
| Anhangsinhalt per Teil-Download identisch (bis zu 3 Anhänge je Nachricht) | 106 von 106 |
| Anhänge mit Größe 0 | 0 |
| Abweichende Anhangsgrößen | 0 |

Beispiel der 10 größten Nachrichten (volle Ladezeit gegen Teilpfad, ms):

| UID | Größe (Bytes) | Anhänge | voll | teilweise |
|---|---|---|---|---|
| 32864 | 46 723 757 | 1 | 390 | 124 |
| 8700 | 30 571 848 | 3 | 219 | 115 |
| 8495 | 29 745 767 | 11 | 233 | 386 |
| 33174 | 26 354 413 | 5 | 174 | 138 |
| 33169 | 26 353 581 | 5 | 173 | 137 |
| 32201 | 23 414 137 | 1 | 162 | 45 |
| 32951 | 20 677 253 | 1 | 141 | 43 |
| 32027 | 19 059 319 | 4 | 127 | 83 |
| 8876 | 18 967 122 | 7 | 126 | 135 |
| 32712 | 18 704 585 | 1 | 125 | 36 |

### Zeiten über den gebauten Server

`read_email` und `get_attachment` (Index 0) je zweimal nacheinander. "Vorher" ist `PROTON_MCP_CACHE_MAX_BYTES=0` und `PROTON_MCP_PARTIAL_FETCH_BYTES=999999999999`; "Nachher" sind die Standardwerte. Angaben in ms.

UID 32864 (46,7 MB, ein PDF-Anhang):

| Einstellung | read 1 | attach 1 | read 2 | attach 2 |
|---|---|---|---|---|
| Vorher (Cache aus, Teilpfad aus) | 600 | 409 | 372 | 404 |
| nur Cache | 575 | 405 | 353 | 399 |
| nur Teilpfad | 304 | 1129 | 121 | 1539 |
| Nachher (Standard) | 295 | 1028 | 2 | 1008 |

UID 8495 (29,7 MB, 11 Anhänge, Index 0 ist klein):

| Einstellung | read 1 | attach 1 | read 2 | attach 2 |
|---|---|---|---|---|
| Vorher | 499 | 278 | 265 | 241 |
| nur Cache | 481 | 24 | 2 | 5 |
| nur Teilpfad | 569 | 421 | 288 | 401 |
| Nachher (Standard) | 1596 | 777 | 5 | 482 |

Einordnung: Gegen die lokale Bridge ist der volle Download schnell (etwa 125 bis 400 ms für 20 bis 47 MB). Der Cache spart den wiederholten Abruf deutlich (zweites `read_email` 2 bis 5 ms statt 265 bis 372 ms). Der Teilpfad senkt das erste `read_email` bei Nachrichten mit großem Anhang (UID 32864: 600 auf 295 ms), macht `get_attachment` bei einem großen einzelnen Anhang aber langsamer (UID 32864: etwa 400 auf etwa 1000 ms), weil der Anhang in 1-MB-Blöcken geladen und nicht gecacht wird. Der Vorteil des Teilpfads liegt vor allem in der übertragenen Datenmenge, nicht in der Zeit gegen eine lokale Bridge. Einzelwerte (UID 8495 "Nachher", read 1) enthalten Ausreißer.

### Nach der Korrekturrunde (Commit 83e5acf)

Anhangsteile werden jetzt mit einer einzigen Anfrage geholt und im Prozess dekodiert, nicht mehr in 1-MB-Blöcken. Der Vergleich über alle 106 Nachrichten wurde wiederholt: Anhangsliste, Text/HTML, Kopfzeilen und Anhangsinhalt per Teil-Download sind weiterhin in 106 von 106 identisch, 0 Rückfälle, 0 Abweichungen.

UID 32864, Zeiten in ms (die Zeile "vor der Korrekturrunde" bleibt zum Vergleich stehen):

| Einstellung | read 1 | attach 1 | read 2 | attach 2 |
|---|---|---|---|---|
| Vorher (Cache aus, Teilpfad aus) | 615 | 408 | 374 | 421 |
| nur Teilpfad, vor der Korrekturrunde | 304 | 1129 | 121 | 1539 |
| nur Teilpfad, nach der Korrekturrunde | 329 | 236 | 72 | 199 |
| Nachher (Standard), vor der Korrekturrunde | 295 | 1028 | 2 | 1008 |
| Nachher (Standard), nach der Korrekturrunde | 310 | 177 | 2 | 131 |

Damit ist `get_attachment` mit den Standardwerten schneller als vorher (etwa 130 bis 180 ms statt etwa 410 ms); die frühere Verlangsamung von etwa 1000 ms ist behoben.

## English

Live measurement against the locally running Proton Mail Bridge (127.0.0.1, read-only). Only UIDs, sizes, counts, booleans and timings are recorded, no mail content. Numbers vary because the Bridge is local and there is no network time; orders of magnitude matter, not single milliseconds.

Scripts: `scripts/compare-partial.mjs` (full vs partial path comparison), `scripts/measure-read.mjs` (timings through the built server).

### Full vs partial path comparison

All 106 messages in "All Mail" above the 5,242,880 byte threshold (5 to 47 MB) were checked.

| Result | Value |
|---|---|
| Messages checked | 106 |
| Partial path used (no fallback to the full path) | 106 of 106 |
| Attachment list identical (filename, type, disposition, cid, related, partId, size) | 106 of 106 |
| Text and HTML identical | 106 of 106 |
| Headers (subject, sender, recipients, date, message id) identical | 106 of 106 |
| Attachment content identical via part download (up to 3 attachments per message) | 106 of 106 |
| Attachments of size 0 | 0 |
| Differing attachment sizes | 0 |

Sample of the 10 largest messages (full load time vs partial path, ms):

| UID | Size (bytes) | Attachments | full | partial |
|---|---|---|---|---|
| 32864 | 46,723,757 | 1 | 390 | 124 |
| 8700 | 30,571,848 | 3 | 219 | 115 |
| 8495 | 29,745,767 | 11 | 233 | 386 |
| 33174 | 26,354,413 | 5 | 174 | 138 |
| 33169 | 26,353,581 | 5 | 173 | 137 |
| 32201 | 23,414,137 | 1 | 162 | 45 |
| 32951 | 20,677,253 | 1 | 141 | 43 |
| 32027 | 19,059,319 | 4 | 127 | 83 |
| 8876 | 18,967,122 | 7 | 126 | 135 |
| 32712 | 18,704,585 | 1 | 125 | 36 |

### Timings through the built server

`read_email` and `get_attachment` (index 0), each called twice in a row. "Before" is `PROTON_MCP_CACHE_MAX_BYTES=0` and `PROTON_MCP_PARTIAL_FETCH_BYTES=999999999999`; "after" uses the defaults. Values in ms.

UID 32864 (46.7 MB, one PDF attachment):

| Setting | read 1 | attach 1 | read 2 | attach 2 |
|---|---|---|---|---|
| Before (cache off, partial off) | 600 | 409 | 372 | 404 |
| cache only | 575 | 405 | 353 | 399 |
| partial only | 304 | 1129 | 121 | 1539 |
| After (defaults) | 295 | 1028 | 2 | 1008 |

UID 8495 (29.7 MB, 11 attachments, index 0 is small):

| Setting | read 1 | attach 1 | read 2 | attach 2 |
|---|---|---|---|---|
| Before | 499 | 278 | 265 | 241 |
| cache only | 481 | 24 | 2 | 5 |
| partial only | 569 | 421 | 288 | 401 |
| After (defaults) | 1596 | 777 | 5 | 482 |

Interpretation: against the local Bridge the full download is fast (about 125 to 400 ms for 20 to 47 MB). The cache clearly saves repeated fetches (second `read_email` 2 to 5 ms instead of 265 to 372 ms). The partial path lowers the first `read_email` for messages with a large attachment (UID 32864: 600 to 295 ms) but makes `get_attachment` slower for one large attachment (UID 32864: about 400 to about 1000 ms), because the attachment is downloaded in 1 MB chunks and not cached. The benefit of the partial path is mainly the transferred data volume, not time against a local Bridge. Single values (UID 8495 "after", read 1) include outliers.

### After the fix round (commit 83e5acf)

Attachment parts are now fetched with a single request and decoded in-process instead of in 1 MB chunks. The comparison over all 106 messages was repeated: attachment list, text/HTML, headers and attachment content via part download are still identical in 106 of 106, 0 fallbacks, 0 mismatches.

UID 32864, timings in ms (the "before fix round" rows are kept for the record):

| Setting | read 1 | attach 1 | read 2 | attach 2 |
|---|---|---|---|---|
| Before (cache off, partial off) | 615 | 408 | 374 | 421 |
| partial only, before fix round | 304 | 1129 | 121 | 1539 |
| partial only, after fix round | 329 | 236 | 72 | 199 |
| After (defaults), before fix round | 295 | 1028 | 2 | 1008 |
| After (defaults), after fix round | 310 | 177 | 2 | 131 |

With the defaults `get_attachment` is now faster than before (about 130 to 180 ms instead of about 410 ms); the earlier slowdown of about 1000 ms is gone.
