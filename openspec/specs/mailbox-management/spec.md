# mailbox-management Specification

## Purpose
Lets an agent organize single messages: move them between folders, change read and flag state, and delete them via the trash.

## Requirements

### Requirement: Move email
`move_email` SHALL move one message by UID from `sourceFolder` (default `INBOX`) to `destinationFolder` and return `success`, the old `uid`, `from`, `to` and the message's `newUid` in the destination (or `null` if the server does not report it). Several messages of one folder SHALL be movable at once with `uids` (see "Bulk operations").

#### Scenario: Archive a message
- **WHEN** `move_email` moves UID 42 from INBOX to Archive
- **THEN** the message is in Archive and the result contains its new UID there

#### Scenario: Message not found
- **WHEN** the UID does not exist in the source folder
- **THEN** an error says that no message with that UID exists in the folder and that UIDs are per folder

### Requirement: Mark email
`mark_email` SHALL set or remove a flag on one message: `read`/`unread` change `\Seen`, `flag`/`unflag` change `\Flagged` (starred in Proton). The result SHALL contain `success`, `uid` and `action`. A UID that does not exist in the folder SHALL fail with an error instead of reporting success. Several messages of one folder SHALL be markable at once with `uids` (see "Bulk operations").

#### Scenario: Star a message
- **WHEN** `mark_email` is called with `action: "flag"`
- **THEN** the message is starred in Proton Mail

#### Scenario: Unknown UID
- **WHEN** `mark_email` is called with a UID that does not exist in the folder
- **THEN** an error says that no message with that UID exists in the folder

### Requirement: Delete email via trash
`delete_email` SHALL move a message to the trash folder. If the given folder is the trash folder (case-insensitive), the message SHALL be deleted permanently in `full` mode; in `drafts` mode the call SHALL fail with an error explaining that permanent deletion requires `PROTON_MCP_MODE=full` and that the user can empty the trash in Proton Mail. The result SHALL state `movedTo` or `deletedPermanently: true`.

#### Scenario: Delete from inbox
- **WHEN** `delete_email` is called for a message in INBOX
- **THEN** the message is moved to Trash

#### Scenario: Delete from trash
- **WHEN** `delete_email` is called for a message in Trash and the mode is `full`
- **THEN** the message is removed permanently

#### Scenario: Delete from trash in drafts mode
- **WHEN** `delete_email` is called for a message in Trash and the mode is `drafts`
- **THEN** the message stays in Trash and the error explains that `full` mode is required

### Requirement: Bulk operations
`move_email`, `mark_email` and `delete_email` SHALL accept either `uid` or `uids` (1–500 UIDs of the same folder); giving both or neither SHALL fail with an error. Each UID SHALL be handled as described for the single-UID operation, in one IMAP command per tool call. With `uids` the result SHALL contain `processed` (UIDs that existed), `notFound` (UIDs that did not exist in the folder) and, for moves, `uidMap` (old → new UID where reported). A call where no UID exists SHALL fail with an error. With `uid` the result SHALL keep its previous fields.

#### Scenario: Archive newsletters
- **WHEN** `move_email` is called with 30 `uids` from INBOX to Archive
- **THEN** all 30 are moved in one call and the result lists them in `processed` with their new UIDs

#### Scenario: Some UIDs missing
- **WHEN** `mark_email` is called with `uids: [10, 11, 999]` and 999 does not exist
- **THEN** 10 and 11 are marked and 999 is listed in `notFound`

#### Scenario: Both uid and uids
- **WHEN** `delete_email` is called with `uid` and `uids`
- **THEN** an error says to use exactly one of them
