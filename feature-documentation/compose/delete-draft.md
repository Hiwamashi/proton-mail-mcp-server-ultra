**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Tool: delete_draft

**Datei:** src/tools/compose.js

## Zweck

Löscht einen Entwurf endgültig.

## Parameter

| Parameter | Typ | Beschreibung |
|---|---|---|
| `uid` | number | UID des Entwurfs (von `list_drafts`) |

## Rückgabe

MCP-Text-Block:

```javascript
{
  success: true,
  deletedUid: 105,
  subject: "Betreff des gelöschten Entwurfs",
}
```

## Besonderheiten

Der Entwurf wird sofort aus den Entwürfen entfernt. Ein Recovery ist nicht möglich.

## Fehlerbehandlung

Falls Entwurf-UID nicht existiert: Fehler von der Bridge.

---

## English

# Tool: delete_draft

**File:** src/tools/compose.js

## Purpose

Permanently deletes a draft.

## Parameters

| Parameter | Type | Description |
|---|---|---|
| `uid` | number | UID of the draft (from `list_drafts`) |

## Return

MCP text block:

```javascript
{
  success: true,
  deletedUid: 105,
  subject: "Subject of deleted draft",
}
```

## Details

The draft is immediately removed from drafts. Recovery is not possible.

## Error handling

If draft UID does not exist: error from the Bridge.
