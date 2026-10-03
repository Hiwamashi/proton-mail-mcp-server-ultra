**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Konfiguration: Zugangsdaten und Optionen

**Datei:** src/config.js

## Zweck

Das Modul liest Zugangsdaten für die Proton Mail Bridge (Benutzername, Passwort) und optionale Einstellungen aus Umgebungsvariablen oder einer Konfigurationsdatei. Es wird beim Server-Start aufgerufen und erzeugt das globale `CONFIG`-Objekt.

## Konfigurationsquellen

Eingaben werden in dieser Reihenfolge berücksichtigt (später gewinnt):

1. **Konfigurationsdatei:** `~/.proton-bridge-credentials`
2. **Umgebungsvariablen:** `PROTON_*`, `PROTON_MCP_*`

## Konfigurationsdatei: `~/.proton-bridge-credentials`

Format: Zeilen mit `KEY=VALUE` oder `KEY="VALUE"` oder `KEY='VALUE'`.

Beispiel:
```
PROTON_BRIDGE_USERNAME="du@proton.me"
PROTON_BRIDGE_PASSWORD="bridge-passwort"
PROTON_BRIDGE_FROM_NAME="Dein Name"
PROTON_BRIDGE_ALIASES="alias1@proton.me, alias2@proton.me"
```

Kommentare (mit `#` am Anfang) und leere Zeilen werden ignoriert. Werte können unquoted oder in einfachen/doppelten Anführungszeichen sein.

## Umgebungsvariablen

| Variable | Typ | Default | Bedeutung |
|---|---|---|---|
| `PROTON_BRIDGE_USERNAME` | string | **erforderlich** | Proton-Mailadresse, z. B. `du@proton.me` |
| `PROTON_BRIDGE_PASSWORD` | string | **erforderlich** | Von der Proton Mail Bridge erzeugtes Passwort (nicht das Kontopasswort) |
| `PROTON_BRIDGE_HOST` | string | `127.0.0.1` | Adresse der Bridge (normalerweise lokal) |
| `PROTON_BRIDGE_IMAP_PORT` | number | `1143` | IMAP-Port der Bridge |
| `PROTON_BRIDGE_SMTP_PORT` | number | `1025` | SMTP-Port der Bridge |
| `PROTON_BRIDGE_SMTP_SECURE` | string | `"false"` | `"true"` für implizites TLS, `"false"` für STARTTLS |
| `PROTON_BRIDGE_FROM` | string | Wert von `PROTON_BRIDGE_USERNAME` | Absenderadresse (falls von Benutzername verschieden) |
| `PROTON_BRIDGE_FROM_NAME` | string | – | Anzeigename des Absenders (z. B. „Max Mustermann") |
| `PROTON_BRIDGE_ALIASES` | string | – | Weitere eigene Adressen, kommagetrennt (z. B. `alias1@proton.me, alias2@proton.me`) |
| `PROTON_BRIDGE_IDLE_TIMEOUT_MS` | number | `300000` | Millisekunden ohne Aktivität, nach denen die IMAP-Verbindung geschlossen wird (5 min) |
| `PROTON_MCP_ATTACHMENT_DIR` | string | `~/Downloads/Proton-Anhänge` | Verzeichnis, in das Anhänge gespeichert werden |
| `PROTON_MCP_MODE` | string | `drafts` | Betriebsmodus: `read-only`, `drafts` oder `full`. Ungültig: Start bricht mit Exit-Code 1 ab. Siehe `safety/operating-modes.md` |
| `PROTON_MCP_ATTACHMENT_ROOTS` | string | `~/Downloads`, `~/Documents`, `~/Desktop` und `PROTON_MCP_ATTACHMENT_DIR` | Erlaubte Verzeichnisse für lokale Anhänge, kommagetrennt, `~` wird erweitert. Ein einzelnes `*` hebt die Verzeichnisprüfung auf. Siehe `safety/attachment-roots.md` |
| `PROTON_MCP_CACHE_MAX_BYTES` | number | `67108864` | Budget des Nachrichten-Caches in Bytes (64 MB). `0` schaltet den Cache aus. Siehe `reading/message-cache.md` |
| `PROTON_MCP_CACHE_TTL_MS` | number | `600000` | Lebensdauer eines Cache-Eintrags in Millisekunden (10 min) |
| `PROTON_MCP_PARTIAL_FETCH_BYTES` | number | `5242880` | Nachrichtengröße in Bytes (5 MB); nur Nachrichten, die größer sind, lädt `read_email`/`get_attachment` teilweise. Ein sehr hoher Wert (z. B. `999999999999`) schaltet das aus |
| `PROTON_MCP_MAX_INLINE_IMAGE_BYTES` | number | `1048576` | Größtes Bild in Bytes (1 MB), das `get_attachment` direkt als Bild zurückgibt; größere werden gespeichert. `5242880` stellt das frühere Limit wieder her |
| `PROTON_MCP_LOCALE` | string | `de` | Sprache der Zitatzeile in Antworten und des Kopfblocks beim Weiterleiten: `de`, `en`, `fr`, `es`, `it`. Ungültig: Start bricht mit Exit-Code 1 ab. Siehe `compose/reply-logic.md` |
| `PROTON_MCP_TIMEZONE` | string | `Europe/Berlin` | Zeitzone (IANA-Name) für das Datum in Zitatzeile und Kopfblock. Ungültig: Start bricht mit Exit-Code 1 ab |

Ungültige Zahlenwerte (keine ganze Zahl oder negativ) bei diesen vier Variablen ersetzt der Server durch den Standardwert und gibt auf stderr eine Warnzeile mit dem Variablennamen aus. `0` bleibt gültig.

## `CONFIG`-Objekt

Die Funktion `loadConfig()` erzeugt:

```javascript
{
  host: string,                      // z. B. "127.0.0.1"
  imapPort: number,                  // z. B. 1143
  smtpPort: number,                  // z. B. 1025
  smtpSecure: boolean,               // true = implizites TLS
  username: string,                  // z. B. "du@proton.me"
  password: string,                  // Bridge-Passwort
  from: string | {name, address},    // Absender für nodemailer
  selfAddresses: string[],           // Alle eigenen Adressen (lowercase)
  imapIdleTimeoutMs: number,         // Idle-Timeout in ms
  attachmentDir: string,             // Absoluter Pfad für Anhänge
  mode: string | undefined,          // "read-only" | "drafts" | "full" (undefined, falls ungültig)
  modeError: string | undefined,     // Meldung bei ungültigem Modus
  attachmentRoots: string[] | "*",   // Erlaubte Anhang-Verzeichnisse (nicht aufgelöst) oder "*"
  cacheMaxBytes: number,             // Cache-Budget in Bytes, 0 = aus
  cacheTtlMs: number,                // Lebensdauer eines Cache-Eintrags in ms
  partialFetchBytes: number,         // Schwelle für teilweises Laden in Bytes
  maxInlineImageBytes: number,       // Größtes direkt gezeigtes Bild in Bytes
}
```

**`from`** ist ein string (z. B. `"du@proton.me"`), falls kein `PROTON_BRIDGE_FROM_NAME` gesetzt ist. Andernfalls ein Objekt `{ name: string, address: string }` für nodemailer.

**`selfAddresses`** ist eine Menge aller bekannten eigenen Adressen (Benutzername, `PROTON_BRIDGE_FROM`, `PROTON_BRIDGE_ALIASES`), alle lowercase, ohne Duplikate. Sie wird bei der Antwort-Logik verwendet, um zu erkennen, ob eine Mail von uns selbst versendet wurde.

## Fehlerbehandlung

Die Funktion `assertMode()` wird bei Server-Start zuerst aufgerufen und bricht den Prozess ab (Exit-Code 1), falls `PROTON_MCP_MODE` kein gültiger Wert ist (`Invalid PROTON_MCP_MODE "<wert>". Valid values: "read-only", "drafts", "full".`). Ein ungültiger Modus wirft beim Import nicht, damit Tests die Konfiguration laden können; er wird in `CONFIG.modeError` gehalten.

Danach prüft `assertLocale()` `PROTON_MCP_LOCALE` und `PROTON_MCP_TIMEZONE` und bricht bei ungültigen Werten ebenso ab, mit einer Meldung, die die Variable nennt (`Invalid PROTON_MCP_TIMEZONE "Mars/Olympus". Use an IANA time zone name such as "Europe/Berlin" or "America/New_York".`). Auch diese Fehler hält `CONFIG.localeErrors` bis zum Start.

`logStartupConfig()` schreibt danach Modus, Sprache, Zeitzone und erlaubte Anhang-Verzeichnisse nach stderr (`proton-mail-mcp: mode=...`, `proton-mail-mcp: locale=... timezone=...`, `proton-mail-mcp: attachment roots=...`).

Die Funktion `assertCredentials()` wird bei Server-Start aufgerufen und bricht den Prozess ab (Exit-Code 1), falls `PROTON_BRIDGE_USERNAME` oder `PROTON_BRIDGE_PASSWORD` fehlen:

```
Error: Proton Bridge credentials not found.
Either set PROTON_BRIDGE_USERNAME and PROTON_BRIDGE_PASSWORD environment variables,
or create ~/.proton-bridge-credentials with:
  PROTON_BRIDGE_USERNAME=your-email@proton.me
  PROTON_BRIDGE_PASSWORD=your-bridge-password
```

---

## English

# Configuration: Credentials and Options

**File:** src/config.js

## Purpose

The module reads credentials for the Proton Mail Bridge (username, password) and optional settings from environment variables or a configuration file. It is called on server startup and produces the global `CONFIG` object.

## Configuration sources

Inputs are considered in this order (later wins):

1. **Configuration file:** `~/.proton-bridge-credentials`
2. **Environment variables:** `PROTON_*`, `PROTON_MCP_*`

## Configuration file: `~/.proton-bridge-credentials`

Format: Lines with `KEY=VALUE` or `KEY="VALUE"` or `KEY='VALUE'`.

Example:
```
PROTON_BRIDGE_USERNAME="you@proton.me"
PROTON_BRIDGE_PASSWORD="bridge-password"
PROTON_BRIDGE_FROM_NAME="Your Name"
PROTON_BRIDGE_ALIASES="alias1@proton.me, alias2@proton.me"
```

Comments (starting with `#`) and blank lines are ignored. Values can be unquoted or wrapped in single or double quotes.

## Environment variables

| Variable | Type | Default | Meaning |
|---|---|---|---|
| `PROTON_BRIDGE_USERNAME` | string | **required** | Proton mail address, e.g. `you@proton.me` |
| `PROTON_BRIDGE_PASSWORD` | string | **required** | Password generated by Proton Mail Bridge (not the account password) |
| `PROTON_BRIDGE_HOST` | string | `127.0.0.1` | Bridge address (normally localhost) |
| `PROTON_BRIDGE_IMAP_PORT` | number | `1143` | IMAP port of the Bridge |
| `PROTON_BRIDGE_SMTP_PORT` | number | `1025` | SMTP port of the Bridge |
| `PROTON_BRIDGE_SMTP_SECURE` | string | `"false"` | `"true"` for implicit TLS, `"false"` for STARTTLS |
| `PROTON_BRIDGE_FROM` | string | Value of `PROTON_BRIDGE_USERNAME` | Sender address (if different from username) |
| `PROTON_BRIDGE_FROM_NAME` | string | – | Sender display name (e.g. "John Doe") |
| `PROTON_BRIDGE_ALIASES` | string | – | Additional own addresses, comma-separated (e.g. `alias1@proton.me, alias2@proton.me`) |
| `PROTON_BRIDGE_IDLE_TIMEOUT_MS` | number | `300000` | Milliseconds of inactivity before closing the IMAP connection (5 min) |
| `PROTON_MCP_ATTACHMENT_DIR` | string | `~/Downloads/Proton-Anhänge` | Directory where attachments are saved |
| `PROTON_MCP_MODE` | string | `drafts` | Operating mode: `read-only`, `drafts` or `full`. Invalid: startup aborts with exit code 1. See `safety/operating-modes.md` |
| `PROTON_MCP_ATTACHMENT_ROOTS` | string | `~/Downloads`, `~/Documents`, `~/Desktop` and `PROTON_MCP_ATTACHMENT_DIR` | Allowed directories for local attachments, comma-separated, `~` is expanded. A lone `*` disables the directory check. See `safety/attachment-roots.md` |
| `PROTON_MCP_CACHE_MAX_BYTES` | number | `67108864` | Budget of the message cache in bytes (64 MB). `0` disables the cache. See `reading/message-cache.md` |
| `PROTON_MCP_CACHE_TTL_MS` | number | `600000` | Lifetime of a cache entry in milliseconds (10 min) |
| `PROTON_MCP_PARTIAL_FETCH_BYTES` | number | `5242880` | Message size in bytes (5 MB); only messages larger than this are loaded partially by `read_email`/`get_attachment`. A very high value (e.g. `999999999999`) turns this off |
| `PROTON_MCP_MAX_INLINE_IMAGE_BYTES` | number | `1048576` | Largest image in bytes (1 MB) that `get_attachment` returns directly as an image; larger ones are saved. `5242880` restores the former limit |
| `PROTON_MCP_LOCALE` | string | `de` | Language of the attribution line in replies and of the header block when forwarding: `de`, `en`, `fr`, `es`, `it`. Invalid: startup aborts with exit code 1. See `compose/reply-logic.md` |
| `PROTON_MCP_TIMEZONE` | string | `Europe/Berlin` | Time zone (IANA name) for the date in the attribution line and header block. Invalid: startup aborts with exit code 1 |

Invalid numeric values (not an integer, or negative) for these four variables are replaced by the default, and one warning line naming the variable goes to stderr. `0` stays valid.

## `CONFIG` object

The function `loadConfig()` produces:

```javascript
{
  host: string,                      // e.g. "127.0.0.1"
  imapPort: number,                  // e.g. 1143
  smtpPort: number,                  // e.g. 1025
  smtpSecure: boolean,               // true = implicit TLS
  username: string,                  // e.g. "you@proton.me"
  password: string,                  // Bridge password
  from: string | {name, address},    // Sender for nodemailer
  selfAddresses: string[],           // All own addresses (lowercase)
  imapIdleTimeoutMs: number,         // Idle timeout in ms
  attachmentDir: string,             // Absolute path for attachments
  mode: string | undefined,          // "read-only" | "drafts" | "full" (undefined if invalid)
  modeError: string | undefined,     // Message for an invalid mode
  attachmentRoots: string[] | "*",   // Allowed attachment directories (unresolved) or "*"
  cacheMaxBytes: number,             // Cache budget in bytes, 0 = off
  cacheTtlMs: number,                // Lifetime of a cache entry in ms
  partialFetchBytes: number,         // Threshold for partial loading in bytes
  maxInlineImageBytes: number,       // Largest image shown directly, in bytes
}
```

**`from`** is a string (e.g. `"you@proton.me"`) if no `PROTON_BRIDGE_FROM_NAME` is set. Otherwise an object `{ name: string, address: string }` for nodemailer.

**`selfAddresses`** is a set of all known own addresses (username, `PROTON_BRIDGE_FROM`, `PROTON_BRIDGE_ALIASES`), all lowercase, without duplicates. It is used in reply logic to detect whether a message was sent by us.

## Error handling

The function `assertMode()` is called first on server startup and terminates the process (exit code 1) if `PROTON_MCP_MODE` is not a valid value (`Invalid PROTON_MCP_MODE "<value>". Valid values: "read-only", "drafts", "full".`). An invalid mode does not throw on import so tests can load the configuration; it is kept in `CONFIG.modeError`.

Then `assertLocale()` checks `PROTON_MCP_LOCALE` and `PROTON_MCP_TIMEZONE` and likewise aborts on invalid values, with a message naming the variable (`Invalid PROTON_MCP_TIMEZONE "Mars/Olympus". Use an IANA time zone name such as "Europe/Berlin" or "America/New_York".`). These errors are also kept in `CONFIG.localeErrors` until startup.

`logStartupConfig()` then writes the mode, language, time zone and the allowed attachment directories to stderr (`proton-mail-mcp: mode=...`, `proton-mail-mcp: locale=... timezone=...`, `proton-mail-mcp: attachment roots=...`).

The function `assertCredentials()` is called on server startup and terminates the process (exit code 1) if `PROTON_BRIDGE_USERNAME` or `PROTON_BRIDGE_PASSWORD` are missing:

```
Error: Proton Bridge credentials not found.
Either set PROTON_BRIDGE_USERNAME and PROTON_BRIDGE_PASSWORD environment variables,
or create ~/.proton-bridge-credentials with:
  PROTON_BRIDGE_USERNAME=your-email@proton.me
  PROTON_BRIDGE_PASSWORD=your-bridge-password
```
