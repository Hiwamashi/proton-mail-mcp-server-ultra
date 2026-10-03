**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Feature-Dokumentation des Proton Mail MCP-Servers

Diese Sammlung dokumentiert den Aufbau und das Verhalten des Proton Mail MCP-Servers für andere KI-Coding-Agenten. Jede Datei beschreibt eine Komponente oder ein Tool: wie es intern arbeitet, welche Parameter es akzeptiert, welche Rückgaben es produziert und in welchen Fällen es fehlschlägt.

Die Dokumentation folgt dem Code exakt – es werden keine geplanten oder möglichen Features aufgeführt, nur das, was tatsächlich implementiert ist.

## Struktur

| Datei | Inhalt |
|---|---|
| **configuration.md** | Laden von Zugangsdaten und Optionen; Umgebungsvariablen und Konfigurationsdatei |
| **connections/imap-connection-reuse.md** | IMAP-Verbindung: Wiederverwendung, Idle-Timeout, Retry-Logik für Lesevorgänge, Sperrung von Ordnern |
| **connections/smtp-send.md** | SMTP-Versand: frische Verbindung pro Mail, kein Retry |
| **reading/body-extraction.md** | Aufbereitung von Mail-Body: HTML→Text, Linkbehandlung, Zitat-Erkennung, Paginierung |
| **reading/list-folders.md** | Aufzählung aller Ordner mit Sonderfunktion und Nachrichtenanzahl |
| **reading/list-emails.md** | Neueste Mails eines Ordners auflisten, paginierbar |
| **reading/search-emails.md** | Suche nach Absender, Empfänger, Cc, Betreff, Body, Datum, Größe, beantwortet, Anhängen, etc. |
| **reading/read-email.md** | Detailliertes Lesen einer Mail: Header, aufbereiteter Body, Anhängsliste |
| **reading/get-attachment.md** | Anhang öffnen: PDF und Office als Text, Kalender zusammengefasst, Bilder direkt (bis 1 MB), RFC822 gerendert, Speichern |
| **reading/message-cache.md** | Cache geparster Mails, teilweiser Download großer Mails, Bild-Limit, Rückbau, Messwerte |
| **reading/get-thread.md** | Ganze Konversation einer Mail über alle Ordner, mit Bodies in einem Zeichenbudget |
| **reading/office-attachments.md** | Text aus DOCX, XLSX, PPTX, ODT, ODS, ODP; Schutz vor ZIP-Bomben; verschlüsselte und alte Formate |
| **reading/calendar-attachments.md** | Zusammenfassung von Kalenderdateien und Einladungen, Zeitzonen, `raw` |
| **mailbox/move-email.md** | Mail in anderen Ordner verschieben |
| **mailbox/mark-email.md** | Mail als gelesen/ungelesen oder markiert/unmarkiert setzen |
| **mailbox/delete-email.md** | Mail löschen oder endgültig löschen |
| **compose/reply-logic.md** | Antwort-Logik: Empfänger bestimmen, Betreff, Zitat, Zeitzone |
| **compose/send-email.md** | Neue Mail verfassen und sofort versenden |
| **compose/reply-to-email.md** | Auf Mail antworten und sofort versenden |
| **compose/create-draft.md** | Mail als Entwurf speichern (neu oder als Antwort) |
| **compose/list-drafts.md** | Entwürfe auflisten |
| **compose/update-draft.md** | Entwurf ändern (Empfänger, Betreff, Body, Anhänge) |
| **compose/send-draft.md** | Entwurf versenden und aus Entwürfen entfernen |
| **compose/delete-draft.md** | Entwurf löschen |
| **safety/operating-modes.md** | Betriebsmodi `read-only`/`drafts`/`full`: welche Tools wann existieren, Tool-Annotationen, Server-Anweisungen |
| **safety/attachment-roots.md** | Erlaubte Verzeichnisse für lokale Anhänge, Pfadprüfung (Symlinks, versteckte Pfade) |

## Wichtige Konzepte

**UIDs** sind eindeutig **nur innerhalb eines Ordners**. Eine Mail, die in „All Mail" gefunden wurde, muss auch mit `folder: "All Mail"` gelesen werden.

**Wiederverwendete Verbindungen** – Die IMAP-Verbindung wird über mehrere Tool-Aufrufe hinweg wiederverwendet und nach einer konfigurierbaren Idle-Zeit (`PROTON_BRIDGE_IDLE_TIMEOUT_MS`, Standard 5 min) geschlossen. Das reduziert die Latenz bei aufeinanderfolgenden Operationen.

**Lesevorgänge mit Retry** – Nur idempotente Operationen (list, fetch, search) werden einmal automatisch wiederholt, falls die Verbindung verloren gehen sollte. Schreibvorgänge (append, delete, move) werden **nicht** wiederholt, um doppelte Ausführung zu vermeiden.

**BODY.PEEK** – Der Server liest Mail-Bodies ohne das `\Seen`-Flag zu setzen, außer wenn der Agent `markAsRead: true` setzt.

**Betriebsmodi** – `PROTON_MCP_MODE` (`read-only`, `drafts` als Standard, `full`) bestimmt, welche Tools überhaupt registriert werden. Senden und endgültiges Löschen gibt es nur in `full`. Lokale Anhänge kommen nur aus erlaubten Verzeichnissen (`PROTON_MCP_ATTACHMENT_ROOTS`). Siehe `safety/`.

**Nachrichten-Cache und Teilladung** – `loadMessage()` hält geparste Mails 10 Minuten im Speicher (Standard 64 MB, Schlüssel Ordner + UIDVALIDITY + UID, Flags immer frisch) und lädt Mails über 5 MB für `read_email` und `get_attachment` teilweise. Rückbau über `PROTON_MCP_CACHE_MAX_BYTES=0` und `PROTON_MCP_PARTIAL_FETCH_BYTES=999999999999`. Siehe `reading/message-cache.md`.

**HTML-Body-Handling** – Reine HTML-Mails werden in Text konvertiert, Bilder und Tracking-URLs fallen weg. Ist der Text-Body leer oder besteht nur aus URLs, wird das HTML verwendet.

---

## English

# Feature Documentation of the Proton Mail MCP Server

This collection documents the structure and behavior of the Proton Mail MCP server for other AI coding agents. Each file describes a component or tool: how it works internally, what parameters it accepts, what return values it produces, and in what cases it fails.

The documentation tracks the code exactly – no planned or possible features are listed, only what is actually implemented.

## Structure

| File | Content |
|---|---|
| **configuration.md** | Loading credentials and options; environment variables and configuration file |
| **connections/imap-connection-reuse.md** | IMAP connection: reuse, idle timeout, retry logic for read operations, mailbox locking |
| **connections/smtp-send.md** | SMTP sending: fresh connection per message, no retry |
| **reading/body-extraction.md** | Message body processing: HTML→text, link handling, quote detection, pagination |
| **reading/list-folders.md** | Enumerate all folders with special-use flag and message count |
| **reading/list-emails.md** | List newest messages in a folder, pageable |
| **reading/search-emails.md** | Search by sender, recipient, Cc, subject, body, date, size, answered, attachments, etc. |
| **reading/read-email.md** | Detailed reading of a message: headers, processed body, attachment list |
| **reading/get-attachment.md** | Open attachment: PDF and Office as text, calendars summarized, images directly (up to 1 MB), RFC822 rendered, save |
| **reading/message-cache.md** | Cache of parsed messages, partial download of large messages, image limit, rollback, measurements |
| **reading/get-thread.md** | Whole conversation of a message across all folders, with bodies within one character budget |
| **reading/office-attachments.md** | Text from DOCX, XLSX, PPTX, ODT, ODS, ODP; ZIP bomb protection; encrypted and legacy formats |
| **reading/calendar-attachments.md** | Summary of calendar files and invitations, time zones, `raw` |
| **mailbox/move-email.md** | Move message to another folder |
| **mailbox/mark-email.md** | Mark message as read/unread or flagged/unflagged |
| **mailbox/delete-email.md** | Delete message or permanently delete |
| **compose/reply-logic.md** | Reply logic: determine recipients, subject, quote, timezone |
| **compose/send-email.md** | Compose new message and send immediately |
| **compose/reply-to-email.md** | Reply to message and send immediately |
| **compose/create-draft.md** | Save message as draft (new or as reply) |
| **compose/list-drafts.md** | List drafts |
| **compose/update-draft.md** | Modify draft (recipients, subject, body, attachments) |
| **compose/send-draft.md** | Send draft and remove it from drafts |
| **compose/delete-draft.md** | Permanently delete draft |
| **safety/operating-modes.md** | Operating modes `read-only`/`drafts`/`full`: which tools exist when, tool annotations, server instructions |
| **safety/attachment-roots.md** | Allowed directories for local attachments, path check (symlinks, hidden paths) |

## Key Concepts

**UIDs** are unique **only within a folder**. A message found in "All Mail" must also be read with `folder: "All Mail"`.

**Reused connections** – The IMAP connection is reused across multiple tool calls and closed after a configurable idle time (`PROTON_BRIDGE_IDLE_TIMEOUT_MS`, default 5 min). This reduces latency for consecutive operations.

**Read operations with retry** – Only idempotent operations (list, fetch, search) are automatically retried once if the connection is lost. Write operations (append, delete, move) are **not** retried to avoid double execution.

**BODY.PEEK** – The server reads message bodies without setting the `\Seen` flag, unless the agent sets `markAsRead: true`.

**Operating modes** – `PROTON_MCP_MODE` (`read-only`, `drafts` as default, `full`) decides which tools are registered at all. Sending and permanent deletion exist only in `full`. Local attachments come only from allowed directories (`PROTON_MCP_ATTACHMENT_ROOTS`). See `safety/`.

**Message cache and partial loading** – `loadMessage()` keeps parsed messages in memory for 10 minutes (default 64 MB, key folder + UIDVALIDITY + UID, flags always fresh) and loads messages above 5 MB partially for `read_email` and `get_attachment`. Roll back with `PROTON_MCP_CACHE_MAX_BYTES=0` and `PROTON_MCP_PARTIAL_FETCH_BYTES=999999999999`. See `reading/message-cache.md`.

**HTML body handling** – HTML-only messages are converted to text, images and tracking URLs are dropped. If the text body is empty or consists only of URLs, the HTML is used instead.
