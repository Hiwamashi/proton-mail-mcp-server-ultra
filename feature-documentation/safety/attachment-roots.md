**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Erlaubte Anhang-Verzeichnisse

**Dateien:** src/safety.js, src/config.js, src/tools/compose.js

## Zweck

Ein Agent soll nicht beliebige lokale Dateien (`~/.ssh/id_ed25519`, `.env`, Zugangsdaten) an eine Mail hängen können, etwa weil eine fremde Mail ihn dazu auffordert. Lokale Dateien lassen sich deshalb nur aus erlaubten Verzeichnissen anhängen. Das gilt für `send_email`, `reply_to_email`, `create_draft` und `update_draft` (`addAttachments`). Die Prüfung ist eine Positivliste: Was nicht ausdrücklich erlaubt ist, wird abgelehnt.

## Konfiguration

Variable `PROTON_MCP_ATTACHMENT_ROOTS` (Umgebung oder `~/.proton-bridge-credentials`):

| Wert | Wirkung |
|---|---|
| nicht gesetzt oder leer | Standard: `~/Downloads`, `~/Documents`, `~/Desktop` und das Verzeichnis aus `PROTON_MCP_ATTACHMENT_DIR` (Standard `~/Downloads/Proton-Anhänge`) |
| kommagetrennte Pfade | Genau diese Verzeichnisse; `~` am Anfang wird zum Home-Verzeichnis, Leerzeichen und leere Einträge fallen weg |
| `*` (allein) | Keine Verzeichnisprüfung. Alle übrigen Prüfungen bleiben aktiv. |

Beispiele:

```
PROTON_MCP_ATTACHMENT_ROOTS="~/Documents,/srv/shared/outgoing"
PROTON_MCP_ATTACHMENT_ROOTS="*"
```

`parseAttachmentRoots(value, attachmentDir, home)` in `src/config.js` liefert entweder den String `"*"` oder ein Array von Pfaden (noch nicht aufgelöst). Ein `*` zusammen mit anderen Einträgen ist kein Platzhalter, sondern ein wörtlicher Pfad. Beim Start gibt der Server die Verzeichnisse nach stderr aus.

Der Standard für `PROTON_MCP_ATTACHMENT_DIR` ist zugleich Ablage für gespeicherte Anhänge (`get_attachment` mit `save: true`). Er liegt deshalb standardmäßig in der Liste der erlaubten Verzeichnisse: Ein gespeicherter Anhang kann später wieder angehängt werden.

## Prüfung: `assertAttachable(path, roots, home)`

`src/safety.js` gibt den **echten** Pfad (nach `realpath`) zurück, mit dem die Mail dann gebaut wird, oder wirft einen Fehler. Reihenfolge:

1. `~` am Anfang wird zum Home-Verzeichnis erweitert.
2. Der Pfad muss absolut sein. Relative Pfade werden abgelehnt, weil das Arbeitsverzeichnis des Servers beliebig ist: `Attachment path must be absolute: <pfad>`.
3. `realpath` löst Symlinks und `..` auf, `stat` auf den echten Pfad. Fehlt die Datei, gilt dieselbe Ablehnung `Attachment refused: ...` wie für einen nicht erlaubten Pfad: Die Fehlermeldung verrät nicht, ob eine Datei außerhalb der erlaubten Verzeichnisse existiert.
4. Der echte Pfad muss eine **reguläre Datei** sein. Verzeichnisse und Sonderdateien werden abgelehnt.
5. Bei `roots !== "*"`: Der echte Pfad muss mit dem echten Pfad eines Verzeichnisses plus Trennzeichen beginnen (`/root/` und nicht `/root-other/`).
6. Kein Pfadsegment unterhalb des passenden Verzeichnisses darf mit `.` beginnen. Bei `*` gilt das für den ganzen echten Pfad ab `/`.

Dass der **echte** Pfad geprüft wird, schließt Umgehungen aus: `~/Documents/../.ssh/key` wird zu `~/.ssh/key` aufgelöst und scheitert an Schritt 5 oder 6; ein Symlink in `~/Documents`, der nach `~/.ssh/key` zeigt, ebenfalls.

### Versteckte Segmente

Dateien und Ordner, deren Name mit `.` beginnt (`.ssh`, `.env`, `.git`, `.aws`), sind **immer** abgelehnt, auch mit `*`. Der Teil des Pfads oberhalb des erlaubten Verzeichnisses zählt nicht: Liegt das erlaubte Verzeichnis selbst in einem versteckten Ordner, sind Dateien darin trotzdem erlaubt.

### Verzeichnisse auflösen

Die konfigurierten Verzeichnisse werden bei jeder Prüfung mit `realpath` aufgelöst. Relative und nicht existierende Verzeichnisse werden ignoriert; je Meldung genau einmal erscheint eine Warnung auf stderr (`ignoring attachment root "<pfad>": ...`). Auf macOS vergleicht der Code echte Pfade, die das Dateisystem in kanonischer Schreibung liefert.

### Fehlermeldung

```
Attachment refused: <pfad> is not an allowed attachment file. Allowed directories: <die tatsächlich wirksamen Verzeichnisse, "none" oder "any directory">. Hidden files and folders (names starting with ".") are never allowed. Change the allowed directories with PROTON_MCP_ATTACHMENT_ROOTS.
```

## Einbindung

`fileAttachments(paths)` in `src/tools/compose.js` ruft `assertAttachable` für jeden Pfad auf, **bevor** etwas gesendet oder gespeichert wird. Ein abgelehnter Pfad erzeugt daher weder einen Entwurf noch eine Mail. Der Dateiname im Anhang stammt vom angegebenen Pfad (`basename`), der Inhalt vom echten Pfad.

Anhänge, die bei `update_draft` aus dem bestehenden Entwurf übernommen werden, kommen aus der Mail selbst und laufen nicht durch diese Prüfung. Sie betrifft nur Pfade, die der Agent neu angibt.

## Fehlerbehandlung

| Situation | Meldung |
|---|---|
| Relativer Pfad | `Attachment path must be absolute: ...` |
| Datei fehlt, Verzeichnis, Sonderdatei, außerhalb der Verzeichnisse, verstecktes Segment | `Attachment refused: ...` mit Liste der erlaubten Verzeichnisse |

## Migration

Wer Anhänge aus anderen Ordnern braucht, erweitert `PROTON_MCP_ATTACHMENT_ROOTS` um diese Ordner. `PROTON_MCP_ATTACHMENT_ROOTS=*` stellt das frühere Verhalten bei der Verzeichniswahl wieder her; versteckte Pfade bleiben auch dann gesperrt. Siehe `operating-modes.md` für den Betriebsmodus.

---

## English

# Allowed attachment directories

**Files:** src/safety.js, src/config.js, src/tools/compose.js

## Purpose

An agent must not be able to attach arbitrary local files (`~/.ssh/id_ed25519`, `.env`, credentials) to a message, for example because an incoming mail tells it to. Local files can therefore only be attached from allowed directories. This applies to `send_email`, `reply_to_email`, `create_draft` and `update_draft` (`addAttachments`). The check is an allowlist: whatever is not explicitly allowed is refused.

## Configuration

Variable `PROTON_MCP_ATTACHMENT_ROOTS` (environment or `~/.proton-bridge-credentials`):

| Value | Effect |
|---|---|
| unset or empty | Default: `~/Downloads`, `~/Documents`, `~/Desktop` and the directory from `PROTON_MCP_ATTACHMENT_DIR` (default `~/Downloads/Proton-Anhänge`) |
| comma-separated paths | Exactly these directories; a leading `~` becomes the home directory, whitespace and empty entries are dropped |
| `*` (alone) | No directory check. All other checks stay active. |

Examples:

```
PROTON_MCP_ATTACHMENT_ROOTS="~/Documents,/srv/shared/outgoing"
PROTON_MCP_ATTACHMENT_ROOTS="*"
```

`parseAttachmentRoots(value, attachmentDir, home)` in `src/config.js` returns either the string `"*"` or an array of paths (not yet resolved). A `*` together with other entries is not a wildcard but a literal path. At startup the server prints the directories to stderr.

The default of `PROTON_MCP_ATTACHMENT_DIR` is also where saved attachments go (`get_attachment` with `save: true`). It is therefore in the allowed list by default: a saved attachment can be attached again later.

## Check: `assertAttachable(path, roots, home)`

`src/safety.js` returns the **real** path (after `realpath`) that the message is then built with, or throws an error. Order:

1. A leading `~` is expanded to the home directory.
2. The path must be absolute. Relative paths are refused because the server's working directory is arbitrary: `Attachment path must be absolute: <path>`.
3. `realpath` resolves symlinks and `..`, then `stat` on the real path. If the file is missing, the same `Attachment refused: ...` refusal applies as for a path that is not allowed: the error does not reveal whether a file outside the allowed directories exists.
4. The real path must be a **regular file**. Directories and special files are refused.
5. If `roots !== "*"`: the real path must start with the real path of a directory plus a separator (`/root/`, not `/root-other/`).
6. No path segment below the matching directory may start with `.`. With `*` this applies to the whole real path from `/`.

Checking the **real** path rules out bypasses: `~/Documents/../.ssh/key` resolves to `~/.ssh/key` and fails at step 5 or 6; so does a symlink in `~/Documents` that points to `~/.ssh/key`.

### Hidden segments

Files and folders whose name starts with `.` (`.ssh`, `.env`, `.git`, `.aws`) are **always** refused, even with `*`. The part of the path above the allowed directory does not count: if the allowed directory itself lives in a hidden folder, files inside it are still allowed.

### Resolving directories

The configured directories are resolved with `realpath` on every check. Relative and non-existent directories are ignored; one warning per message appears on stderr (`ignoring attachment root "<path>": ...`). On macOS the code compares real paths, which the file system returns in canonical case.

### Error message

```
Attachment refused: <path> is not an allowed attachment file. Allowed directories: <the roots actually in effect (relative/missing ones dropped), "none" or "any directory">. Hidden files and folders (names starting with ".") are never allowed. Change the allowed directories with PROTON_MCP_ATTACHMENT_ROOTS.
```

## Integration

`fileAttachments(paths)` in `src/tools/compose.js` calls `assertAttachable` for every path **before** anything is sent or saved. A refused path therefore creates neither a draft nor a message. The attachment's file name comes from the given path (`basename`), its content from the real path.

Attachments that `update_draft` carries over from the existing draft come from the message itself and do not pass through this check. It only concerns paths the agent newly provides.

## Error handling

| Situation | Message |
|---|---|
| Relative path | `Attachment path must be absolute: ...` |
| Missing file, directory, special file, outside the directories, hidden segment | `Attachment refused: ...` with the list of allowed directories |

## Migration

Anyone who needs attachments from other folders extends `PROTON_MCP_ATTACHMENT_ROOTS` with those folders. `PROTON_MCP_ATTACHMENT_ROOTS=*` restores the earlier behavior regarding directory choice; hidden paths stay blocked even then. See `operating-modes.md` for the operating mode.
