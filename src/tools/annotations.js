// Human-readable titles and MCP tool annotations, so clients can tailor confirmation prompts.
// readOnlyHint: does not change the mailbox. destructiveHint: deletes or overwrites data.
// idempotentHint: repeating the call with the same arguments has no further effect.
// openWorldHint: reaches recipients outside the mailbox (sends mail).
const meta = (title, { readOnly = false, destructive = false, idempotent = readOnly, openWorld = false } = {}) => ({
  title,
  annotations: {
    title,
    readOnlyHint: readOnly,
    destructiveHint: destructive,
    idempotentHint: idempotent,
    openWorldHint: openWorld,
  },
});

export const TOOL_META = {
  list_folders: meta("List folders", { readOnly: true }),
  list_emails: meta("List emails", { readOnly: true }),
  search_emails: meta("Search emails", { readOnly: true }),
  read_email: meta("Read email", { readOnly: true }),
  get_attachment: meta("Read attachment", { readOnly: true }),
  list_drafts: meta("List drafts", { readOnly: true }),
  mark_email: meta("Mark email", { idempotent: true }),
  move_email: meta("Move email"),
  delete_email: meta("Delete email", { destructive: true }),
  create_draft: meta("Create draft"),
  update_draft: meta("Update draft", { destructive: true }),
  delete_draft: meta("Delete draft", { destructive: true }),
  send_email: meta("Send email", { openWorld: true }),
  reply_to_email: meta("Reply to email", { openWorld: true }),
  send_draft: meta("Send draft", { openWorld: true }),
};
