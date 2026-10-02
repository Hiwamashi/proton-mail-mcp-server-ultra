# mailbox-management Specification

## Purpose
Lets an agent organize single messages: move them between folders, change read and flag state, and delete them via the trash.

## Requirements

### Requirement: Move email
`move_email` SHALL move one message by UID from `sourceFolder` (default `INBOX`) to `destinationFolder` and return `success`, the old `uid`, `from`, `to` and the message's `newUid` in the destination (or `null` if the server does not report it).

#### Scenario: Archive a message
- **WHEN** `move_email` moves UID 42 from INBOX to Archive
- **THEN** the message is in Archive and the result contains its new UID there

#### Scenario: Message not found
- **WHEN** the UID does not exist in the source folder
- **THEN** an error says the message could not be moved and asks whether it exists there

### Requirement: Mark email
`mark_email` SHALL set or remove a flag on one message: `read`/`unread` change `\Seen`, `flag`/`unflag` change `\Flagged` (starred in Proton). The result SHALL contain `success`, `uid` and `action`.

#### Scenario: Star a message
- **WHEN** `mark_email` is called with `action: "flag"`
- **THEN** the message is starred in Proton Mail

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
