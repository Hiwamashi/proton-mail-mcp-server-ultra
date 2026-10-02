# Spec Delta

## MODIFIED Requirements

### Requirement: Special-use folder resolution
The server SHALL resolve special-use folders (`\Drafts`, `\Trash`, `\Sent`, ...) from the server's folder list and fall back to the names `Drafts` and `Trash` if none is marked. The resolution SHALL be cached per IMAP connection and SHALL be refreshed when a new connection is opened or when an operation on a resolved folder fails because the folder does not exist; in the latter case the operation SHALL be attempted once more with the refreshed folder if it is a read, and the error returned otherwise.

#### Scenario: Drafts folder lookup
- **WHEN** a draft is created
- **THEN** it is stored in the folder marked `\Drafts`, or in `Drafts` if no folder is marked

#### Scenario: Folder renamed while running
- **WHEN** the Trash folder is renamed in Proton Mail while the server runs and the connection is reopened
- **THEN** `delete_email` moves messages to the renamed folder without a server restart

## ADDED Requirements

### Requirement: Reported server version
The server SHALL report the version from `package.json` as its MCP server version.

#### Scenario: Client initializes
- **WHEN** a client connects to a server built from version 1.2.0
- **THEN** the initialize result reports version `1.2.0`
