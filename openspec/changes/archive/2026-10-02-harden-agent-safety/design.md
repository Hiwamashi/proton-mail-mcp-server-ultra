# Design

## Context

Tools are registered unconditionally in `src/tools/mailbox.js` and `src/tools/compose.js` via `defineTool`. Attachments are checked only for existence (`fileAttachments` in `src/tools/compose.js`). `McpServer` is created in `src/server.js` without `instructions`. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- One place that decides per tool whether it exists in the active mode.
- A path check that cannot be bypassed by `..`, `~`, symlinks or hidden folders.
- Annotations declared next to each tool definition.

**Non-Goals:**
- Detecting prompt injection in mail content (not reliably possible; the instruction text and the mode are the mitigation).
- Per-recipient allowlists or rate limits for sending.
- Asking the user for confirmation from the server (MCP elicitation) – can follow later once clients support it widely.

## Decisions

### Mode as a property of each tool definition
`defineTool(server, name, config, handler)` gets a `modes` field in `config` (e.g. `modes: ["drafts", "full"]`) and skips registration when `CONFIG.mode` is not included. Alternative: separate registration lists per mode in `server.js` – rejected because the list would drift from the tool definitions.

Mode-dependent behavior inside a tool (permanent delete, `markAsRead`, draft hint) reads `CONFIG.mode` directly; there are only three such places.

### Mode default `drafts`
Chosen by the user: safe default, sending is an explicit opt-in. `read-only` excludes `mark_email` too, so the mode is a strict "nothing changes" guarantee for audits and shared machines.

### Path check in `src/safety.js`
`assertAttachable(path)`:
1. Require an absolute path (after `~` expansion); relative paths are refused because the server's working directory is arbitrary.
2. `fs.realpath` to resolve symlinks and `..`.
3. `fs.stat` → must be a regular file.
4. If roots ≠ `*`: the real path must start with a root's real path plus separator.
5. Refuse if any path segment of the real path (below the matching root, or below `/` when roots = `*`) starts with `.`.

Roots are resolved with `realpath` once at startup; non-existent roots are ignored with a warning on stderr. Alternative: denylist of known secret paths – rejected, an allowlist fails closed.

### Annotations
A central table `TOOL_META` in `src/tools/annotations.js` maps each tool name to its `title` and annotations; `defineTool` merges the entry into the `registerTool` config, and a tool without an entry throws at registration. Alternative: annotations inside each tool's `config` – rejected because the full set of hints is easier to review and test in one table, and a missing entry fails loudly instead of silently shipping a tool without hints. A test asserts every registered tool has `title`, `readOnlyHint` and `openWorldHint` set.

### Instructions
`new McpServer({ name, version }, { instructions })` with a short English text built from the active mode.

## Risks / Trade-offs

- [Existing users lose send tools after update] → Startup line on stderr names the mode; README migration note at the top of the changelog section; error message of a missing tool is the client's, so the README must be clear.
- [Attachments from other folders break] → Error message lists the allowed roots and the variable to change.
- [Case-insensitive file systems (macOS) and root prefix checks] → Compare real paths, which macOS returns in canonical case for existing files.
- [Clients ignore annotations] → Annotations are hints only; the modes are the actual enforcement.

## Migration Plan

1. Release with a "Breaking changes" note in README (DE+EN): set `PROTON_MCP_MODE=full` to keep sending; extend `PROTON_MCP_ATTACHMENT_ROOTS` if needed.
2. Rollback: set `PROTON_MCP_MODE=full` and `PROTON_MCP_ATTACHMENT_ROOTS=*`; no data migration involved.
