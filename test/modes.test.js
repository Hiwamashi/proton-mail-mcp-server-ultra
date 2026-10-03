import { test } from "node:test";
import assert from "node:assert/strict";
import { registerMailboxTools } from "../src/tools/mailbox.js";
import { registerComposeTools } from "../src/tools/compose.js";
import { registerLabelTools } from "../src/tools/labels.js";
import { defineTool } from "../src/tools/util.js";
import {
  toolAvailable,
  allowsMarkAsRead,
  allowsPermanentDelete,
  draftHint,
  PERMANENT_DELETE_REFUSAL,
  MARK_AS_READ_REFUSAL,
} from "../src/modes.js";

const READ_ONLY = ["list_folders", "list_emails", "search_emails", "read_email", "get_attachment", "get_thread", "list_drafts"];
const DRAFTS = [...READ_ONLY, "mark_email", "move_email", "delete_email", "create_draft", "update_draft", "delete_draft", "label_email", "create_folder"];
const FULL = [...DRAFTS, "send_email", "reply_to_email", "send_draft", "forward_email"];
const EXPECTED = { "read-only": READ_ONLY, drafts: DRAFTS, full: FULL };

function register(mode) {
  const tools = new Map();
  const server = { registerTool: (name, config, handler) => tools.set(name, { config, handler }) };
  registerMailboxTools(server, { mode });
  registerComposeTools(server, { mode });
  registerLabelTools(server, { mode });
  return tools;
}

for (const [mode, expected] of Object.entries(EXPECTED)) {
  test(`registered tools in ${mode} mode match the spec table`, () => {
    assert.deepEqual([...register(mode).keys()].sort(), [...expected].sort());
  });

  test(`no description in ${mode} mode mentions an unregistered tool`, () => {
    const tools = register(mode);
    for (const [name, { config }] of tools) {
      const texts = [config.description, ...Object.values(config.inputSchema || {}).map((f) => f.description)];
      for (const t of texts.filter(Boolean)) {
        for (const other of FULL.filter((n) => !tools.has(n))) {
          assert.ok(!new RegExp(`\\b${other}\\b`).test(t), `${name} mentions unregistered ${other}: ${t}`);
        }
      }
    }
  });
}

test("registered config does not leak the modes field", () => {
  for (const { config } of register("full").values()) assert.equal("modes" in config, false);
});

test("permanent deletion is allowed only in full mode", () => {
  assert.equal(allowsPermanentDelete("full"), true);
  assert.equal(allowsPermanentDelete("drafts"), false);
  assert.equal(allowsPermanentDelete("read-only"), false);
  assert.match(PERMANENT_DELETE_REFUSAL, /PROTON_MCP_MODE=full/);
  assert.match(PERMANENT_DELETE_REFUSAL, /empty the trash in Proton Mail/);
});

test("markAsRead is refused only in read-only mode", () => {
  assert.equal(allowsMarkAsRead("read-only"), false);
  assert.equal(allowsMarkAsRead("drafts"), true);
  assert.equal(allowsMarkAsRead("full"), true);
  assert.match(MARK_AS_READ_REFUSAL, /not available in `read-only` mode/);
});

test("read_email refuses markAsRead in read-only mode before touching the mailbox", async () => {
  const { handler } = register("read-only").get("read_email");
  const result = await handler({ uid: 1, folder: "INBOX", markAsRead: true });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /read-only/);
});

test("draft hint is mode-dependent", () => {
  assert.match(draftHint("full"), /send_draft/);
  assert.match(draftHint("full"), /update_draft/);
  assert.match(draftHint("drafts"), /update_draft/);
  assert.match(draftHint("drafts"), /reviews and sends the draft in Proton Mail/);
  assert.doesNotMatch(draftHint("drafts"), /send_draft/);
});

test("a tool without a modes list is a bug and does not fail open", () => {
  assert.throws(() => toolAvailable(undefined, "read-only"), /modes/);
  assert.throws(() => defineTool({ registerTool() {} }, "list_folders", { description: "x" }, async () => {}, "full"), /modes/);
  assert.equal(toolAvailable(["drafts"], "read-only"), false);
  assert.equal(toolAvailable(["drafts"], "drafts"), true);
});

test("list_emails states arrival order and points to search_emails for date order", () => {
  const { config } = register("read-only").get("list_emails");
  assert.match(config.description, /most recently added to a folder/);
  assert.match(config.description, /order follows arrival in the folder/);
  assert.match(config.description, /search_emails/);
});
