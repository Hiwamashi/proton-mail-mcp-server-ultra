**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Tool: list_drafts

**Datei:** src/tools/compose.js

## Zweck

Zählt alle Entwürfe im Entwürfe-Ordner auf, neuste zuerst.

## Parameter

| Parameter | Typ | Default | Beschreibung |
|---|---|---|---|
| `limit` | number | `20` | Anzahl der Entwürfe (max. 100) |

## Rückgabe

MCP-Text-Block:

```javascript
{
  folder: "Drafts",
  total: 5,
  drafts: [
    {
      uid: 105,
      date: "2024-01-15T14:30:00.000Z",
      from: "du@proton.me",
      to: "alice@example.com",
      subject: "Meeting tomorrow",
      unread: false,
      flagged: false,
      hasAttachments: false,
      size: 1245,
    },
    // ... mehr Entwürfe ...
  ]
}
```

## Besonderheiten

- **Neuste zuerst:** Nach Datum sortiert, neuste oben
- **Summaries:** Wie `list_emails`, aber für Entwürfe
- **Entwürfe sind lokal:** Sie sind nicht versendet und daher noch im Drafts-Ordner

## Fehlerbehandlung

Falls der Drafts-Ordner leer ist: `total: 0, drafts: []`.

---

## English

# Tool: list_drafts

**File:** src/tools/compose.js

## Purpose

Lists all drafts in the Drafts folder, newest first.

## Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | number | `20` | Number of drafts (max 100) |

## Return

MCP text block:

```javascript
{
  folder: "Drafts",
  total: 5,
  drafts: [
    {
      uid: 105,
      date: "2024-01-15T14:30:00.000Z",
      from: "you@proton.me",
      to: "alice@example.com",
      subject: "Meeting tomorrow",
      unread: false,
      flagged: false,
      hasAttachments: false,
      size: 1245,
    },
    // ... more drafts ...
  ]
}
```

## Details

- **Newest first:** Sorted by date, newest on top
- **Summaries:** Like `list_emails`, but for drafts
- **Drafts are local:** They are not sent and remain in the Drafts folder

## Error handling

If Drafts folder is empty: `total: 0, drafts: []`.
