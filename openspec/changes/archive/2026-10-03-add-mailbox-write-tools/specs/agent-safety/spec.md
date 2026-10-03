# Spec Delta

## MODIFIED Requirements

### Requirement: Operating modes
The server SHALL support `PROTON_MCP_MODE` with the values `read-only`, `drafts` and `full`; the default SHALL be `drafts`. Tools not allowed in the active mode SHALL NOT be registered, so agents cannot see or call them:
- `read-only`: `list_folders`, `list_emails`, `search_emails`, `read_email`, `get_thread`, `get_attachment`, `list_drafts`.
- `drafts`: everything in `read-only` plus `mark_email`, `move_email`, `delete_email`, `label_email`, `create_folder`, `create_draft`, `update_draft`, `delete_draft`.
- `full`: all tools, including `send_email`, `reply_to_email`, `forward_email` and `send_draft`.
An unknown value SHALL stop the server at startup with an error listing the valid values. The active mode SHALL be written to stderr at startup.

#### Scenario: Default mode
- **WHEN** the server starts without `PROTON_MCP_MODE`
- **THEN** the tool list contains `create_draft` but not `send_email`, `reply_to_email`, `forward_email` or `send_draft`

#### Scenario: Full mode
- **WHEN** `PROTON_MCP_MODE=full`
- **THEN** all tools are listed

#### Scenario: Read-only mode
- **WHEN** `PROTON_MCP_MODE=read-only`
- **THEN** no tool that changes the mailbox is listed

#### Scenario: Invalid mode
- **WHEN** `PROTON_MCP_MODE=send`
- **THEN** the server exits with an error naming `read-only`, `drafts` and `full`

