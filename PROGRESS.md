# PROGRESS

**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

Stand: 2026-10-03

### Umgesetzt

| Bereich | Inhalt | Spec |
|---|---|---|
| Bridge-Anbindung | Zugangsdaten aus Umgebung oder `~/.proton-bridge-credentials`, wiederverwendete IMAP-Verbindung mit Leerlauf-Timeout, ein Retry nur für lesende Vorgänge, SMTP ohne Retry | `bridge-connection` |
| Lesen | `list_folders`, `list_emails`, `search_emails` (nach Datum sortiert, auch in „All Mail“), `read_email` (HTML → Text, seitenweise, Zitate entfernen, setzt nicht ungewollt „gelesen“) | `mail-reading` |
| Anhänge | `get_attachment`: PDF als Text, Bilder direkt, Textdateien und angehängte Mails gerendert, alles andere gespeichert | `attachments` |
| Postfach | `move_email`, `mark_email`, `delete_email` (Papierkorb, dort endgültig) | `mailbox-management` |
| Senden | `send_email`, `reply_to_email` mit Reply-To, Threading und Zitat | `mail-sending` |
| Entwürfe | `create_draft` (auch als Antwort), `list_drafts`, `update_draft` (erst anlegen, dann löschen), `send_draft`, `delete_draft` | `drafts` |
| Sicherheit | Betriebsmodi `read-only` / `drafts` (Standard) / `full` über `PROTON_MCP_MODE` (Tools werden je Modus registriert, endgültiges Löschen nur in `full`, `markAsRead` in `read-only` abgelehnt); Anhänge nur aus erlaubten Verzeichnissen (`PROTON_MCP_ATTACHMENT_ROOTS`, Symlinks aufgelöst, versteckte Pfade immer abgelehnt); Titel und MCP-Annotationen an allen Tools; Server-Anweisung zu nicht vertrauenswürdigen Mailinhalten. **Ändert das Standardverhalten:** Senden nur noch mit `PROTON_MCP_MODE=full` | `agent-safety` (Change `harden-agent-safety`, archiviert am 2026-10-02) |
| Weniger erneutes Laden | Cache geparster Mails im Speicher (Schlüssel Ordner + UIDVALIDITY + UID, 64 MB, 10 min, Flags immer frisch, Invalidierung bei Verschieben/Löschen/Entwurfsänderung); teilweiser Download von Mails über 5 MB in `read_email` und `get_attachment` (Gerüst von mailparser geparst, Gegenprobe der Anhangsliste, Rückfall auf vollen Download); Bild-Limit für `get_attachment` konfigurierbar, Standard 1 MB (früher 5 MB). Vier neue Variablen `PROTON_MCP_CACHE_MAX_BYTES`, `PROTON_MCP_CACHE_TTL_MS`, `PROTON_MCP_PARTIAL_FETCH_BYTES`, `PROTON_MCP_MAX_INLINE_IMAGE_BYTES`. Live gegen die Bridge gemessen (106 von 106 Nachrichten identisch). **Ändert das Standardverhalten:** Bilder über 1 MB werden gespeichert statt direkt gezeigt | `mail-reading`, `attachments` (Change `reduce-message-refetch`, archiviert am 2026-10-03) |
| Lese-Tools | Neues Tool `get_thread`: ganze Konversation über alle Ordner, aus Header-Suche in „All Mail“ rekonstruiert, mit Bodies ohne Zitat in einem Zeichenbudget; doppelte Kopien von Proton zusammengefasst; live 2,6 bis 5,6 s pro Thread. `search_emails` mit `cc`, `larger`, `smaller`, `answered`, `hasAttachments`. `get_attachment` liest DOCX, XLSX, PPTX, ODT, ODS, ODP als Text (neue Abhängigkeit `fflate`, Schutz vor ZIP-Bomben) und fasst Kalenderdateien zusammen (`raw: true` für den Rohtext). **Ändert das Standardverhalten:** `.ics` kommt mit Zusammenfassung vor dem Rohtext; Office-Dateien kommen als Text statt gespeichert | `conversation-threads` (neu), `mail-reading`, `attachments`, `agent-safety` (Change `add-reading-tools`, archiviert am 2026-10-03) |
| Schreib-Tools | `forward_email` (nur `full`) und Weiterleitungs-Entwürfe (`create_draft` mit `forwardUid`): `Fwd:`-Betreff, Kopfblock, Original-Text und -Anhänge ohne Signatur. Sammeloperationen mit `uids` (bis 500) für `move_email`, `mark_email`, `delete_email` mit `processed`/`notFound`. Proton-Labels mit `label_email` (COPY bzw. EXPUNGE im Label-Ordner, live per Spike bestätigt) und `create_folder`. **Ändert das Verhalten:** `mark_email` meldet eine fehlende UID jetzt als Fehler statt stillem Erfolg | `labels` (neu), `mail-sending`, `drafts`, `mailbox-management` (Change `add-mailbox-write-tools`, archiviert am 2026-10-03) |
| Robustheit und Sprache | Zitatzeile und Weiterleitungs-Kopfblock in `de`/`en`/`fr`/`es`/`it` mit wählbarer Zeitzone (`PROTON_MCP_LOCALE`, `PROTON_MCP_TIMEZONE`, Prüfung beim Start); `stripQuoted` erkennt alle fünf Sprachen (die spanische Zeile wurde vorher nicht erkannt). Ordner-Cache pro Verbindung, neu aufgelöst nach „Mailbox existiert nicht“. `list_emails` beschreibt seine Reihenfolge. Version aus `package.json`. Testnähte und Fake-IMAP-Client mit Handler-Tests für Retry/kein Retry, Entwurfsersatz und Aufräumen nach dem Senden; CI auf Node 20 und 22. `nodemailer` von 6.10 auf 10.0.14 (`npm audit`: 0 Schwachstellen, Entwürfe und STARTTLS live geprüft) | `mail-sending`, `bridge-connection`, `mail-reading` (Change `improve-robustness-and-locale`, archiviert am 2026-10-03) |
| Projektgrundlagen | OpenSpec eingerichtet, Baseline-Specs des Ist-Stands, `feature-documentation/` (DE+EN), diese Datei | – |

### In Arbeit

Derzeit nichts. Alle geplanten Changes sind umgesetzt und archiviert; die gültigen Specs liegen unter `openspec/specs/`.

### Ausstehend (OpenSpec-Changes unter `openspec/changes/`)

Keine weiteren Changes geplant.

---

## English

As of: 2026-10-03

### Done

| Area | Content | Spec |
|---|---|---|
| Bridge connection | Credentials from environment or `~/.proton-bridge-credentials`, reused IMAP connection with idle timeout, one retry for read operations only, SMTP without retry | `bridge-connection` |
| Reading | `list_folders`, `list_emails`, `search_emails` (sorted by date, also in "All Mail"), `read_email` (HTML → text, paged, quote stripping, never marks as read unintentionally) | `mail-reading` |
| Attachments | `get_attachment`: PDFs as text, images directly, text files and attached emails rendered, everything else saved | `attachments` |
| Mailbox | `move_email`, `mark_email`, `delete_email` (to Trash, permanent there) | `mailbox-management` |
| Sending | `send_email`, `reply_to_email` with Reply-To, threading and quote | `mail-sending` |
| Drafts | `create_draft` (also as reply), `list_drafts`, `update_draft` (append first, then delete), `send_draft`, `delete_draft` | `drafts` |
| Safety | Operating modes `read-only` / `drafts` (default) / `full` via `PROTON_MCP_MODE` (tools registered per mode, permanent deletion only in `full`, `markAsRead` refused in `read-only`); attachments only from allowed directories (`PROTON_MCP_ATTACHMENT_ROOTS`, symlinks resolved, hidden paths always refused); titles and MCP annotations on all tools; server instruction about untrusted mail content. **Changes the default behavior:** sending only with `PROTON_MCP_MODE=full` | `agent-safety` (change `harden-agent-safety`, archived on 2026-10-02) |
| Less re-fetching | Cache of parsed messages in memory (key folder + UIDVALIDITY + UID, 64 MB, 10 min, flags always fresh, invalidation on move/delete/draft change); partial download of messages above 5 MB in `read_email` and `get_attachment` (skeleton parsed by mailparser, cross-check of the attachment list, fallback to full download); configurable image limit for `get_attachment`, default 1 MB (previously 5 MB). Four new variables `PROTON_MCP_CACHE_MAX_BYTES`, `PROTON_MCP_CACHE_TTL_MS`, `PROTON_MCP_PARTIAL_FETCH_BYTES`, `PROTON_MCP_MAX_INLINE_IMAGE_BYTES`. Measured live against the Bridge (106 of 106 messages identical). **Changes the default behavior:** images above 1 MB are saved instead of shown directly | `mail-reading`, `attachments` (change `reduce-message-refetch`, archived on 2026-10-03) |
| Reading tools | New tool `get_thread`: whole conversation across all folders, rebuilt from header searches in "All Mail", with bodies without quotes within one character budget; Proton's duplicate copies merged; 2.6 to 5.6 s per thread live. `search_emails` with `cc`, `larger`, `smaller`, `answered`, `hasAttachments`. `get_attachment` reads DOCX, XLSX, PPTX, ODT, ODS, ODP as text (new dependency `fflate`, ZIP bomb protection) and summarizes calendar files (`raw: true` for the raw text). **Changes the default behavior:** `.ics` comes with a summary before the raw text; Office files come back as text instead of being saved | `conversation-threads` (new), `mail-reading`, `attachments`, `agent-safety` (change `add-reading-tools`, archived on 2026-10-03) |
| Write tools | `forward_email` (`full` only) and forward drafts (`create_draft` with `forwardUid`): `Fwd:` subject, header block, original text and attachments without signature. Bulk operations with `uids` (up to 500) for `move_email`, `mark_email`, `delete_email` with `processed`/`notFound`. Proton labels with `label_email` (COPY or EXPUNGE in the label folder, confirmed live by a spike) and `create_folder`. **Changes behavior:** `mark_email` now reports a missing UID as an error instead of silent success | `labels` (new), `mail-sending`, `drafts`, `mailbox-management` (change `add-mailbox-write-tools`, archived on 2026-10-03) |
| Robustness and language | Attribution line and forward header in `de`/`en`/`fr`/`es`/`it` with a selectable time zone (`PROTON_MCP_LOCALE`, `PROTON_MCP_TIMEZONE`, checked at startup); `stripQuoted` recognizes all five languages (the Spanish line was not recognized before). Folder cache per connection, resolved anew after "mailbox does not exist". `list_emails` describes its ordering. Version from `package.json`. Test seams and a fake IMAP client with handler tests for retry/no retry, draft replacement and cleanup after sending; CI on Node 20 and 22. `nodemailer` from 6.10 to 10.0.14 (`npm audit`: 0 vulnerabilities, drafts and STARTTLS checked live) | `mail-sending`, `bridge-connection`, `mail-reading` (change `improve-robustness-and-locale`, archived on 2026-10-03) |
| Project foundations | OpenSpec set up, baseline specs of the current state, `feature-documentation/` (DE+EN), this file | – |

### In progress

Nothing at the moment. All planned changes are implemented and archived; the current specs are under `openspec/specs/`.

### Pending (OpenSpec changes under `openspec/changes/`)

No further changes planned.
