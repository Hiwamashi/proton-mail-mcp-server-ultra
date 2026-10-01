# proton-mcp-ultra

MCP-Server für Proton Mail über die **Proton Mail Bridge** (IMAP/SMTP). Für Claude Desktop, Cowork und Claude Code.

Er ersetzt den bisherigen `proton-mail-mcp-server` und behebt dessen Schwächen:

- **HTML-Mails sind lesbar.** Bisher kam bei reinen HTML-Mails (rund die Hälfte des Postfachs) ein leerer Body zurück. Jetzt wird HTML in Text umgewandelt; Bilder, Styles und Tracking-URLs fallen weg. Newsletter, deren Textteil nur aus URLs besteht, werden ebenfalls über das HTML aufbereitet.
- **Lange Mails werden seitenweise geliefert** (`offset`/`maxChars`), statt den Kontext zu sprengen.
- **Anhänge lassen sich öffnen:** PDFs als Text, Bilder direkt, Textdateien und angehängte Mails gerendert, alles andere wird lokal gespeichert.
- **Entwürfe** erscheinen in Proton unter *Entwürfe* und lassen sich dort weiterbearbeiten.
- **Suchergebnisse sind nach Datum sortiert**, auch in „All Mail“.

## Tools

| Tool | Zweck |
|---|---|
| `list_folders` | Ordner mit Sonderfunktion und Anzahl (ungelesen) |
| `list_emails` | Neueste Mails eines Ordners, mit `offset` blätterbar |
| `search_emails` | Suche nach Absender, Empfänger, Betreff, Body, Volltext, Datum, ungelesen, markiert – neueste zuerst |
| `read_email` | Header, lesbarer Body, nummerierte Anhangsliste. Optionen: `format`, `includeLinks`, `stripQuoted`, `offset`, `maxChars`, `markAsRead` |
| `get_attachment` | Anhang per Index öffnen oder mit `save: true` speichern |
| `move_email`, `mark_email` | Verschieben, gelesen/ungelesen, markieren |
| `delete_email` | In den Papierkorb; im Papierkorb endgültig löschen |
| `send_email`, `reply_to_email` | Sofort senden (Antworten mit Threading, Reply-To und Zitat) |
| `create_draft` | Entwurf anlegen – neu oder mit `replyToUid` als Antwort (Empfänger, Betreff, Threading, Zitat automatisch) |
| `list_drafts`, `update_draft`, `send_draft`, `delete_draft` | Entwürfe verwalten |

`send_email` und `attachments` erwarten lokale Dateipfade für Anhänge.

UIDs gelten nur innerhalb ihres Ordners. Eine Mail aus `search_emails` in „All Mail“ also auch mit `folder: "All Mail"` lesen.

## Einrichtung

Voraussetzungen: Node.js ≥ 20, Proton Mail Bridge läuft und ist angemeldet.

```bash
npm install
npm run build      # erzeugt dist/server.mjs (eine Datei, ohne node_modules lauffähig)
npm test           # Unit-Tests
```

Zugangsdaten aus Umgebungsvariablen oder aus `~/.proton-bridge-credentials`. Wichtig: das **Bridge-Passwort**, nicht das Proton-Kontopasswort.

```bash
PROTON_BRIDGE_USERNAME="du@proton.me"
PROTON_BRIDGE_PASSWORD="bridge-passwort"
```

Optional:

| Variable | Standard | Bedeutung |
|---|---|---|
| `PROTON_BRIDGE_HOST` | `127.0.0.1` | |
| `PROTON_BRIDGE_IMAP_PORT` | `1143` | |
| `PROTON_BRIDGE_SMTP_PORT` | `1025` | |
| `PROTON_BRIDGE_SMTP_SECURE` | `false` | `true` = implizites TLS statt STARTTLS |
| `PROTON_BRIDGE_FROM` | Benutzername | Absenderadresse |
| `PROTON_BRIDGE_FROM_NAME` | – | Anzeigename des Absenders |
| `PROTON_BRIDGE_ALIASES` | – | Weitere eigene Adressen, kommagetrennt (werden bei „Allen antworten“ ausgelassen) |
| `PROTON_MCP_ATTACHMENT_DIR` | `~/Downloads/Proton-Anhänge` | Ablage für gespeicherte Anhänge |
| `PROTON_BRIDGE_IDLE_TIMEOUT_MS` | `300000` | IMAP-Verbindung nach Leerlauf schließen |

### Claude Desktop

In `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "proton-mail": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/Users/saschakrinke/Quellcode/Cursor/proton-mcp-ultra/dist/server.mjs"]
    }
  }
}
```

Danach Claude Desktop komplett beenden und neu starten.

## Smoke-Test

```bash
node scripts/smoke.mjs                                        # nur lesend
SMOKE_SELF=du@proton.me node scripts/smoke.mjs --drafts       # + Entwurf anlegen/ändern/löschen
```

## Aufbau

```
src/server.js        Einstieg, registriert die Tools
src/config.js        Zugangsdaten und Optionen
src/connections.js   Wiederverwendete IMAP-/SMTP-Verbindungen, Ordner-Sperren
src/content.js       Body-Aufbereitung: HTML→Text, Zitate, Seitenweise-Ausgabe
src/compose.js       Antwortempfänger, Betreff, Zitat, MIME-Erzeugung
src/attachments.js   Anhänge als Text/Bild bzw. Ablage
src/tools/           Tool-Definitionen (Postfach, Senden/Entwürfe)
```
