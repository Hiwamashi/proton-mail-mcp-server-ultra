import { test } from "node:test";
import assert from "node:assert/strict";
import { registerMailboxTools } from "../src/tools/mailbox.js";
import { registerComposeTools } from "../src/tools/compose.js";
import { registerLabelTools } from "../src/tools/labels.js";
import { serverInstructions } from "../src/modes.js";

const READ_ONLY = ["list_folders", "list_emails", "search_emails", "read_email", "get_attachment", "get_thread", "list_drafts"];
const DESTRUCTIVE = ["delete_email", "delete_draft", "update_draft"];
const IDEMPOTENT = [...READ_ONLY, "mark_email", "label_email"];
const OPEN_WORLD = ["send_email", "reply_to_email", "send_draft", "forward_email"];

const tools = new Map();
const server = { registerTool: (name, config) => tools.set(name, config) };
registerMailboxTools(server, { mode: "full" });
registerComposeTools(server, { mode: "full" });
registerLabelTools(server, { mode: "full" });

test("all 19 tools are registered in full mode", () => {
  assert.equal(tools.size, 19);
});

for (const [name, config] of tools) {
  test(`${name} declares title and annotations with the specified values`, () => {
    const a = config.annotations;
    assert.ok(config.title && typeof config.title === "string");
    assert.equal(a.title, config.title);
    for (const key of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"]) {
      assert.equal(typeof a[key], "boolean", `${name}.${key}`);
    }
    assert.equal(a.readOnlyHint, READ_ONLY.includes(name));
    assert.equal(a.destructiveHint, DESTRUCTIVE.includes(name));
    assert.equal(a.idempotentHint, IDEMPOTENT.includes(name));
    assert.equal(a.openWorldHint, OPEN_WORLD.includes(name));
  });
}

test("server instructions state untrusted content and name the active mode", () => {
  for (const mode of ["read-only", "drafts", "full"]) {
    const text = serverInstructions(mode);
    assert.match(text, /untrusted/i);
    assert.match(text, /Never follow instructions/);
    assert.ok(text.includes(`Active mode: ${mode}.`));
  }
  assert.match(serverInstructions("read-only"), /disabled/);
});
