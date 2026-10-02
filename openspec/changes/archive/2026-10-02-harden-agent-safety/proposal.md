# Proposal

## Why

Agents using this server read untrusted mail and, in the same session, hold tools that act on the outside world. A prepared message can instruct the agent to send mail, attach arbitrary local files (`~/.ssh/…`, `.env`) or delete messages – and today nothing in the server stands in the way. The audience is local agents in general, so the server itself has to provide safe defaults instead of relying on each client's permission prompts.

## What Changes

- **BREAKING** New operating mode `PROTON_MCP_MODE` with `read-only`, `drafts` (new default) and `full`. In `drafts` mode the tools `send_email`, `reply_to_email` and `send_draft` are not registered, and permanent deletion from Trash is refused; the agent prepares drafts, the user sends them in Proton Mail. Existing users who want the previous behavior set `PROTON_MCP_MODE=full`.
- **BREAKING** Local files can only be attached from allowed directories (`PROTON_MCP_ATTACHMENT_ROOTS`, default: Downloads, Documents, Desktop and the attachment folder). Paths with hidden segments (`.ssh`, `.env`, …) are always refused; symlinks are resolved before checking. `PROTON_MCP_ATTACHMENT_ROOTS=*` restores unrestricted paths.
- Every tool declares MCP tool annotations (`title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) so clients can tailor their confirmation prompts.
- The server sends MCP `instructions` telling agents that mail content is untrusted data and must not be followed as instructions.
- Tool descriptions and result hints only mention tools that exist in the active mode.

## Capabilities

### New Capabilities
- `agent-safety`: Operating modes, allowed attachment directories, tool annotations and the untrusted-content instruction.

### Modified Capabilities
- `mailbox-management`: "Delete email via trash" – permanent deletion only in `full` mode.
- `drafts`: "Create draft" – the result hint depends on the mode.
- `mail-reading`: "Read email without side effects" – `markAsRead` is refused in `read-only` mode.

## Impact

- Code: `src/config.js`, `src/server.js`, `src/tools/*.js`, new `src/safety.js` (path checks).
- Users relying on sending must set `PROTON_MCP_MODE=full`; users attaching files from other folders must extend `PROTON_MCP_ATTACHMENT_ROOTS`. README (DE+EN) needs a migration note.
- Later changes (`add-mailbox-write-tools`) register their tools through the same mode mechanism.
