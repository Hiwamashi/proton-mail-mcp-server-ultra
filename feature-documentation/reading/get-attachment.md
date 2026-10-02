**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Tool: get_attachment

**Datei:** src/tools/mailbox.js und src/attachments.js

## Zweck

Öffnet einen Anhang einer Mail. PDFs und Textdateien werden als Text zurückgegeben, Bilder als Base64-Daten, angehängte Mails gerendert, Dateien anderer Typen auf die Festplatte gespeichert.

## Parameter

| Parameter | Typ | Default | Beschreibung |
|---|---|---|---|
| `uid` | number | – | UID der Mail |
| `folder` | string | `"INBOX"` | Ordner der Mail |
| `index` | number | – | Anhang-Index (von `read_email`) |
| `save` | boolean | `false` | In das Attachment-Verzeichnis speichern, statt anzuzeigen |
| `offset` | number | `0` | Startposition für lange Textinhalte |
| `maxChars` | number | `20000` | Max. Zeichen für Text (min. 500, max. 100000) |

## Rückgabe

MCP-Content-Block-Array (eins oder mehrere):

### Bilder (PNG, JPEG, GIF, WebP, ≤ 5 MB)

```javascript
[
  { type: "text", text: "Attachment [0] image.png (image/png, 256 KB) from UID 105" },
  { type: "image", data: "base64....", mimeType: "image/png" }
]
```

### PDFs

Falls Text extrahierbar (unpdf):

```javascript
[
  { type: "text", text: "Attachment [0] document.pdf (application/pdf, 512 KB) from UID 105\nPDF pages: 8\nContent: chars 0–18945 of 45678\n---\n[Extrahierter PDF-Text]" }
]
```

Falls nicht extrahierbar (verschlüsselt, gescannt):

```javascript
[
  { type: "text", text: "Attachment [0] document.pdf (application/pdf, 512 KB) from UID 105\nNo extractable text (scanned or protected PDF). Saved to: /path/to/document.pdf" }
]
```

### RFC822 (angehängte Mail)

```javascript
[
  { type: "text", text: "Attachment [0] embedded.eml (message/rfc822, 15 KB) from UID 105\nEmbedded message\nFrom: Absender <absender@example.com>\nTo: du@proton.me\nCc: cc@example.com\nDate: 2024-01-15T14:30:00.000Z\nSubject: Betreff\nAttachments:\n  - inner.pdf (application/pdf, 256 KB)\nContent: chars 0–10234 of 18945\n---\n[Body der angehängten Mail]" }
]
```

### Textdateien (.txt, .csv, .json, .md, .yaml, .ics, .vcf, etc.)

```javascript
[
  { type: "text", text: "Attachment [0] data.csv (text/csv, 45 KB) from UID 105\nContent: chars 0–18945 of 45678\n---\n[CSV-Daten]" }
]
```

HTML-Dateien werden zu Text konvertiert (Links inklusive).

### Andere Dateitypen (Word, Excel, ZIP, etc.)

```javascript
[
  { type: "text", text: "Attachment [0] archive.zip (application/zip, 512 KB) from UID 105\nThis file type cannot be shown directly. Saved to: /path/to/archive.zip" }
]
```

### Mit `save: true`

Alle Dateien (auch bereits gezeigte) werden in `PROTON_MCP_ATTACHMENT_DIR` gespeichert:

```javascript
[
  { type: "text", text: "Attachment [0] image.png (image/png, 256 KB) from UID 105\nSaved to: ~/Downloads/Proton-Anhänge/image.png" }
]
```

Falls die Datei bereits existiert, wird ein Suffix hinzugefügt: `image (1).png`, `image (2).png`, etc.

## Besonderheiten

### Inline vs. echte Anhänge

Das Tool unterscheidet zwischen:
- **inline** (Bilder, die im Mail-Body eingebettet sind) – zeigt trotzdem mit Index
- **echte Anhänge** (Dateien zum Herunterladen)

Beide sind per Index zugänglich.

### Größenlimits

- **Bilder:** ≤ 5 MB werden direkt als Base64 zurückgegeben; größere werden gespeichert
- **Text:** immer via `paginate()` aufgeteilt (default 20000 chars)

### PDF-Extraktion

Nutzt `unpdf` (async) zur Textextraktion. Falls das fehlschlägt (verschlüsselt, beschädigt, zu neues Format), wird die Datei gespeichert mit einer Warnung.

Gesamtseiten-Zahl ist im Header enthalten: `PDF pages: 8`.

### RFC822 Besonderheiten

Angehängte Mails werden als Header + Body + Liste angehängter Anhänge gezeigt. Der Body wird seitenweise aufgeteilt wie bei `read_email`.

Signatur-Anhänge der inneren Mail werden nicht angezeigt.

## Fehlerbehandlung

Falls Index nicht existiert:

```
Email UID 105 has 2 attachment(s); index 5 does not exist.
```

Falls die Mail nicht existiert: `NotFoundError` (siehe `read_email`).

Falls `save: true` und Verzeichnis nicht beschreibbar: Fehler beim Speichern.

---

## English

# Tool: get_attachment

**File:** src/tools/mailbox.js and src/attachments.js

## Purpose

Opens an attachment from a message. PDFs and text files are returned as text, images as Base64 data, attached messages rendered, other file types saved to disk.

## Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `uid` | number | – | UID of the message |
| `folder` | string | `"INBOX"` | Folder of the message |
| `index` | number | – | Attachment index (from `read_email`) |
| `save` | boolean | `false` | Save to attachment directory instead of displaying |
| `offset` | number | `0` | Start position for long text content |
| `maxChars` | number | `20000` | Max characters for text (min 500, max 100000) |

## Return

MCP content block array (one or more):

### Images (PNG, JPEG, GIF, WebP, ≤ 5 MB)

```javascript
[
  { type: "text", text: "Attachment [0] image.png (image/png, 256 KB) from UID 105" },
  { type: "image", data: "base64....", mimeType: "image/png" }
]
```

### PDFs

If text extractable (unpdf):

```javascript
[
  { type: "text", text: "Attachment [0] document.pdf (application/pdf, 512 KB) from UID 105\nPDF pages: 8\nContent: chars 0–18945 of 45678\n---\n[Extracted PDF text]" }
]
```

If not extractable (encrypted, scanned):

```javascript
[
  { type: "text", text: "Attachment [0] document.pdf (application/pdf, 512 KB) from UID 105\nNo extractable text (scanned or protected PDF). Saved to: /path/to/document.pdf" }
]
```

### RFC822 (attached message)

```javascript
[
  { type: "text", text: "Attachment [0] embedded.eml (message/rfc822, 15 KB) from UID 105\nEmbedded message\nFrom: Sender <sender@example.com>\nTo: you@proton.me\nCc: cc@example.com\nDate: 2024-01-15T14:30:00.000Z\nSubject: Subject\nAttachments:\n  - inner.pdf (application/pdf, 256 KB)\nContent: chars 0–10234 of 18945\n---\n[Body of attached message]" }
]
```

### Text files (.txt, .csv, .json, .md, .yaml, .ics, .vcf, etc.)

```javascript
[
  { type: "text", text: "Attachment [0] data.csv (text/csv, 45 KB) from UID 105\nContent: chars 0–18945 of 45678\n---\n[CSV data]" }
]
```

HTML files are converted to text (links included).

### Other file types (Word, Excel, ZIP, etc.)

```javascript
[
  { type: "text", text: "Attachment [0] archive.zip (application/zip, 512 KB) from UID 105\nThis file type cannot be shown directly. Saved to: /path/to/archive.zip" }
]
```

### With `save: true`

All files (even those already shown) are saved to `PROTON_MCP_ATTACHMENT_DIR`:

```javascript
[
  { type: "text", text: "Attachment [0] image.png (image/png, 256 KB) from UID 105\nSaved to: ~/Downloads/Proton-Anhänge/image.png" }
]
```

If the file already exists, a suffix is added: `image (1).png`, `image (2).png`, etc.

## Details

### Inline vs. real attachments

The tool distinguishes between:
- **inline** (images embedded in the message body) – still shown with index
- **real attachments** (files for download)

Both are accessible by index.

### Size limits

- **Images:** ≤ 5 MB are returned directly as Base64; larger ones are saved
- **Text:** always split via `paginate()` (default 20000 chars)

### PDF extraction

Uses `unpdf` (async) for text extraction. If it fails (encrypted, damaged, too new format), the file is saved with a warning.

Total page count is shown in the header: `PDF pages: 8`.

### RFC822 details

Attached messages are shown as header + body + list of attached attachments. The body is paginated like in `read_email`.

Signature attachments of the inner message are not shown.

## Error handling

If index does not exist:

```
Email UID 105 has 2 attachment(s); index 5 does not exist.
```

If the message does not exist: `NotFoundError` (see `read_email`).

If `save: true` and directory is not writable: error saving.
