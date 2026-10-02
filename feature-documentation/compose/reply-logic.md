**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Antwort-Logik: Empfänger, Betreff, Zitat

**Datei:** src/compose.js

## Funktionen zur Antwort-Komposition

### `replyRecipients(original, { replyAll = false, selfAddresses = [] })`

Bestimmt die Empfänger einer Antwort basierend auf der Original-Mail.

**Logik:**

1. **Reply-To nutzen:** Falls vorhanden, wird Reply-To verwendet. Sonst From.
2. **Sich selbst ausfiltern:** Eigene Adressen (aus `selfAddresses`) werden entfernt.
3. **Ist die Original-Mail von uns selbst:** Falls der primäre Empfänger nur aus eigenen Adressen besteht, werden stattdessen die Original-To verwendet.
4. **Reply All:**
   - `replyAll: false` – Nur der primäre Empfänger wird angeschrieben
   - `replyAll: true` – Primärer Empfänger (To) + Original-To + Original-Cc (alle ohne Self)

**Rückgabe:**

```javascript
{
  to: "alice@example.com, bob@example.com",  // formatiert
  cc: "charlie@example.com",  // oder leer
}
```

Falls keine Empfänger: leere Strings.

### `replySubject(subject)`

Erzeugt den Betreff einer Antwort.

**Logik:**

Falls der ursprüngliche Betreff bereits mit `Re:`, `AW:`, `Antw:` beginnt, wird er unverändert verwendet. Sonst wird `Re: ` vorangestellt.

**Beispiel:**
- Input: `"Meeting tomorrow"` → Output: `"Re: Meeting tomorrow"`
- Input: `"Re: Meeting tomorrow"` → Output: `"Re: Meeting tomorrow"`

### `referencesFor(original)`

Erzeugt den `References`-Header für Mail-Threading.

**Logik:**

Kombiniert `original.references` und `original.messageId` zu einem String.

**Rückgabe:** `"<id1@example.com> <id2@example.com> <id3@example.com>"` oder `undefined` falls keine vorhanden.

### `quoteAttribution(original)`

Erzeugt die Zitat-Zuordnung (Wer schrieb wann).

**Zeitzone:** `Europe/Berlin` – hartcodiert

**Format:**

```
Am 15.01.2024, 14:30 schrieb Max Mustermann <max@example.com>:
```

Falls kein Datum: `Max Mustermann <max@example.com> schrieb:`.

Falls kein Sender: `unbekannt schrieb:`.

### `quoteText(originalBody, attribution)`

Erzeugt ein Text-Zitat.

**Logik:**

Jede Zeile des Original-Body wird mit `> ` präfixiert. Leere Zeilen werden zu `>`.

```
Am 15.01.2024, 14:30 schrieb Max Mustermann:
> Originaltext Zeile 1
> Originaltext Zeile 2
>
> Originaltext Zeile 3
```

### `quoteHtml(originalHtml, originalText, attribution)`

Erzeugt ein HTML-Zitat (für HTML-Mails).

**Logik:**

Falls `originalHtml` vorhanden, wird es verwendet. Sonst wird `originalText` mit `textToHtml()` konvertiert.

Das Zitat wird in ein `protonmail_quote`-Div mit Blockquote-Struktur verpackt:

```html
<div class="protonmail_quote">Am 15.01.2024, 14:30 schrieb Max Mustermann:<br>
<blockquote class="protonmail_quote" type="cite" style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">
[originalHTML]
</blockquote></div>
```

### `escapeHtml(text)` und `textToHtml(text)`

- `escapeHtml()` – Escapet `&`, `<`, `>`, `"`
- `textToHtml()` – Escapet und ersetzt `\n` durch `<br>\n`

## Hilfsfunktionen

### `splitAddresses(value)`

Parst eine kommaseparierte oder Semikolon-separierte Adress-Liste:

```javascript
splitAddresses("alice@example.com, bob@example.com;charlie@example.com")
// ["alice@example.com", "bob@example.com", "charlie@example.com"]
```

---

## English

# Reply logic: recipients, subject, quote

**File:** src/compose.js

## Functions for reply composition

### `replyRecipients(original, { replyAll = false, selfAddresses = [] })`

Determines the recipients of a reply based on the original message.

**Logic:**

1. **Use Reply-To:** If present, Reply-To is used. Otherwise From.
2. **Filter out self:** Own addresses (from `selfAddresses`) are removed.
3. **Original message is from us:** If the primary recipient consists only of own addresses, the original To is used instead.
4. **Reply All:**
   - `replyAll: false` – Only the primary recipient is addressed
   - `replyAll: true` – Primary recipient (To) + original To + original Cc (all without self)

**Return:**

```javascript
{
  to: "alice@example.com, bob@example.com",  // formatted
  cc: "charlie@example.com",  // or empty
}
```

If no recipients: empty strings.

### `replySubject(subject)`

Creates the subject of a reply.

**Logic:**

If the original subject already starts with `Re:`, `AW:`, `Antw:`, it is used unchanged. Otherwise `Re: ` is prepended.

**Example:**
- Input: `"Meeting tomorrow"` → Output: `"Re: Meeting tomorrow"`
- Input: `"Re: Meeting tomorrow"` → Output: `"Re: Meeting tomorrow"`

### `referencesFor(original)`

Creates the `References` header for email threading.

**Logic:**

Combines `original.references` and `original.messageId` into a string.

**Return:** `"<id1@example.com> <id2@example.com> <id3@example.com>"` or `undefined` if none present.

### `quoteAttribution(original)`

Creates the quote attribution (who wrote when).

**Timezone:** `Europe/Berlin` – hardcoded

**Format:**

```
Am 15.01.2024, 14:30 schrieb Max Mustermann <max@example.com>:
```

If no date: `Max Mustermann <max@example.com> schrieb:`.

If no sender: `unbekannt schrieb:`.

### `quoteText(originalBody, attribution)`

Creates a text quote.

**Logic:**

Each line of the original body is prefixed with `> `. Empty lines become `>`.

```
Am 15.01.2024, 14:30 schrieb Max Mustermann:
> Original text line 1
> Original text line 2
>
> Original text line 3
```

### `quoteHtml(originalHtml, originalText, attribution)`

Creates an HTML quote (for HTML messages).

**Logic:**

If `originalHtml` is present, it is used. Otherwise `originalText` is converted with `textToHtml()`.

The quote is wrapped in a `protonmail_quote` div with blockquote structure:

```html
<div class="protonmail_quote">Am 15.01.2024, 14:30 schrieb Max Mustermann:<br>
<blockquote class="protonmail_quote" type="cite" style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">
[originalHTML]
</blockquote></div>
```

### `escapeHtml(text)` and `textToHtml(text)`

- `escapeHtml()` – Escapes `&`, `<`, `>`, `"`
- `textToHtml()` – Escapes and replaces `\n` with `<br>\n`

## Helper functions

### `splitAddresses(value)`

Parses a comma-separated or semicolon-separated address list:

```javascript
splitAddresses("alice@example.com, bob@example.com;charlie@example.com")
// ["alice@example.com", "bob@example.com", "charlie@example.com"]
```
