**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Office- und OpenDocument-Anhänge als Text

**Dateien:** src/office.js (Extraktion), src/attachments.js (Anbindung in `attachmentToContent`)

## Zweck

`get_attachment` liefert den Text von Word-, Excel- und PowerPoint-Dateien (`.docx`, `.xlsx`, `.pptx`) sowie von OpenDocument-Dateien (`.odt`, `.ods`, `.odp`). Früher wurden diese Dateien nur gespeichert. Der Text wird wie andere Textinhalte mit `offset` und `maxChars` seitenweise ausgegeben.

## Erkennung (`officeKind`)

- Die Dateiendung hat Vorrang vor einem allgemeinen MIME-Typ wie `application/octet-stream`.
- Ohne passende Endung zählt der MIME-Typ, z. B. `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- `.doc`, `.xls`, `.ppt` und ihre MIME-Typen (`application/msword`, `application/vnd.ms-excel`, `application/vnd.ms-powerpoint`) gelten als `legacy`.

## Ausgabe je Format

| Format | Gelesener Teil | Ausgabe |
|---|---|---|
| DOCX | `word/document.xml` | Absätze als Zeilen. Überschriften (Formatvorlagen `Heading N`, `Überschrift N`, `berschriftN`, `Title`) mit `#`, Listeneinträge (`w:numPr`) mit `- `. Tabellenzeilen tabulatorgetrennt. `w:tab` → Tab, `w:br`/`w:cr` → Zeilenumbruch. Gelöschter Text aus der Änderungsverfolgung (`w:delText`) fehlt. Textfelder (`w:txbxContent`) stehen an ihrer Stelle im umgebenden Absatz; die Ersatzdarstellung `mc:Fallback` wird übersprungen, damit nichts doppelt erscheint |
| PPTX | `ppt/presentation.xml`, Relationen, `ppt/slides/slideN.xml` | Ein Block `=== Slide N ===` pro Folie, in Präsentationsreihenfolge (`p:sldIdLst`). Ohne diese Liste wird nach Dateinummer sortiert |
| XLSX | `xl/workbook.xml`, Relationen, `sharedStrings.xml`, `styles.xml`, Arbeitsblätter | Ein Block `=== Sheet: <Name> ===` pro Blatt, Zeilen tabulatorgetrennt. Zellen stehen an ihrer Spalte aus dem Zellbezug, leere Zeilen fehlen. Werte: geteilte und Inline-Texte, `TRUE`/`FALSE`, Zahlen ohne Gleitkomma-Rauschen (`0.30000000000000004` → `0.3`). Datumszellen (eingebaute Datumsformate 14–22 und 45–47 oder eigene Formate mit d/m/y/h/s) werden als `YYYY-MM-DD`, `YYYY-MM-DD HH:MM` oder `HH:MM` ausgegeben, auch im 1904-Datumssystem älterer Mac-Dateien (`workbookPr date1904`). Dauerformate wie `[h]:mm` (und das eingebaute Format 46) erscheinen als Gesamtstunden, z. B. `1.5` → `36:00`. Formeln werden nicht ausgegeben, nur ihr gespeichertes Ergebnis |
| ODT | `content.xml` | Überschriften (`text:h`) mit `#` nach `text:outline-level`, Listen mit `- `, Tabellen tabulatorgetrennt, `text:tab`, `text:line-break`, `text:s`. Kommentare (`office:annotation`) fehlen |
| ODS | `content.xml` | Ein Block pro Tabelle mit ihrem Namen. Jede Zelle liefert ihren **angezeigten** Text aus `text:p`, also mit Zahlen- und Datumsformat. Wiederholte leere Zellen und Zeilen werden nicht aufgefüllt. Nicht leere Wiederholungen werden höchstens 100-mal ausgegeben |
| ODP | `content.xml` | Ein Block `=== Slide N ===` pro `draw:page`, mit dem Seitennamen, wenn er nicht der Standardname `pageN` ist. Sprechernotizen fehlen |

Am Ende läuft der Text durch `normalizeText()`.

Bekannte Grenzen: Kopf- und Fußzeilen, Fußnoten und Kommentare in DOCX sowie Diagramme und eingebettete Objekte werden nicht gelesen. XLSX zeigt Zahlen ohne ihr Anzeigeformat; nur Datums- und Dauerangaben werden umgerechnet. Die Namensraum-Präfixe sind fest (`w:`, `a:`, SpreadsheetML ohne Präfix); Dateien mit anderen Präfixen gelten als beschädigt und werden gespeichert. In ODT erscheint gelöschter Text aus der Änderungsverfolgung (`text:tracked-changes`) als zusätzliche Absätze.

## Wenn eine Datei nicht lesbar ist

Die Datei wird im Anhangsordner gespeichert, und die Antwort nennt den Grund (`OfficeError.reason`):

| Grund | Erkennung | Meldung |
|---|---|---|
| `encrypted` | Die Datei beginnt mit der OLE-Signatur `D0 CF 11 E0 …` (so sehen passwortgeschützte OOXML-Dateien aus, aber auch alte `.doc`/`.xls`, die nur umbenannt wurden), oder `META-INF/manifest.xml` enthält `encryption-data` (ODF) | OLE: `This Word document is password-protected (encrypted) or a legacy binary Office file with a new extension, so its text cannot be read. Saved to: …`; ODF: `… is password-protected (encrypted) …` |
| `too-large` | Die deklarierte Größe der benötigten Teile übersteigt in Summe 50 MB, oder das Archiv hat mehr als 10 000 Einträge | `… expands to more than 50 MB (possible ZIP bomb) …` |
| `damaged` | Kein gültiges ZIP, oder ein Pflichtteil fehlt | `… is damaged or not a valid file of this type …` |
| Altformat | `.doc`, `.xls`, `.ppt` | `Legacy binary Office format (.doc/.xls/.ppt) – its text cannot be read. Saved to: …` |

Schutz vor ZIP-Bomben: fflate entpackt nur die Einträge, die der Filter für das jeweilige Format zulässt. Die Größe wird geprüft, bevor entpackt wird.

## Abhängigkeit

`fflate` (rund 30 KB, ohne Abhängigkeiten) zum Entpacken. Die XML-Teile liest ein kleiner Tokenizer in `src/office.js`. Er löst Entities auf und überspringt Kommentare und Processing Instructions.

## Tests

- `test/office.test.js`: ein Fixture je Format aus `test/helpers/office-fixtures.js`, zur Testzeit mit `fflate.zipSync` gebaut; dazu echte Dateien aus macOS `textutil` (`test/fixtures/office/contract.docx`, `.odt`), eine verschlüsselte Datei, eine ZIP-Bombe und beschädigte Dateien.
- `test/attachment-documents.test.js`: Anbindung in `attachmentToContent`, also Text statt Speichern, Paging, Speichern mit Meldung und `.doc`.
- Live geprüft am 2026-10-03 mit je drei echten `.docx`, `.xlsx` und `.ics` aus dem Postfach, alle gelesen.

---

## English

# Office and OpenDocument attachments as text

**Files:** src/office.js (extraction), src/attachments.js (wiring in `attachmentToContent`)

## Purpose

`get_attachment` returns the text of Word, Excel and PowerPoint files (`.docx`, `.xlsx`, `.pptx`) and of OpenDocument files (`.odt`, `.ods`, `.odp`). These files used to be saved only. The text is paged with `offset` and `maxChars` like other text content.

## Detection (`officeKind`)

- The file extension wins over a generic MIME type such as `application/octet-stream`.
- Without a matching extension, the MIME type counts, e.g. `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- `.doc`, `.xls`, `.ppt` and their MIME types (`application/msword`, `application/vnd.ms-excel`, `application/vnd.ms-powerpoint`) count as `legacy`.

## Output per format

| Format | Part read | Output |
|---|---|---|
| DOCX | `word/document.xml` | Paragraphs as lines. Headings (styles `Heading N`, `Überschrift N`, `berschriftN`, `Title`) with `#`, list items (`w:numPr`) with `- `. Table rows tab-separated. `w:tab` → tab, `w:br`/`w:cr` → line break. Deleted tracked-change text (`w:delText`) is left out. Text boxes (`w:txbxContent`) appear in place within the surrounding paragraph; the substitute rendering `mc:Fallback` is skipped so nothing appears twice |
| PPTX | `ppt/presentation.xml`, relationships, `ppt/slides/slideN.xml` | One block `=== Slide N ===` per slide, in presentation order (`p:sldIdLst`). Without that list, sorted by file number |
| XLSX | `xl/workbook.xml`, relationships, `sharedStrings.xml`, `styles.xml`, worksheets | One block `=== Sheet: <name> ===` per sheet, rows tab-separated. Cells sit at their column from the cell reference, empty rows are left out. Values: shared and inline strings, `TRUE`/`FALSE`, numbers without floating-point noise (`0.30000000000000004` → `0.3`). Date cells (built-in date formats 14–22 and 45–47 or custom formats with d/m/y/h/s) are shown as `YYYY-MM-DD`, `YYYY-MM-DD HH:MM` or `HH:MM`, also in the 1904 date system of older Mac files (`workbookPr date1904`). Elapsed-time formats like `[h]:mm` (and built-in format 46) appear as total hours, e.g. `1.5` → `36:00`. Formulas are not shown, only their stored result |
| ODT | `content.xml` | Headings (`text:h`) with `#` by `text:outline-level`, lists with `- `, tables tab-separated, `text:tab`, `text:line-break`, `text:s`. Comments (`office:annotation`) are left out |
| ODS | `content.xml` | One block per table with its name. Each cell gives its **displayed** text from `text:p`, so with number and date formats. Repeated empty cells and rows are not filled in. Non-empty repetitions are output at most 100 times |
| ODP | `content.xml` | One block `=== Slide N ===` per `draw:page`, with the page name if it is not the default `pageN`. Speaker notes are left out |

At the end the text runs through `normalizeText()`.

Known limits: headers and footers, footnotes and comments in DOCX as well as charts and embedded objects are not read. XLSX shows numbers without their display format; only dates and durations are converted. Namespace prefixes are fixed (`w:`, `a:`, SpreadsheetML without prefix); files with other prefixes count as damaged and are saved. In ODT, deleted tracked-change text (`text:tracked-changes`) appears as extra paragraphs.

## When a file cannot be read

The file is saved to the attachment folder, and the reply names the reason (`OfficeError.reason`):

| Reason | Detection | Message |
|---|---|---|
| `encrypted` | The file starts with the OLE signature `D0 CF 11 E0 …` (what password-protected OOXML files look like, but also legacy `.doc`/`.xls` files that were only renamed), or `META-INF/manifest.xml` contains `encryption-data` (ODF) | OLE: `This Word document is password-protected (encrypted) or a legacy binary Office file with a new extension, so its text cannot be read. Saved to: …`; ODF: `… is password-protected (encrypted) …` |
| `too-large` | The declared size of the needed parts adds up to more than 50 MB, or the archive has more than 10,000 entries | `… expands to more than 50 MB (possible ZIP bomb) …` |
| `damaged` | Not a valid ZIP, or a required part is missing | `… is damaged or not a valid file of this type …` |
| Legacy format | `.doc`, `.xls`, `.ppt` | `Legacy binary Office format (.doc/.xls/.ppt) – its text cannot be read. Saved to: …` |

Protection against ZIP bombs: fflate only inflates the entries the filter for the format allows. The size is checked before anything is inflated.

## Dependency

`fflate` (about 30 KB, no dependencies) for unzipping. A small tokenizer in `src/office.js` reads the XML parts. It decodes entities and skips comments and processing instructions.

## Tests

- `test/office.test.js`: one fixture per format from `test/helpers/office-fixtures.js`, built at test time with `fflate.zipSync`; also real files from macOS `textutil` (`test/fixtures/office/contract.docx`, `.odt`), an encrypted file, a ZIP bomb and damaged files.
- `test/attachment-documents.test.js`: wiring in `attachmentToContent`, i.e. text instead of saving, paging, saving with a message, and `.doc`.
- Checked live on 2026-10-03 with three real `.docx`, `.xlsx` and `.ics` files each from the mailbox; all were read.
