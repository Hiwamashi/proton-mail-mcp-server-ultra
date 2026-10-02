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
| **reading/search-emails.md** | Suche nach Absender, Empfänger, Betreff, Body, Datum, etc. |
| **reading/read-email.md** | Detailliertes Lesen einer Mail: Header, aufbereiteter Body, Anhängsliste |
| **reading/get-attachment.md** | Anhang öffnen: PDF als Text, Bilder direkt, RFC822 gerendert, Speichern |
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

## Wichtige Konzepte

**UIDs** sind eindeutig **nur innerhalb eines Ordners**. Eine Mail, die in „All Mail" gefunden wurde, muss auch mit `folder: "All Mail"` gelesen werden.

**Wiederverwendete Verbindungen** – Die IMAP-Verbindung wird über mehrere Tool-Aufrufe hinweg wiederverwendet und nach einer konfigurierbaren Idle-Zeit (`PROTON_BRIDGE_IDLE_TIMEOUT_MS`, Standard 5 min) geschlossen. Das reduziert die Latenz bei aufeinanderfolgenden Operationen.

**Lesevorgänge mit Retry** – Nur idempotente Operationen (list, fetch, search) werden einmal automatisch wiederholt, falls die Verbindung verloren gehen sollte. Schreibvorgänge (append, delete, move) werden **nicht** wiederholt, um doppelte Ausführung zu vermeiden.

**BODY.PEEK** – Der Server liest Mail-Bodies ohne das `\Seen`-Flag zu setzen, außer wenn der Agent `markAsRead: true` setzt.

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
| **reading/search-emails.md** | Search by sender, recipient, subject, body, date, etc. |
| **reading/read-email.md** | Detailed reading of a message: headers, processed body, attachment list |
| **reading/get-attachment.md** | Open attachment: PDF as text, images directly, RFC822 rendered, save |
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

## Key Concepts

**UIDs** are unique **only within a folder**. A message found in "All Mail" must also be read with `folder: "All Mail"`.

**Reused connections** – The IMAP connection is reused across multiple tool calls and closed after a configurable idle time (`PROTON_BRIDGE_IDLE_TIMEOUT_MS`, default 5 min). This reduces latency for consecutive operations.

**Read operations with retry** – Only idempotent operations (list, fetch, search) are automatically retried once if the connection is lost. Write operations (append, delete, move) are **not** retried to avoid double execution.

**BODY.PEEK** – The server reads message bodies without setting the `\Seen` flag, unless the agent sets `markAsRead: true`.

**HTML body handling** – HTML-only messages are converted to text, images and tracking URLs are dropped. If the text body is empty or consists only of URLs, the HTML is used instead.
