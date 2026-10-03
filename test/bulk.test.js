import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveUids, moveMessages, markMessages, deleteMessages } from "../src/tools/mailbox.js";
import { registerMailboxTools } from "../src/tools/mailbox.js";
import { fakeMailbox } from "./helpers/fake-mailbox.js";

function mailbox() {
  const client = fakeMailbox({
    INBOX: { specialUse: "\\Inbox", messages: [10, 11, 12].map((uid) => ({ uid, messageId: `<m${uid}@x>`, flags: [] })) },
    Archive: { specialUse: "\\Archive", messages: [{ uid: 100 }] },
    Trash: { specialUse: "\\Trash", messages: [{ uid: 5 }, { uid: 6 }] },
  });
  return client;
}

async function inFolder(client, folder) {
  await client.getMailboxLock(folder);
  return client;
}

test("exactly one of uid and uids", () => {
  assert.throws(() => resolveUids({ uid: 1, uids: [2] }), /Use exactly one of uid or uids/);
  assert.throws(() => resolveUids({}), /Use exactly one of uid or uids/);
  assert.deepEqual(resolveUids({ uid: 4 }), { list: [4], bulk: false });
  assert.deepEqual(resolveUids({ uids: [4, 4, 5] }), { list: [4, 5], bulk: true });
});

test("handlers refuse both uid and uids before touching the mailbox", async () => {
  const tools = new Map();
  registerMailboxTools({ registerTool: (name, config, handler) => tools.set(name, { config, handler }) }, { mode: "drafts" });
  for (const [name, args] of [
    ["move_email", { uid: 1, uids: [2], sourceFolder: "INBOX", destinationFolder: "Archive" }],
    ["mark_email", { folder: "INBOX", action: "read" }],
    ["delete_email", { uid: 1, uids: [2], folder: "INBOX" }],
  ]) {
    const result = await tools.get(name).handler(args);
    assert.equal(result.isError, true, name);
    assert.match(result.content[0].text, /exactly one of uid or uids/, name);
  }
  assert.equal(tools.get("move_email").config.inputSchema.uids.safeParse(Array.from({ length: 501 }, (_, i) => i)).success, false);
});

test("move: all present – one MOVE command, processed and uidMap", async () => {
  const client = await inFolder(mailbox(), "INBOX");
  const result = await moveMessages(client, "INBOX", "Archive", resolveUids({ uids: [10, 11, 12] }));
  assert.deepEqual(result, { success: true, from: "INBOX", to: "Archive", processed: [10, 11, 12], notFound: [], uidMap: { 10: 101, 11: 102, 12: 103 } });
  assert.deepEqual(client.calls.writes.map((w) => [w.op, w.range]), [["move", "10,11,12"]]);
});

test("mark: partly missing UIDs are listed in notFound", async () => {
  const client = await inFolder(mailbox(), "INBOX");
  const result = await markMessages(client, "INBOX", "read", resolveUids({ uids: [10, 11, 999] }));
  assert.deepEqual(result, { success: true, action: "read", processed: [10, 11], notFound: [999] });
  assert.deepEqual(client.calls.writes, [{ op: "flagsAdd", folder: "INBOX", range: "10,11", flags: ["\\Seen"] }]);
});

test("none present – error and no write", async () => {
  const client = await inFolder(mailbox(), "INBOX");
  await assert.rejects(markMessages(client, "INBOX", "flag", resolveUids({ uids: [998, 999] })), /None of the 2 UIDs exist in folder "INBOX"/);
  await assert.rejects(moveMessages(client, "INBOX", "Archive", resolveUids({ uid: 999 })), /No message with UID 999 in folder "INBOX"/);
  assert.deepEqual(client.calls.writes, []);
});

test("delete: bulk moves to Trash; permanent delete in Trash only in full mode", async () => {
  const client = await inFolder(mailbox(), "INBOX");
  const moved = await deleteMessages(client, "INBOX", "Trash", resolveUids({ uids: [10, 12, 13] }), "drafts");
  assert.deepEqual(moved, { success: true, movedTo: "Trash", processed: [10, 12], notFound: [13] });

  await client.getMailboxLock("Trash");
  await assert.rejects(deleteMessages(client, "Trash", "Trash", resolveUids({ uids: [5, 6] }), "drafts"), /PROTON_MCP_MODE=full/);
  assert.equal(client.calls.writes.filter((w) => w.op === "delete").length, 0);
  const gone = await deleteMessages(client, "Trash", "Trash", resolveUids({ uids: [5, 6] }), "full");
  assert.deepEqual(gone, { success: true, deletedPermanently: true, processed: [5, 6], notFound: [] });
});

// Regression: single-UID results keep exactly the fields they had before bulk support.
test("single-UID results keep their previous shape", async () => {
  let client = await inFolder(mailbox(), "INBOX");
  assert.deepEqual(await moveMessages(client, "INBOX", "Archive", resolveUids({ uid: 10 })), { success: true, uid: 10, from: "INBOX", to: "Archive", newUid: 101 });
  assert.deepEqual(await markMessages(client, "INBOX", "unflag", resolveUids({ uid: 11 })), { success: true, uid: 11, action: "unflag" });
  assert.deepEqual(await deleteMessages(client, "INBOX", "Trash", resolveUids({ uid: 12 }), "drafts"), { success: true, uid: 12, movedTo: "Trash" });
  client = await inFolder(mailbox(), "Trash");
  assert.deepEqual(await deleteMessages(client, "Trash", "Trash", resolveUids({ uid: 5 }), "full"), { success: true, uid: 5, deletedPermanently: true });
});
