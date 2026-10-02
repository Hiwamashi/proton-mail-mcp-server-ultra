**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Tool: list_folders

**Datei:** src/tools/mailbox.js

## Zweck

Zählt alle Ordner des Postfachs und zeigt ihre Sonderfunktion und Nachrichtenanzahl.

## Parameter

Keine – das Tool hat kein Input-Schema.

## Rückgabe

MCP-Text-Block mit Array:

```javascript
[
  {
    path: "INBOX",
    specialUse: "\\Inbox",
    messages: 145,
    unread: 5,
  },
  {
    path: "Drafts",
    specialUse: "\\Drafts",
    messages: 3,
    unread: 0,
  },
  {
    path: "[Gmail]/All Mail",
    specialUse: "\\All",
    messages: 2847,
    unread: 0,
  },
  {
    path: "Folders/MyFolder",
    specialUse: null,
    messages: 42,
    unread: 2,
  },
]
```

## Besonderheiten

- **Ordner-Pfade** – Der `path` wird von der Bridge geliefert und ist eindeutig. Manchmal enthalten Pfade `/` (z. B. `Folders/MyFolder`).
- **specialUse** – IMAP Special-Use Flags wie `\Inbox`, `\Sent`, `\Drafts`, `\Trash`, `\All`, etc. Falls nicht vorhanden: `null`.
- **messages** – Gesamtzahl der Mails im Ordner (kann `null` sein, falls Bridge die Info nicht liefert).
- **unread** – Anzahl ungelesener Mails (kann `null` sein).

## Implementierung

```javascript
const folders = await client.list({ statusQuery: { messages: true, unseen: true } });
```

Die `statusQuery` fordert die Nachrichtenanzahl und ungelesenen-Count an.

## Fehlerbehandlung

Falls die Bridge nicht erreichbar ist, schlägt `withImapClient()` fehl, und der Fehler wird an den MCP-Client zurückgegeben.

---

## English

# Tool: list_folders

**File:** src/tools/mailbox.js

## Purpose

Lists all folders of the mailbox and shows their special-use flag and message count.

## Parameters

None – the tool has no input schema.

## Return

MCP text block with array:

```javascript
[
  {
    path: "INBOX",
    specialUse: "\\Inbox",
    messages: 145,
    unread: 5,
  },
  {
    path: "Drafts",
    specialUse: "\\Drafts",
    messages: 3,
    unread: 0,
  },
  {
    path: "[Gmail]/All Mail",
    specialUse: "\\All",
    messages: 2847,
    unread: 0,
  },
  {
    path: "Folders/MyFolder",
    specialUse: null,
    messages: 42,
    unread: 2,
  },
]
```

## Details

- **Folder paths** – The `path` is supplied by the Bridge and is unique. Paths sometimes contain `/` (e.g. `Folders/MyFolder`).
- **specialUse** – IMAP Special-Use flags like `\Inbox`, `\Sent`, `\Drafts`, `\Trash`, `\All`, etc. If not present: `null`.
- **messages** – Total number of messages in the folder (may be `null` if the Bridge does not provide it).
- **unread** – Number of unread messages (may be `null`).

## Implementation

```javascript
const folders = await client.list({ statusQuery: { messages: true, unseen: true } });
```

The `statusQuery` requests the message count and unread count.

## Error handling

If the Bridge is unreachable, `withImapClient()` fails and the error is returned to the MCP client.
