**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# IMAP-Verbindung: Wiederverwendung und Verwaltung

**Datei:** src/connections.js

## Zweck

Das Modul verwaltet eine einzige IMAP-Verbindung, die über mehrere Tool-Aufrufe hinweg wiederverwendet wird. Es behandelt Verbindungsfehler, Idle-Timeout und das Sperren von Ordnern für sichere Schreibvorgänge.

## Verbindungs-Wiederverwendung

Jeder Tool-Aufruf nutzt `withImapClient()` oder `withMailbox()`, um mit der Bridge zu kommunizieren:

```javascript
// Einfacher Read-Zugriff
const result = await withImapClient(async (client) => {
  const folders = await client.list();
  return folders;
});

// Mit Mailbox-Lock (für Schreibvorgänge)
const result = await withMailbox("INBOX", async (client) => {
  await client.messageDelete("123", { uid: true });
});
```

Die Verbindung wird beim ersten Aufruf hergestellt und bleibt bestehen. Ein Timer schließt sie nach `CONFIG.imapIdleTimeoutMs` (Standard: 5 min) Inaktivität.

## Idle-Timeout

Nach einem erfolgreichen Vorgang setzt `scheduleImapDisconnect()` einen Timer. Falls die Verbindung nicht verwendet wird, wird sie nach dem Timeout geschlossen.

- **Standard:** 5 Minuten (300000 ms)
- **Umgebungsvariable:** `PROTON_BRIDGE_IDLE_TIMEOUT_MS`
- **Deaktiviert:** Falls `PROTON_BRIDGE_IDLE_TIMEOUT_MS ≤ 0`

Der Timer wird mit `unref()` gekennzeichnet, sodass er das Programm nicht am Beenden hindert.

## Retry-Logik für Lesevorgänge

Falls eine Verbindung während eines Vorgangs verloren geht (z. B. Bridge neu gestartet), wird automatisch eine neue Verbindung hergestellt und der Vorgang wiederholt – **aber nur bei idempotenten Operationen**.

### Fehler, die zu Retry führen

Pattern in Fehlermeldung:
- `not connected`
- `connection.*closed` oder `connection.*destroyed`
- `socket.*closed` oder `socket.*destroyed`
- `timed out`
- `ECONNRESET` oder `EPIPE`
- `User is authenticated but not connected`

### Keine Retry bei Schreibvorgängen

Für `append()`, `delete()`, `move()` wird kein automatischer Retry durchgeführt, um doppelte Ausführung zu vermeiden. Der Aufrufer übergibt `{ idempotent: false }`:

```javascript
// Kein Retry nach Fehler
await withImapClient(operation, { idempotent: false });
```

## Mailbox-Locks

`withMailbox()` wählt einen Ordner aus und sperrt ihn für die Dauer des Vorgangs:

```javascript
const result = await withMailbox("INBOX", async (client) => {
  const lock = await client.getMailboxLock("INBOX");
  // … Arbeit …
  lock.release();  // automatisch nach der Funktion
});
```

Das Lock verhindert Race Conditions zwischen IMAP-Befehlen und ist notwendig bei gleichzeitigen Zugriffen auf denselben Ordner.

## Spezial-Ordner-Cache

Die Funktion `getSpecialFolder()` cacht die Zuordnung von Sonderfunktionen (`\Drafts`, `\Trash`, `\Sent`, etc.) zu ihren tatsächlichen Pfaden:

```javascript
const trash = await getSpecialFolder(client, "\\Trash", "Trash");
// Falls "\\Trash" nicht gefunden, fallback zu "Trash"
```

Der Cache wird einmalig gefüllt und bleibt für die Lebensdauer des Prozesses bestehen.

## Fehlerbehandlung

### `fetchParsed()`

Liest eine Mail mit `BODY.PEEK` (setzt kein `\Seen`-Flag):

```javascript
const { parsed, flags, source } = await fetchParsed(client, uid, folder);
```

Wirft `NotFoundError`, falls die Mail nicht existiert:

```
No message with UID <uid> in folder "<folder>".
UIDs are per folder – check the folder name.
```

### `NotFoundError`

Eine spezielle Fehlerklasse für fehlende Mails. Das MCP-Framework gibt diese lesbar an den Client zurück.

## BODY.PEEK

Der Server ruft `client.fetchOne(uid, { source: true })` auf, was intern `BODY.PEEK` nutzt. Dies liest den Body, ohne das `\Seen`-Flag zu setzen. Der Agent kann damit Mails „vorschauen", ohne sie als gelesen zu markieren – es sei denn, er setzt `markAsRead: true` in `read_email`.

## SMTP-Verbindung

Siehe `sendMail()` in smtp-send.md – SMTP nutzt eine separate, für jeden Versand neue Verbindung.

---

## English

# IMAP Connection: Reuse and Management

**File:** src/connections.js

## Purpose

The module manages a single IMAP connection that is reused across multiple tool calls. It handles connection errors, idle timeout, and mailbox locking for safe write operations.

## Connection reuse

Each tool call uses `withImapClient()` or `withMailbox()` to communicate with the Bridge:

```javascript
// Simple read access
const result = await withImapClient(async (client) => {
  const folders = await client.list();
  return folders;
});

// With mailbox lock (for write operations)
const result = await withMailbox("INBOX", async (client) => {
  await client.messageDelete("123", { uid: true });
});
```

The connection is established on the first call and remains open. A timer closes it after `CONFIG.imapIdleTimeoutMs` (default: 5 min) of inactivity.

## Idle timeout

After a successful operation, `scheduleImapDisconnect()` sets a timer. If the connection is not used, it closes after the timeout.

- **Default:** 5 minutes (300000 ms)
- **Environment variable:** `PROTON_BRIDGE_IDLE_TIMEOUT_MS`
- **Disabled:** If `PROTON_BRIDGE_IDLE_TIMEOUT_MS ≤ 0`

The timer is marked with `unref()` so it does not prevent the process from exiting.

## Retry logic for read operations

If a connection is lost during an operation (e.g. Bridge restarted), a new connection is automatically established and the operation is retried – **but only for idempotent operations**.

### Errors that trigger retry

Pattern in error message:
- `not connected`
- `connection.*closed` or `connection.*destroyed`
- `socket.*closed` or `socket.*destroyed`
- `timed out`
- `ECONNRESET` or `EPIPE`
- `User is authenticated but not connected`

### No retry for write operations

For `append()`, `delete()`, `move()` no automatic retry is performed to prevent double execution. The caller passes `{ idempotent: false }`:

```javascript
// No retry on error
await withImapClient(operation, { idempotent: false });
```

## Mailbox locks

`withMailbox()` selects a folder and locks it for the duration of the operation:

```javascript
const result = await withMailbox("INBOX", async (client) => {
  const lock = await client.getMailboxLock("INBOX");
  // … work …
  lock.release();  // automatically released after the function
});
```

The lock prevents race conditions between IMAP commands and is necessary for concurrent access to the same folder.

## Special folder cache

The function `getSpecialFolder()` caches the mapping of special-use flags (`\Drafts`, `\Trash`, `\Sent`, etc.) to their actual paths:

```javascript
const trash = await getSpecialFolder(client, "\\Trash", "Trash");
// If "\\Trash" is not found, fallback to "Trash"
```

The cache is filled once and persists for the lifetime of the process.

## Error handling

### `fetchParsed()`

Reads a message with `BODY.PEEK` (does not set the `\Seen` flag):

```javascript
const { parsed, flags, source } = await fetchParsed(client, uid, folder);
```

Throws `NotFoundError` if the message does not exist:

```
No message with UID <uid> in folder "<folder>".
UIDs are per folder – check the folder name.
```

### `NotFoundError`

A special error class for missing messages. The MCP framework returns this readably to the client.

## BODY.PEEK

The server calls `client.fetchOne(uid, { source: true })`, which internally uses `BODY.PEEK`. This reads the body without setting the `\Seen` flag. The agent can preview messages without marking them as read – unless it sets `markAsRead: true` in `read_email`.

## SMTP connection

See `sendMail()` in smtp-send.md – SMTP uses a separate, newly created connection for each send.
