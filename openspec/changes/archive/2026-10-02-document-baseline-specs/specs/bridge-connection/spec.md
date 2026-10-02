# Spec Delta

## Purpose

Defines how the server is configured and how it talks to the locally running Proton Mail Bridge, including which operations may be repeated after a connection failure so that no message is ever written or sent twice.

## ADDED Requirements

### Requirement: Credentials from environment or credentials file
The server SHALL read the Bridge username and password from the environment variables `PROTON_BRIDGE_USERNAME` and `PROTON_BRIDGE_PASSWORD` or, if unset, from `KEY=VALUE` lines in `~/.proton-bridge-credentials`. Environment variables SHALL take precedence over the file. Values MAY be wrapped in single or double quotes; blank lines and lines starting with `#` SHALL be ignored.

#### Scenario: Environment wins over file
- **WHEN** both the environment and the credentials file define `PROTON_BRIDGE_USERNAME`
- **THEN** the value from the environment is used

#### Scenario: Missing credentials
- **WHEN** neither source provides username and password
- **THEN** the server prints setup instructions to stderr and exits with code 1 before accepting MCP requests

### Requirement: Configurable Bridge endpoint and identity
The server SHALL support the optional settings `PROTON_BRIDGE_HOST` (default `127.0.0.1`), `PROTON_BRIDGE_IMAP_PORT` (default `1143`), `PROTON_BRIDGE_SMTP_PORT` (default `1025`), `PROTON_BRIDGE_SMTP_SECURE` (default `false`, STARTTLS required; `true` = implicit TLS), `PROTON_BRIDGE_FROM` (default: username), `PROTON_BRIDGE_FROM_NAME`, `PROTON_BRIDGE_ALIASES` (comma-separated own addresses), `PROTON_BRIDGE_IDLE_TIMEOUT_MS` (default `300000`) and `PROTON_MCP_ATTACHMENT_DIR` (default `~/Downloads/Proton-Anhänge`). The Bridge's self-signed certificate SHALL be accepted.

#### Scenario: Sender with display name
- **WHEN** `PROTON_BRIDGE_FROM_NAME` is set
- **THEN** outgoing messages and drafts use that name together with the configured from address

#### Scenario: Own addresses
- **WHEN** `PROTON_BRIDGE_ALIASES` lists additional addresses
- **THEN** the username, the from address and all aliases are treated as the user's own addresses (case-insensitive)

### Requirement: Reused IMAP connection with idle timeout
The server SHALL reuse one IMAP connection across tool calls and SHALL close it after `PROTON_BRIDGE_IDLE_TIMEOUT_MS` without use. A value of `0` or less SHALL keep the connection open. Concurrent calls that find no connection SHALL share a single connection attempt. On SIGINT, SIGTERM or when stdin closes, the server SHALL log out and exit.

#### Scenario: Consecutive calls
- **WHEN** two tool calls run within the idle timeout
- **THEN** both use the same IMAP connection

#### Scenario: Idle connection
- **WHEN** no tool call happens for longer than the idle timeout
- **THEN** the connection is closed and the next call opens a new one

### Requirement: Retry only idempotent IMAP operations
When an IMAP operation fails with a connection error (closed or destroyed socket, timeout, `ECONNRESET`, `EPIPE`, "not connected"), the server SHALL discard the connection. Read operations and flag changes SHALL be retried exactly once on a new connection. Operations that append, move or delete messages SHALL NOT be retried; the error SHALL be returned. Non-connection errors SHALL be returned without retry and the connection kept.

#### Scenario: Stale connection on read
- **WHEN** `read_email` fails because the Bridge dropped the connection
- **THEN** the server reconnects once and returns the result of the second attempt

#### Scenario: Connection lost during a write
- **WHEN** `move_email` fails with a connection error
- **THEN** the error is returned and the move is not attempted again

### Requirement: Sends are never retried
Each send SHALL open a new SMTP connection to the Bridge and close it afterwards. A failed send SHALL NOT be retried, because the server cannot tell whether the message was already accepted.

#### Scenario: SMTP error
- **WHEN** the SMTP connection breaks while sending
- **THEN** the tool returns an error and does not send again

### Requirement: Errors are returned as tool results
Any error thrown while handling a tool call SHALL be returned as a tool result with `isError: true` and a text message, instead of failing the MCP request. Not-found errors SHALL carry an explanatory message (UIDs are per folder).

#### Scenario: Unknown UID
- **WHEN** a tool is called with a UID that does not exist in the given folder
- **THEN** the result has `isError: true` and says that no message with that UID exists in that folder and that UIDs are per folder

### Requirement: Special-use folder resolution
The server SHALL resolve special-use folders (`\Drafts`, `\Trash`, `\Sent`, ...) from the server's folder list and fall back to the names `Drafts` and `Trash` if none is marked. The resolution SHALL be cached for the lifetime of the process.

#### Scenario: Drafts folder lookup
- **WHEN** a draft is created
- **THEN** it is stored in the folder marked `\Drafts`, or in `Drafts` if no folder is marked
