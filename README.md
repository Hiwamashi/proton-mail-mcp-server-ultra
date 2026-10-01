# proton-mail-mcp-server-ultra

**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

MCP-Server für Proton Mail über die **Proton Mail Bridge** (IMAP/SMTP). Er gibt **lokalen KI-Agenten** Zugriff auf das eigene Postfach: Mails lesen, durchsuchen, Anhänge öffnen, Entwürfe anlegen und Antworten senden. Er ist an kein bestimmtes Werkzeug gebunden. Jeder MCP-fähige Client funktioniert, etwa Claude Code, Claude Desktop/Cowork, Cursor, Codex CLI, Gemini CLI oder LM Studio.

### Warum es dieses Projekt gibt

Ich beantworte meine Mails seit Langem nicht mehr selbst, das übernehmen KI-Agenten. Damit das mit Proton Mail funktioniert, brauchen die Agenten einen zuverlässigen lokalen Zugang zum Postfach, der sich nicht auf einen einzigen Anbieter festlegt. Die Proton Mail Bridge stellt das Postfach nur auf dem eigenen Rechner bereit (`127.0.0.1`), und dieser Server reicht es per MCP an den Agenten weiter. Die Mails verlassen den Rechner dabei nur an das Sprachmodell, das man selbst einsetzt.

### Dank

Dieses Projekt ist ein Fork von **[tamnys/proton-mail-mcp-server](https://github.com/tamnys/proton-mail-mcp-server)**. Vielen Dank für die erste Entwicklung: Die Idee, die Proton Mail Bridge über IMAP/SMTP als MCP-Server bereitzustellen, die Grundstruktur der Tools und das Wiederverwenden der Bridge-Verbindungen stammen von dort.

### Was der Fork verbessert

- **HTML-Mails sind lesbar.** Bisher kam bei reinen HTML-Mails (rund die Hälfte eines typischen Postfachs) ein leerer Body zurück. Jetzt wird HTML in Text umgewandelt, Bilder, Styles und Tracking-URLs fallen weg. Newsletter, deren Textteil nur aus URLs besteht, werden ebenfalls über das HTML aufbereitet.
- **Lange Mails kommen seitenweise** (`offset`/`maxChars`), statt den Kontext des Agenten zu sprengen.
- **Anhänge lassen sich öffnen:** PDFs als Text, Bilder direkt, Textdateien und angehängte Mails gerendert. Alles andere wird lokal gespeichert.
- **Entwürfe** erscheinen in Proton unter *Entwürfe* und lassen sich dort weiterbearbeiten. Damit kann ein Agent vorformulieren und ein Mensch vor dem Senden prüfen.
- **Suchergebnisse sind nach Datum sortiert**, auch in „All Mail“.
- **Quellcode statt Bundle:** modularer Code unter `src/`, Unit-Tests, Smoke-Test gegen die laufende Bridge.

### Tools

| Tool | Zweck |
|---|---|
| `list_folders` | Ordner mit Sonderfunktion und Anzahl (ungelesen) |
| `list_emails` | Neueste Mails eines Ordners, mit `offset` blätterbar |
| `search_emails` | Suche nach Absender, Empfänger, Betreff, Body, Volltext, Datum, ungelesen, markiert; neueste zuerst |
| `read_email` | Header, lesbarer Body, nummerierte Anhangsliste. Optionen: `format`, `includeLinks`, `stripQuoted`, `offset`, `maxChars`, `markAsRead` |
| `get_attachment` | Anhang per Index öffnen oder mit `save: true` speichern |
| `move_email`, `mark_email` | Verschieben, gelesen/ungelesen, markieren |
| `delete_email` | In den Papierkorb, im Papierkorb endgültig löschen |
| `send_email`, `reply_to_email` | Sofort senden (Antworten mit Threading, Reply-To und Zitat) |
| `create_draft` | Entwurf anlegen, neu oder mit `replyToUid` als Antwort (Empfänger, Betreff, Threading und Zitat werden automatisch gesetzt) |
| `list_drafts`, `update_draft`, `send_draft`, `delete_draft` | Entwürfe verwalten |

Für Anhänge erwarten `send_email` und `attachments` lokale Dateipfade.

UIDs gelten nur innerhalb ihres Ordners. Eine Mail, die `search_emails` in „All Mail“ gefunden hat, also auch mit `folder: "All Mail"` lesen.

### Anleitung: Schritt für Schritt

#### 1. Voraussetzungen

- **Proton-Konto mit kostenpflichtigem Tarif.** Die Proton Mail Bridge steht nur in bezahlten Tarifen zur Verfügung.
- **Proton Mail Bridge** installiert: <https://proton.me/mail/bridge> (macOS, Windows, Linux)
- **Node.js ≥ 20** (`node --version`)
- **Git**
- Ein **MCP-fähiger Client** (siehe Schritt 6)

#### 2. Proton Mail Bridge einrichten

1. Bridge starten und mit dem Proton-Konto anmelden.
2. Die erste Synchronisierung abwarten. Bei großen Postfächern kann das eine Weile dauern.
3. In der Bridge das Konto auswählen und die **IMAP/SMTP-Zugangsdaten** anzeigen lassen (*Mailbox details* bzw. *Mailbox configuration*). Benötigt werden:
   - Benutzername (die Proton-Adresse)
   - **Bridge-Passwort**: ein von der Bridge erzeugtes Passwort, **nicht** das Passwort des Proton-Kontos
   - Ports, Standard: IMAP `1143`, SMTP `1025`, Verbindung jeweils STARTTLS
4. Die Bridge muss laufen, solange der Agent auf das Postfach zugreifen soll. Am besten den Autostart in den Bridge-Einstellungen aktivieren.

#### 3. Projekt holen und bauen

```bash
git clone https://github.com/Hiwamashi/proton-mail-mcp-server-ultra.git
cd proton-mail-mcp-server-ultra
npm install
npm run build      # erzeugt dist/server.mjs (eine Datei, ohne node_modules lauffähig)
npm test           # Unit-Tests
```

Den absoluten Pfad zu `dist/server.mjs` notieren (`pwd`), er wird in Schritt 6 gebraucht. Ebenso den Pfad zu Node (`which node`). Manche Clients finden `node` sonst nicht, weil sie ohne die PATH-Einstellungen der Shell starten.

#### 4. Zugangsdaten hinterlegen

Empfohlen ist eine Datei `~/.proton-bridge-credentials`, damit das Passwort in keiner Client-Konfiguration steht:

```bash
cat > ~/.proton-bridge-credentials <<'EOF'
PROTON_BRIDGE_USERNAME="du@proton.me"
PROTON_BRIDGE_PASSWORD="bridge-passwort"
EOF
chmod 600 ~/.proton-bridge-credentials
```

Alternativ lassen sich dieselben Werte als Umgebungsvariablen setzen. Umgebungsvariablen haben Vorrang vor der Datei.

Optionale Einstellungen:

| Variable | Standard | Bedeutung |
|---|---|---|
| `PROTON_BRIDGE_HOST` | `127.0.0.1` | Adresse der Bridge |
| `PROTON_BRIDGE_IMAP_PORT` | `1143` | IMAP-Port der Bridge |
| `PROTON_BRIDGE_SMTP_PORT` | `1025` | SMTP-Port der Bridge |
| `PROTON_BRIDGE_SMTP_SECURE` | `false` | `true` = implizites TLS statt STARTTLS |
| `PROTON_BRIDGE_FROM` | Benutzername | Absenderadresse |
| `PROTON_BRIDGE_FROM_NAME` | – | Anzeigename des Absenders |
| `PROTON_BRIDGE_ALIASES` | – | Weitere eigene Adressen, kommagetrennt (werden bei „Allen antworten“ ausgelassen) |
| `PROTON_MCP_ATTACHMENT_DIR` | `~/Downloads/Proton-Anhänge` | Ablage für gespeicherte Anhänge |
| `PROTON_BRIDGE_IDLE_TIMEOUT_MS` | `300000` | IMAP-Verbindung nach Leerlauf schließen |

#### 5. Verbindung testen

```bash
node scripts/smoke.mjs                                        # nur lesend
SMOKE_SELF=du@proton.me node scripts/smoke.mjs --drafts       # zusätzlich Entwurf anlegen, ändern, löschen
```

Der Smoke-Test startet den gebauten Server, listet Ordner und die neuesten Mails, liest eine Mail und sucht in „All Mail“. Mit `--drafts` legt er zusätzlich Entwürfe an, die an die eigene Adresse gerichtet sind, und löscht sie anschließend wieder.

#### 6. Im Agenten-Werkzeug eintragen

In allen Beispielen `/pfad/zu/proton-mail-mcp-server-ultra` durch den Pfad aus Schritt 3 ersetzen. Der Server spricht MCP über `stdio`. Der Client startet ihn also selbst, ein separater Dienst ist nicht nötig.

**Claude Code**

```bash
claude mcp add --scope user proton-mail -- node /pfad/zu/proton-mail-mcp-server-ultra/dist/server.mjs
```

**Claude Desktop / Cowork:** `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) bzw. `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

```json
{
  "mcpServers": {
    "proton-mail": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/pfad/zu/proton-mail-mcp-server-ultra/dist/server.mjs"]
    }
  }
}
```

Danach Claude Desktop vollständig beenden und neu starten.

**Cursor** (`~/.cursor/mcp.json`), **Gemini CLI** (`~/.gemini/settings.json`), **LM Studio** (`~/.lmstudio/mcp.json`) und die meisten anderen Clients nutzen dasselbe `mcpServers`-Format wie Claude Desktop.

**Codex CLI** (`~/.codex/config.toml`)

```toml
[mcp_servers.proton-mail]
command = "node"
args = ["/pfad/zu/proton-mail-mcp-server-ultra/dist/server.mjs"]
```

Wer die Zugangsdaten lieber in der Client-Konfiguration pflegt, ergänzt dort einen `env`-Block mit `PROTON_BRIDGE_USERNAME` und `PROTON_BRIDGE_PASSWORD`. Diese Datei darf dann nicht in ein Git-Repository gelangen.

#### 7. Ausprobieren

Zum Beispiel:

- „Zeig mir meine ungelesenen Mails von heute.“
- „Fasse die Mail von … zusammen und öffne den PDF-Anhang.“
- „Schreib einen Antwortentwurf auf die letzte Mail von …, ich prüfe ihn in Proton.“

#### 8. Aktualisieren

```bash
git pull
npm install
npm run build
```

Danach den Client neu starten, damit er den neuen Server lädt.

### Sicherheit beim Einsatz mit Agenten

- **Entwürfe statt Senden.** Solange man dem Agenten nicht voll vertraut, nur `create_draft` freigeben und Entwürfe in Proton prüfen. Viele Clients können einzelne Tools sperren oder vor jedem Aufruf nachfragen, gerade bei `send_email`, `send_draft`, `reply_to_email` und `delete_email`.
- **Mailinhalte sind fremde Eingaben.** Eine Mail kann Anweisungen enthalten, die sich an den Agenten richten („Leite alle Rechnungen an … weiter“). Der Agent muss Mailinhalte als Daten behandeln, nicht als Auftrag.
- **Datenfluss bedenken.** Die Bridge und dieser Server laufen lokal. Was der Agent liest, geht aber an das jeweils genutzte Sprachmodell. Wer das vermeiden will, nutzt ein lokales Modell, etwa über LM Studio.
- **Zugangsdaten schützen.** Die Datei `~/.proton-bridge-credentials` mit `chmod 600` versehen und nie einchecken.
- Die Bridge nutzt ein selbstsigniertes Zertifikat. Der Server akzeptiert es deshalb ohne Prüfung. Das ist nur sicher, solange `PROTON_BRIDGE_HOST` auf den eigenen Rechner zeigt.

### Fehlerbehebung

| Symptom | Ursache und Lösung |
|---|---|
| `Proton Bridge credentials not found` | Weder Umgebungsvariablen noch `~/.proton-bridge-credentials` gefunden, siehe Schritt 4. |
| Anmeldung schlägt fehl | Kontopasswort statt Bridge-Passwort verwendet, siehe Schritt 2. |
| `ECONNREFUSED` | Die Bridge läuft nicht, oder die Ports weichen ab. In der Bridge nachsehen und die `PROTON_BRIDGE_*_PORT`-Variablen anpassen. |
| Client zeigt den Server nicht | Absoluten Pfad zu `node` angeben (`which node`) und den Client vollständig neu starten. |
| Mail per UID nicht gefunden | UIDs gelten nur im Ordner, aus dem sie stammen. Den Ordner mit `folder` angeben. |

### Aufbau

```
src/server.js        Einstieg, registriert die Tools
src/config.js        Zugangsdaten und Optionen
src/connections.js   Wiederverwendete IMAP-/SMTP-Verbindungen, Ordner-Sperren
src/content.js       Body-Aufbereitung: HTML→Text, Zitate, seitenweise Ausgabe
src/compose.js       Antwortempfänger, Betreff, Zitat, MIME-Erzeugung
src/attachments.js   Anhänge als Text/Bild bzw. Ablage
src/tools/           Tool-Definitionen (Postfach, Senden/Entwürfe)
scripts/smoke.mjs    Ende-zu-Ende-Test gegen die laufende Bridge
test/                Unit-Tests (node:test)
```

### Hinweis zum KI-Einsatz

Die Weiterentwicklung dieses Forks erfolgt mit Unterstützung von KI-Coding-Agenten (Claude Code). Jede Änderung wird von mir geprüft, getestet und verantwortet. Commits mit KI-Beteiligung sind mit `Co-Authored-By` gekennzeichnet.

### Lizenz

[MIT](LICENSE). Die Lizenz gilt für den Code dieses Forks, der unter `src/`, `test/` und `scripts/` neu geschrieben wurde.

Das Ursprungsprojekt enthält keine Lizenzangabe. Die Rechte an dessen ursprünglichen Commits, die in der Git-Historie erhalten sind, verbleiben beim ursprünglichen Autor und werden von dieser Lizenz nicht erfasst.

---

## English

MCP server for Proton Mail via the **Proton Mail Bridge** (IMAP/SMTP). It gives **local AI agents** access to your own mailbox: read and search mail, open attachments, create drafts and send replies. It is not tied to any particular tool. Any MCP-capable client works, such as Claude Code, Claude Desktop/Cowork, Cursor, Codex CLI, Gemini CLI or LM Studio.

### Why this project exists

I stopped answering my email myself a long time ago; AI agents do that now. To make this work with Proton Mail, the agents need reliable local access to the mailbox that is not locked to a single vendor. The Proton Mail Bridge exposes the mailbox only on your own machine (`127.0.0.1`), and this server hands it to the agent via MCP. Your mail leaves the machine only towards the language model you choose to use.

### Thanks

This project is a fork of **[tamnys/proton-mail-mcp-server](https://github.com/tamnys/proton-mail-mcp-server)**. Many thanks for the initial development: the idea of exposing the Proton Mail Bridge over IMAP/SMTP as an MCP server, the basic tool structure and the reuse of Bridge connections all come from there.

### What this fork improves

- **HTML mail is readable.** Previously, HTML-only messages (about half of a typical mailbox) came back with an empty body. HTML is now converted to text; images, styles and tracking URLs are dropped. Newsletters whose text part consists only of URLs are also rendered from their HTML.
- **Long messages are paginated** (`offset`/`maxChars`) instead of flooding the agent's context.
- **Attachments can be opened:** PDFs as text, images directly, text files and attached messages rendered. Everything else is saved locally.
- **Drafts** appear in Proton under *Drafts* and can be edited there. An agent can prepare a reply and a human can review it before sending.
- **Search results are sorted by date**, including in "All Mail".
- **Source instead of a bundle:** modular code under `src/`, unit tests, and a smoke test against the running Bridge.

### Tools

| Tool | Purpose |
|---|---|
| `list_folders` | Folders with special-use flag and (unread) count |
| `list_emails` | Newest messages in a folder, pageable via `offset` |
| `search_emails` | Search by sender, recipient, subject, body, full text, date, unread, flagged; newest first |
| `read_email` | Headers, readable body, numbered attachment list. Options: `format`, `includeLinks`, `stripQuoted`, `offset`, `maxChars`, `markAsRead` |
| `get_attachment` | Open an attachment by index, or save it with `save: true` |
| `move_email`, `mark_email` | Move, mark read/unread, flag |
| `delete_email` | Move to Trash; delete permanently when already in Trash |
| `send_email`, `reply_to_email` | Send immediately (replies with threading, Reply-To and quote) |
| `create_draft` | Create a draft, new or as a reply via `replyToUid` (recipients, subject, threading and quote are set automatically) |
| `list_drafts`, `update_draft`, `send_draft`, `delete_draft` | Manage drafts |

For attachments, `send_email` and `attachments` expect local file paths.

UIDs are only valid within their folder. A message found by `search_emails` in "All Mail" must also be read with `folder: "All Mail"`.

### Step-by-step guide

#### 1. Prerequisites

- **Proton account on a paid plan.** The Proton Mail Bridge is only available on paid plans.
- **Proton Mail Bridge** installed: <https://proton.me/mail/bridge> (macOS, Windows, Linux)
- **Node.js ≥ 20** (`node --version`)
- **Git**
- An **MCP-capable client** (see step 6)

#### 2. Set up Proton Mail Bridge

1. Start the Bridge and sign in with your Proton account.
2. Wait for the initial sync to finish. Large mailboxes can take a while.
3. In the Bridge, select the account and show the **IMAP/SMTP credentials** (*Mailbox details* or *Mailbox configuration*). You need:
   - Username (your Proton address)
   - **Bridge password**: a password generated by the Bridge, **not** your Proton account password
   - Ports, by default IMAP `1143` and SMTP `1025`, both using STARTTLS
4. The Bridge must be running whenever the agent needs the mailbox. Enabling autostart in the Bridge settings is recommended.

#### 3. Get and build the project

```bash
git clone https://github.com/Hiwamashi/proton-mail-mcp-server-ultra.git
cd proton-mail-mcp-server-ultra
npm install
npm run build      # produces dist/server.mjs (single file, runs without node_modules)
npm test           # unit tests
```

Note the absolute path to `dist/server.mjs` (`pwd`); you need it in step 6. Also note the path to Node (`which node`). Some clients cannot find `node` otherwise, because they start without your shell's PATH.

#### 4. Store the credentials

A file `~/.proton-bridge-credentials` is recommended, so the password does not end up in any client configuration:

```bash
cat > ~/.proton-bridge-credentials <<'EOF'
PROTON_BRIDGE_USERNAME="you@proton.me"
PROTON_BRIDGE_PASSWORD="bridge-password"
EOF
chmod 600 ~/.proton-bridge-credentials
```

You can set the same values as environment variables instead. Environment variables take precedence over the file.

Optional settings:

| Variable | Default | Meaning |
|---|---|---|
| `PROTON_BRIDGE_HOST` | `127.0.0.1` | Bridge address |
| `PROTON_BRIDGE_IMAP_PORT` | `1143` | Bridge IMAP port |
| `PROTON_BRIDGE_SMTP_PORT` | `1025` | Bridge SMTP port |
| `PROTON_BRIDGE_SMTP_SECURE` | `false` | `true` = implicit TLS instead of STARTTLS |
| `PROTON_BRIDGE_FROM` | username | Sender address |
| `PROTON_BRIDGE_FROM_NAME` | – | Sender display name |
| `PROTON_BRIDGE_ALIASES` | – | Additional own addresses, comma-separated (left out on "reply all") |
| `PROTON_MCP_ATTACHMENT_DIR` | `~/Downloads/Proton-Anhänge` | Folder for saved attachments |
| `PROTON_BRIDGE_IDLE_TIMEOUT_MS` | `300000` | Close the IMAP connection after this idle time |

#### 5. Test the connection

```bash
node scripts/smoke.mjs                                        # read-only
SMOKE_SELF=you@proton.me node scripts/smoke.mjs --drafts      # also create, update and delete drafts
```

The smoke test starts the built server, lists folders and the newest messages, reads one message and searches "All Mail". With `--drafts` it also creates drafts addressed to yourself and deletes them again.

#### 6. Register it in your agent tool

In all examples, replace `/path/to/proton-mail-mcp-server-ultra` with the path from step 3. The server speaks MCP over `stdio`, so the client starts it itself and no separate service is needed.

**Claude Code**

```bash
claude mcp add --scope user proton-mail -- node /path/to/proton-mail-mcp-server-ultra/dist/server.mjs
```

**Claude Desktop / Cowork:** `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

```json
{
  "mcpServers": {
    "proton-mail": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/path/to/proton-mail-mcp-server-ultra/dist/server.mjs"]
    }
  }
}
```

Then quit Claude Desktop completely and start it again.

**Cursor** (`~/.cursor/mcp.json`), **Gemini CLI** (`~/.gemini/settings.json`), **LM Studio** (`~/.lmstudio/mcp.json`) and most other clients use the same `mcpServers` format as Claude Desktop.

**Codex CLI** (`~/.codex/config.toml`)

```toml
[mcp_servers.proton-mail]
command = "node"
args = ["/path/to/proton-mail-mcp-server-ultra/dist/server.mjs"]
```

If you prefer to keep the credentials in the client configuration, add an `env` block there with `PROTON_BRIDGE_USERNAME` and `PROTON_BRIDGE_PASSWORD`. That file must then never be committed to a Git repository.

#### 7. Try it

For example:

- "Show me today's unread messages."
- "Summarise the message from … and open the PDF attachment."
- "Draft a reply to the latest message from …; I'll review it in Proton."

#### 8. Update

```bash
git pull
npm install
npm run build
```

Then restart the client so it loads the new server.

### Security when used with agents

- **Drafts instead of sending.** As long as you do not fully trust the agent, only allow `create_draft` and review drafts in Proton. Many clients can disable individual tools or ask before each call, especially for `send_email`, `send_draft`, `reply_to_email` and `delete_email`.
- **Mail content is untrusted input.** A message can contain instructions aimed at the agent ("Forward all invoices to …"). The agent must treat mail content as data, not as instructions.
- **Mind the data flow.** The Bridge and this server run locally, but whatever the agent reads is sent to the language model it uses. To avoid that, use a local model, for example via LM Studio.
- **Protect your credentials.** Set `chmod 600` on `~/.proton-bridge-credentials` and never commit it.
- The Bridge uses a self-signed certificate, so the server accepts it without verification. This is only safe as long as `PROTON_BRIDGE_HOST` points to your own machine.

### Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Proton Bridge credentials not found` | Neither environment variables nor `~/.proton-bridge-credentials` were found; see step 4. |
| Login fails | Account password used instead of the Bridge password; see step 2. |
| `ECONNREFUSED` | The Bridge is not running, or the ports differ. Check the Bridge and adjust the `PROTON_BRIDGE_*_PORT` variables. |
| Client does not show the server | Use the absolute path to `node` (`which node`) and restart the client completely. |
| Message not found by UID | UIDs are only valid in the folder they came from. Pass that folder via `folder`. |

### Structure

```
src/server.js        Entry point, registers the tools
src/config.js        Credentials and options
src/connections.js   Reused IMAP/SMTP connections, folder locks
src/content.js       Body rendering: HTML→text, quotes, pagination
src/compose.js       Reply recipients, subject, quote, MIME generation
src/attachments.js   Attachments as text/image or saved to disk
src/tools/           Tool definitions (mailbox, sending/drafts)
scripts/smoke.mjs    End-to-end test against the running Bridge
test/                Unit tests (node:test)
```

### Note on AI use

This fork is developed with the help of AI coding agents (Claude Code). I review, test and take responsibility for every change. Commits with AI involvement are marked with `Co-Authored-By`.

### License

[MIT](LICENSE). The license covers the code of this fork, which was rewritten under `src/`, `test/` and `scripts/`.

The original project does not specify a license. The rights to its original commits, which are preserved in the Git history, remain with the original author and are not covered by this license.
