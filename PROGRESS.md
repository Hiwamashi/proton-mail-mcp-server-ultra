# PROGRESS

**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

Stand: 2026-10-02

### Umgesetzt

| Bereich | Inhalt | Spec |
|---|---|---|
| Bridge-Anbindung | Zugangsdaten aus Umgebung oder `~/.proton-bridge-credentials`, wiederverwendete IMAP-Verbindung mit Leerlauf-Timeout, ein Retry nur für lesende Vorgänge, SMTP ohne Retry | `bridge-connection` |
| Lesen | `list_folders`, `list_emails`, `search_emails` (nach Datum sortiert, auch in „All Mail“), `read_email` (HTML → Text, seitenweise, Zitate entfernen, setzt nicht ungewollt „gelesen“) | `mail-reading` |
| Anhänge | `get_attachment`: PDF als Text, Bilder direkt, Textdateien und angehängte Mails gerendert, alles andere gespeichert | `attachments` |
| Postfach | `move_email`, `mark_email`, `delete_email` (Papierkorb, dort endgültig) | `mailbox-management` |
| Senden | `send_email`, `reply_to_email` mit Reply-To, Threading und Zitat | `mail-sending` |
| Entwürfe | `create_draft` (auch als Antwort), `list_drafts`, `update_draft` (erst anlegen, dann löschen), `send_draft`, `delete_draft` | `drafts` |
| Projektgrundlagen | OpenSpec eingerichtet, Baseline-Specs des Ist-Stands (6 Capabilities, 31 Requirements), `feature-documentation/` (DE+EN), diese Datei | – |

### In Arbeit

Derzeit nichts. Alle unten genannten Changes sind spezifiziert und bereit für `/opsx:apply`.

### Ausstehend (OpenSpec-Changes unter `openspec/changes/`)

Empfohlene Reihenfolge:

1. **`harden-agent-safety`** – Betriebsmodi `read-only` / `drafts` (neuer Standard) / `full`, erlaubte Verzeichnisse für Anhänge, MCP-Tool-Annotations, Hinweis auf nicht vertrauenswürdige Inhalte. **Ändert das Standardverhalten:** Senden nur noch mit `PROTON_MCP_MODE=full`.
2. **`reduce-message-refetch`** – Cache für geparste Mails, teilweiser Download großer Mails, konfigurierbares Limit für Inline-Bilder (Standard 1 MB).
3. **`add-reading-tools`** – `get_thread`, zusätzliche Suchkriterien (`cc`, Größe, beantwortet, Anhänge), Text aus Office-/ODF-Dateien, Zusammenfassung von Kalendereinladungen.
4. **`add-mailbox-write-tools`** – `forward_email` und Weiterleitungs-Entwürfe, Sammeloperationen mit `uids`, Proton-Labels (`label_email`), `create_folder`. Setzt Change 1 voraus.
5. **`improve-robustness-and-locale`** – Sprache und Zeitzone der Zitatzeile, Ordner-Cache pro Verbindung, Sortierung von `list_emails` dokumentiert, Version aus `package.json`, Handler-Tests mit IMAP-Fake, CI. Unabhängig von den anderen.

---

## English

As of: 2026-10-02

### Done

| Area | Content | Spec |
|---|---|---|
| Bridge connection | Credentials from environment or `~/.proton-bridge-credentials`, reused IMAP connection with idle timeout, one retry for read operations only, SMTP without retry | `bridge-connection` |
| Reading | `list_folders`, `list_emails`, `search_emails` (sorted by date, also in "All Mail"), `read_email` (HTML → text, paged, quote stripping, never marks as read unintentionally) | `mail-reading` |
| Attachments | `get_attachment`: PDFs as text, images directly, text files and attached emails rendered, everything else saved | `attachments` |
| Mailbox | `move_email`, `mark_email`, `delete_email` (to Trash, permanent there) | `mailbox-management` |
| Sending | `send_email`, `reply_to_email` with Reply-To, threading and quote | `mail-sending` |
| Drafts | `create_draft` (also as reply), `list_drafts`, `update_draft` (append first, then delete), `send_draft`, `delete_draft` | `drafts` |
| Project foundations | OpenSpec set up, baseline specs of the current state (6 capabilities, 31 requirements), `feature-documentation/` (DE+EN), this file | – |

### In progress

Nothing at the moment. All changes listed below are specified and ready for `/opsx:apply`.

### Pending (OpenSpec changes under `openspec/changes/`)

Recommended order:

1. **`harden-agent-safety`** – Operating modes `read-only` / `drafts` (new default) / `full`, allowed attachment directories, MCP tool annotations, untrusted-content instruction. **Changes the default behavior:** sending only with `PROTON_MCP_MODE=full`.
2. **`reduce-message-refetch`** – Cache for parsed messages, partial download of large messages, configurable inline image limit (default 1 MB).
3. **`add-reading-tools`** – `get_thread`, additional search criteria (`cc`, size, answered, attachments), text from Office/ODF files, summary of calendar invitations.
4. **`add-mailbox-write-tools`** – `forward_email` and forward drafts, bulk operations with `uids`, Proton labels (`label_email`), `create_folder`. Requires change 1.
5. **`improve-robustness-and-locale`** – Language and time zone of the quote line, folder cache per connection, documented `list_emails` ordering, version from `package.json`, handler tests with an IMAP fake, CI. Independent of the others.
