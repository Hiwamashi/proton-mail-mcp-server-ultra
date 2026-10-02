**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Aufbereitung von Mail-Body

**Datei:** src/content.js

## Zweck

Das Modul bereitet Mail-Bodies für die Ausgabe auf: HTML wird in Text konvertiert, Zitate erkannt und entfernt, lange Mails seitenweise aufgeteilt, und Adressen formatiert.

## Hauptfunktionen

### `extractBody(parsed, { format = "auto", includeLinks = false })`

Wählt den besten lesbaren Body aus einer geparsten Mail.

**Parameter:**
- `parsed` – Objekt von `mailparser` (mit `text`, `html`)
- `format` – Modus: `"auto"`, `"text"`, `"html"`, `"raw_html"`
- `includeLinks` – `true`: Link-URLs inline anzeigen; `false`: URLs weglassen (kompakt)

**Rückgabe:**
```javascript
{ body: string, source: "text" | "html" | "raw_html" | "none" }
```

**Modus:**

| Mode | Logik |
|---|---|
| `"auto"` | Text-Part verwenden. Falls fehlt oder leer, HTML verwenden. Falls HTML vorhanden und Links gefordert, HTML verwenden (da Links nur dort verfügbar sind). Falls Text-Part nur aus URLs besteht (Dichte > 15 %), HTML verwenden. |
| `"text"` | Nur Text-Part; falls leer, leerer Body. |
| `"html"` | HTML wird zu Text konvertiert; HTML-Fallback, falls nicht vorhanden. |
| `"raw_html"` | Unverarbeitetes HTML oder leer, falls nicht vorhanden. |

**Quelle ist "none"** falls sowohl Text als auch HTML fehlen.

### `htmlToText(html, { includeLinks = false })`

Konvertiert HTML zu Text mit `html-to-text`:

- Bilder (`<img>`) werden übersprungen
- Styles (`<style>`) und Scripts (`<script>`) werden entfernt
- Links zeigen als `<URL>`, falls `includeLinks: true`
- Überschriften behalten ihre Struktur
- Tabellen werden als Text gerendert

Anschließend wird der Text normalisiert (Whitespace, unsichtbare Zeichen).

### `normalizeText(text)`

Bereinigt Text:

1. `\r\n` → `\n` (Zeilenumbrüche normalisieren)
2. Unsichtbare Zeichen entfernen (Zero-Width-Joiner, Soft Hyphens, etc. – oft in Newsletters)
3. Mehrere Leerzeichen → ein Leerzeichen
4. Trailing Whitespace pro Zeile entfernen
5. Leere Zeilen konsolidieren (max. 2 aufeinanderfolgend)
6. Trim

### `stripQuoted(text)`

Erkennt und entfernt Zitat-Header und Historie aus Antworten.

**Erkannte Muster:**

Englisch und Deutsch:
```
Am <Datum> schrieb <Name>:
On <Date> <Name> wrote:
Le <Date> <Name> a écrit:
El <Date> <Name> escribió:
Il <Date> <Name> ha scritto:
```

Outlook-Stil:
```
Von: ...
Gesendet: ...
An: ...
Betreff: ...
```

Trailing `>>`-zitierte Blöcke ohne Header.

**Rückgabe:**
```javascript
{ text: string, removed: boolean }
```

Falls erkannt: neuer Text ohne Zitat, `removed: true`.
Falls nicht erkannt: Originaltext, `removed: false`.

### `paginate(text, offset = 0, maxChars = 20000)`

Teilt langen Text in Seiten auf.

**Parameter:**
- `offset` – Startposition (Standard: 0)
- `maxChars` – Maximale Zeichen pro Seite (Standard: 20000)

**Rückgabe:**
```javascript
{
  chunk: string,           // text[offset, offset+maxChars)
  start: number,           // tatsächlicher Start
  end: number,             // tatsächlicher End
  total: number,           // Länge des vollständigen Textes
  nextOffset: number|null, // für nächste Seite oder null
}
```

**Intelligente Seitengrenzen:**

- Versucht, auf einem Zeilenumbruch zu enden, falls dieser in den letzten 20 % liegt
- Teilt UTF-16-Surrogate-Paare (Emojis) nicht auf

### `urlDensity(text)`

Berechnet den Anteil an Zeichen, die zu URLs gehören:

```javascript
urlChars / text.length  // 0.0 bis 1.0
```

Falls Dichte > 0.15 (15 %), wird der Text als "hauptsächlich URLs" klassifiziert.

## Hilfsfunktionen für Adressen und Formatierung

### `addressList(field)` und `addressObjects(field)`

Parst Mail-Adressen aus Header-Feldern:

```javascript
addressList(parsed.to)     // [{name, address}, ...]
addressObjects(parsed.from) // [{name, address}, ...] für nodemailer
```

### `formatAddress(a)` und `formatAddresses(field)`

Formatiert Adressen für Menschen:

```javascript
formatAddress({name: "Max Mustermann", address: "max@example.com"})
// "Max Mustermann <max@example.com>"

formatAddresses(parsed.from)
// "Max Mustermann <max@example.com>, Erika Musterfrau <erika@example.com>"
```

Names mit Sonderzeichen werden gequotet.

### `formatSize(bytes)`

Formatiert Dateigröße lesbar:

```
< 1 KB:      "123 B"
< 1 MB:      "456 KB"
>= 1 MB:     "1.2 MB"
```

### `describeAttachments(attachments)`

Erzeugt Beschreibungs-Array für `read_email`:

```javascript
[
  {
    index: 0,
    filename: "document.pdf",
    contentType: "application/pdf",
    size: 123456,
    inline: false,
    signature: false,
  },
  ...
]
```

**Signature-Typen** (werden gefiltert):
- `application/pkcs7-signature`
- `application/x-pkcs7-signature`
- `application/pgp-signature`

### `formatDate(date)`

Formatiert Datum als ISO 8601 (z. B. `"2024-01-15T14:30:00.000Z"`) oder `""`.

---

## English

# Message body processing

**File:** src/content.js

## Purpose

The module processes message bodies for output: HTML is converted to text, quotes detected and removed, long messages paginated, and addresses formatted.

## Main functions

### `extractBody(parsed, { format = "auto", includeLinks = false })`

Selects the best readable body from a parsed message.

**Parameters:**
- `parsed` – Object from `mailparser` (with `text`, `html`)
- `format` – Mode: `"auto"`, `"text"`, `"html"`, `"raw_html"`
- `includeLinks` – `true`: show link URLs inline; `false`: omit URLs (compact)

**Return:**
```javascript
{ body: string, source: "text" | "html" | "raw_html" | "none" }
```

**Modes:**

| Mode | Logic |
|---|---|
| `"auto"` | Use text part. If missing or empty, use HTML. If HTML present and links requested, use HTML (links only available there). If text part consists mostly of URLs (density > 15%), use HTML. |
| `"text"` | Text part only; if empty, empty body. |
| `"html"` | HTML converted to text; HTML fallback if not present. |
| `"raw_html"` | Unprocessed HTML or empty if not present. |

**Source is "none"** if both text and HTML are missing.

### `htmlToText(html, { includeLinks = false })`

Converts HTML to text using `html-to-text`:

- Images (`<img>`) are skipped
- Styles (`<style>`) and scripts (`<script>`) are removed
- Links appear as `<URL>` if `includeLinks: true`
- Headings retain their structure
- Tables are rendered as text

The text is then normalized (whitespace, invisible characters).

### `normalizeText(text)`

Cleans text:

1. `\r\n` → `\n` (normalize line breaks)
2. Remove invisible characters (zero-width joiners, soft hyphens, etc. – common in newsletters)
3. Multiple spaces → single space
4. Strip trailing whitespace per line
5. Consolidate blank lines (max. 2 consecutive)
6. Trim

### `stripQuoted(text)`

Detects and removes quote headers and history from replies.

**Recognized patterns:**

English and German:
```
Am <date> schrieb <name>:
On <date> <name> wrote:
Le <date> <name> a écrit:
El <date> <name> escribió:
Il <date> <name> ha scritto:
```

Outlook-style:
```
Von: ...
Sent: ...
To: ...
Subject: ...
```

Trailing `>>` quoted blocks without header.

**Return:**
```javascript
{ text: string, removed: boolean }
```

If detected: new text without quote, `removed: true`.
If not detected: original text, `removed: false`.

### `paginate(text, offset = 0, maxChars = 20000)`

Splits long text into pages.

**Parameters:**
- `offset` – Start position (default: 0)
- `maxChars` – Max characters per page (default: 20000)

**Return:**
```javascript
{
  chunk: string,           // text[offset, offset+maxChars)
  start: number,           // actual start
  end: number,             // actual end
  total: number,           // length of complete text
  nextOffset: number|null, // for next page or null
}
```

**Smart page breaks:**

- Tries to end on a line break if one exists in the last 20%
- Does not split UTF-16 surrogate pairs (emojis)

### `urlDensity(text)`

Calculates the share of characters belonging to URLs:

```javascript
urlChars / text.length  // 0.0 to 1.0
```

If density > 0.15 (15%), the text is classified as "mostly URLs".

## Helper functions for addresses and formatting

### `addressList(field)` and `addressObjects(field)`

Parses mail addresses from header fields:

```javascript
addressList(parsed.to)     // [{name, address}, ...]
addressObjects(parsed.from) // [{name, address}, ...] for nodemailer
```

### `formatAddress(a)` and `formatAddresses(field)`

Formats addresses for humans:

```javascript
formatAddress({name: "John Doe", address: "john@example.com"})
// "John Doe <john@example.com>"

formatAddresses(parsed.from)
// "John Doe <john@example.com>, Jane Smith <jane@example.com>"
```

Names with special characters are quoted.

### `formatSize(bytes)`

Formats file size readably:

```
< 1 KB:      "123 B"
< 1 MB:      "456 KB"
>= 1 MB:     "1.2 MB"
```

### `describeAttachments(attachments)`

Produces description array for `read_email`:

```javascript
[
  {
    index: 0,
    filename: "document.pdf",
    contentType: "application/pdf",
    size: 123456,
    inline: false,
    signature: false,
  },
  ...
]
```

**Signature types** (are filtered):
- `application/pkcs7-signature`
- `application/x-pkcs7-signature`
- `application/pgp-signature`

### `formatDate(date)`

Formats date as ISO 8601 (e.g. `"2024-01-15T14:30:00.000Z"`) or `""`.
