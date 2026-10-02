**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Tool: delete_draft

**Datei:** src/tools/compose.js

## Zweck

Löscht einen Entwurf endgültig.

**Verfügbar in den Modi `drafts` und `full`.** Das ist kein „endgültiges Löschen“ im Sinne von `delete_email` im Papierkorb (nur in `full`): Entwürfe lassen sich in `drafts` löschen.

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

### Nur echte Entwürfe

Vor dem Löschen prüft das Tool über `assertIsDraft(flags, uid)` (`src/compose.js`), ob die Nachricht das Flag `\Draft` trägt. Eine Nachricht im Drafts-Ordner ohne dieses Flag (etwa eine mit `move_email` hineinverschobene Mail) ist kein Entwurf: Das Tool wirft `Message UID <uid> in Drafts is not a draft (it has no \Draft flag), so it is left untouched.` und löscht nichts. Das gilt in jedem Modus.

## Fehlerbehandlung

Falls Entwurf-UID nicht existiert: Fehler von der Bridge.

Falls die Nachricht kein Entwurf ist (Flag `\Draft` fehlt): Fehler wie oben, Nachricht bleibt unverändert.

---

## English

# Tool: delete_draft

**File:** src/tools/compose.js

## Purpose

Permanently deletes a draft.

**Available in `drafts` and `full` mode.** This is not the "permanent deletion" of `delete_email` from Trash (`full` only): drafts can be deleted in `drafts`.

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

### Real drafts only

Before deleting, the tool calls `assertIsDraft(flags, uid)` (`src/compose.js`) to check that the message carries the `\Draft` flag. A message in the Drafts folder without it (for example an email moved in with `move_email`) is not a draft: the tool throws `Message UID <uid> in Drafts is not a draft (it has no \Draft flag), so it is left untouched.` and deletes nothing. This applies in every mode.

## Error handling

If draft UID does not exist: error from the Bridge.

If the message is not a draft (`\Draft` flag missing): error as above, the message stays untouched.
