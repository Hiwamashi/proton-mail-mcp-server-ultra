# Spec Delta

## MODIFIED Requirements

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
