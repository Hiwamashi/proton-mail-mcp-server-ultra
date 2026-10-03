**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Tool: create_folder

**Dateien:** src/tools/labels.js (`createFolder`), src/connections.js (`resetFolderCache`)

## Zweck

Legt einen Ordner (`Folders/<name>`) oder ein Label (`Labels/<name>`) an. Verfügbar in den Modi `drafts` und `full`. Umbenennen und Löschen bietet der Server bewusst nicht an.

## Parameter

| Parameter | Typ | Beschreibung |
|---|---|---|
| `name` | string | Name; ein passendes Präfix `Folders/` bzw. `Labels/` darf dabei sein |
| `type` | `"folder"` \| `"label"` | Ordner oder Label |

## Ablauf

1. Den Namen bereinigen: ein passendes Präfix entfernen, Leerraum an den Segmenten entfernen.
   - Ordner dürfen mit `/` verschachtelt sein (`Kunden/2026` → `Folders/Kunden/2026`).
   - Labels dürfen kein `/` enthalten.
   - Leere Segmente (`a//b`) werden abgelehnt.
2. Per `LIST` prüfen, ob der Pfad schon existiert (ohne Rücksicht auf Groß-/Kleinschreibung).
3. `mailboxCreate(path)` aufrufen. Danach wird der Cache der Sonderordner geleert (`resetFolderCache()`).

Im Spike vom 2026-10-03 erschien ein neu angelegtes Label sofort in `LIST`. Im Smoke-Test ließ es sich direkt mit `label_email` und `list_emails` nutzen.

## Rückgabe

```javascript
{ success: true, path: "Labels/Projekt X", type: "label" }
```

## Fehlerbehandlung

- Pfad existiert schon: `"Folders/Projekte" already exists.`
- Label mit `/`: `Label names cannot contain "/"; nested names are only possible for folders.`
- Leerer Name oder leeres Segment: `Invalid folder name "…".`
- Der Schreibvorgang wird nach einem Verbindungsfehler nicht wiederholt.

## Tests

`test/labels.test.js` deckt ab: Label, Ordner und verschachtelter Ordner erscheinen in der Ordnerliste; vorhandener Pfad, verschachteltes Label und leere Segmente schlagen fehl, ohne zu schreiben.

---

## English

# Tool: create_folder

**Files:** src/tools/labels.js (`createFolder`), src/connections.js (`resetFolderCache`)

## Purpose

Creates a folder (`Folders/<name>`) or a label (`Labels/<name>`). Available in `drafts` and `full` mode. The server deliberately offers no renaming and no deletion.

## Parameters

| Parameter | Type | Description |
|---|---|---|
| `name` | string | Name; a matching prefix `Folders/` or `Labels/` may be included |
| `type` | `"folder"` \| `"label"` | Folder or label |

## Flow

1. Clean up the name: remove a matching prefix and the whitespace around segments.
   - Folders may be nested with `/` (`Kunden/2026` → `Folders/Kunden/2026`).
   - Labels must not contain `/`.
   - Empty segments (`a//b`) are rejected.
2. Check via `LIST` whether the path already exists (case-insensitive).
3. Call `mailboxCreate(path)`. Afterwards the special-folder cache is cleared (`resetFolderCache()`).

In the spike of 2026-10-03 a newly created label appeared in `LIST` right away. In the smoke test it could be used directly with `label_email` and `list_emails`.

## Return

```javascript
{ success: true, path: "Labels/Projekt X", type: "label" }
```

## Error handling

- Path already exists: `"Folders/Projekte" already exists.`
- Label with `/`: `Label names cannot contain "/"; nested names are only possible for folders.`
- Empty name or empty segment: `Invalid folder name "…".`
- The write is not retried after a connection error.

## Tests

`test/labels.test.js` covers: label, folder and nested folder appear in the folder list; an existing path, a nested label and empty segments fail without writing.
