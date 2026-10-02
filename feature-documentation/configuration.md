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
}
```

**`from`** ist ein string (z. B. `"du@proton.me"`), falls kein `PROTON_BRIDGE_FROM_NAME` gesetzt ist. Andernfalls ein Objekt `{ name: string, address: string }` für nodemailer.

**`selfAddresses`** ist eine Menge aller bekannten eigenen Adressen (Benutzername, `PROTON_BRIDGE_FROM`, `PROTON_BRIDGE_ALIASES`), alle lowercase, ohne Duplikate. Sie wird bei der Antwort-Logik verwendet, um zu erkennen, ob eine Mail von uns selbst versendet wurde.

## Fehlerbehandlung

Die Funktion `assertMode()` wird bei Server-Start zuerst aufgerufen und bricht den Prozess ab (Exit-Code 1), falls `PROTON_MCP_MODE` kein gültiger Wert ist (`Invalid PROTON_MCP_MODE "<wert>". Valid values: "read-only", "drafts", "full".`). Ein ungültiger Modus wirft beim Import nicht, damit Tests die Konfiguration laden können; er wird in `CONFIG.modeError` gehalten.

`logStartupConfig()` schreibt danach Modus und erlaubte Anhang-Verzeichnisse nach stderr (`proton-mail-mcp: mode=...`, `proton-mail-mcp: attachment roots=...`).

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
}
```

**`from`** is a string (e.g. `"you@proton.me"`) if no `PROTON_BRIDGE_FROM_NAME` is set. Otherwise an object `{ name: string, address: string }` for nodemailer.

**`selfAddresses`** is a set of all known own addresses (username, `PROTON_BRIDGE_FROM`, `PROTON_BRIDGE_ALIASES`), all lowercase, without duplicates. It is used in reply logic to detect whether a message was sent by us.

## Error handling

The function `assertMode()` is called first on server startup and terminates the process (exit code 1) if `PROTON_MCP_MODE` is not a valid value (`Invalid PROTON_MCP_MODE "<value>". Valid values: "read-only", "drafts", "full".`). An invalid mode does not throw on import so tests can load the configuration; it is kept in `CONFIG.modeError`.

`logStartupConfig()` then writes the mode and the allowed attachment directories to stderr (`proton-mail-mcp: mode=...`, `proton-mail-mcp: attachment roots=...`).

The function `assertCredentials()` is called on server startup and terminates the process (exit code 1) if `PROTON_BRIDGE_USERNAME` or `PROTON_BRIDGE_PASSWORD` are missing:

```
Error: Proton Bridge credentials not found.
Either set PROTON_BRIDGE_USERNAME and PROTON_BRIDGE_PASSWORD environment variables,
or create ~/.proton-bridge-credentials with:
  PROTON_BRIDGE_USERNAME=your-email@proton.me
  PROTON_BRIDGE_PASSWORD=your-bridge-password
```
