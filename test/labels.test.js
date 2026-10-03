import { test } from "node:test";
import assert from "node:assert/strict";
import { labelMessages, createFolder, labelPath } from "../src/tools/labels.js";
import { resolveUids } from "../src/tools/mailbox.js";
import { fakeMailbox } from "./helpers/fake-mailbox.js";

// The fake models a label folder as its own folder: COPY adds a copy there, EXPUNGE there removes it.
function mailbox({ labeled = [] } = {}) {
  const inbox = [1, 2, 3].map((uid) => ({ uid, messageId: `<m${uid}@x>`, flags: ["\\Seen"] }));
  return fakeMailbox({
    INBOX: { specialUse: "\\Inbox", messages: inbox },
    "Labels/Steuer": { messages: labeled.map((uid, i) => ({ uid: 50 + i, messageId: `<m${uid}@x>` })) },
    "Labels/Privat": { messages: [] },
    "Folders/Projekte": { messages: [] },
    "All Mail": { specialUse: "\\All", messages: [] },
  });
}

async function messageIdsIn(client, folder) {
  await client.getMailboxLock(folder);
  const out = [];
  for await (const m of client.fetch((await client.search({ all: true })).join(","), { headers: true })) {
    out.push(m.headers.toString().match(/Message-ID: (\S+)/)[1]);
  }
  return out.sort();
}

test("label path: prefix optional", () => {
  assert.equal(labelPath("Steuer"), "Labels/Steuer");
  assert.equal(labelPath("labels/Steuer"), "Labels/Steuer");
  assert.throws(() => labelPath("  "), /empty/);
});

test("add: one COPY into the label folder, messages stay in INBOX", async () => {
  const client = mailbox();
  const result = await labelMessages(client, "INBOX", "steuer", "add", resolveUids({ uids: [1, 2, 9] }));
  assert.deepEqual(result, { success: true, label: "Steuer", action: "add", processed: [1, 2], notFound: [9] });
  assert.deepEqual(client.calls.writes, [{ op: "copy", folder: "INBOX", range: "1,2", destination: "Labels/Steuer" }]);
  assert.deepEqual(await messageIdsIn(client, "INBOX"), ["<m1@x>", "<m2@x>", "<m3@x>"]);
  assert.deepEqual(await messageIdsIn(client, "Labels/Steuer"), ["<m1@x>", "<m2@x>"]);
});

test("remove: looked up by Message-ID in the label folder and expunged there only", async () => {
  const client = mailbox({ labeled: [1, 3] });
  const result = await labelMessages(client, "INBOX", "Steuer", "remove", resolveUids({ uid: 1 }));
  assert.deepEqual(result, { success: true, label: "Steuer", action: "remove", uid: 1, processed: [1], notFound: [] });
  assert.deepEqual(client.calls.writes, [{ op: "delete", folder: "Labels/Steuer", range: "50" }]);
  assert.deepEqual(await messageIdsIn(client, "Labels/Steuer"), ["<m3@x>"]);
  assert.deepEqual(await messageIdsIn(client, "INBOX"), ["<m1@x>", "<m2@x>", "<m3@x>"]);
});

test("removing a label the message does not have succeeds without change", async () => {
  const client = mailbox();
  const result = await labelMessages(client, "INBOX", "Steuer", "remove", resolveUids({ uid: 2 }));
  assert.equal(result.success, true);
  assert.deepEqual(client.calls.writes, []);
});

test("remove while addressing the label folder itself expunges directly", async () => {
  const client = mailbox({ labeled: [1] });
  await labelMessages(client, "Labels/Steuer", "Steuer", "remove", resolveUids({ uid: 50 }));
  assert.deepEqual(client.calls.writes, [{ op: "delete", folder: "Labels/Steuer", range: "50" }]);
});

test("unknown label fails with the list of existing labels and touches nothing", async () => {
  const client = mailbox();
  await assert.rejects(labelMessages(client, "INBOX", "Stuer", "add", resolveUids({ uid: 1 })), /Label "Stuer" does not exist\. Existing labels: Steuer, Privat\./);
  assert.deepEqual(client.calls.writes, []);
});

test("messages without Message-ID are reported on remove", async () => {
  const client = fakeMailbox({ INBOX: { messages: [{ uid: 1 }] }, "Labels/Steuer": { messages: [] } });
  const result = await labelMessages(client, "INBOX", "Steuer", "remove", resolveUids({ uid: 1 }));
  assert.deepEqual(result.withoutMessageId, [1]);
  assert.match(result.warning, /no Message-ID/);
});

test("create_folder: label, folder and nested folder appear in the folder list", async () => {
  const client = mailbox();
  assert.deepEqual(await createFolder(client, "Projekt X", "label"), { success: true, path: "Labels/Projekt X", type: "label" });
  assert.deepEqual(await createFolder(client, "Folders/Kunden/2026", "folder"), { success: true, path: "Folders/Kunden/2026", type: "folder" });
  const paths = (await client.list()).map((f) => f.path);
  assert.ok(paths.includes("Labels/Projekt X"));
  assert.ok(paths.includes("Folders/Kunden/2026"));
});

test("create_folder: existing path, nested label and empty segments fail", async () => {
  const client = mailbox();
  await assert.rejects(createFolder(client, "projekte", "folder"), /"Folders\/Projekte" already exists/);
  await assert.rejects(createFolder(client, "a/b", "label"), /only possible for folders/);
  await assert.rejects(createFolder(client, "a//b", "folder"), /Invalid folder name/);
  assert.deepEqual(client.calls.writes, []);
});

test("system folders listed under Labels/ (e.g. Trash) are never treated as labels", async () => {
  const client = fakeMailbox({
    INBOX: { messages: [{ uid: 1, messageId: "<m1@x>" }] },
    "Labels/Gelöschte Elemente": { specialUse: "\\Trash", messages: [{ uid: 7, messageId: "<m1@x>" }] },
    "Labels/Steuer": { messages: [] },
  });
  for (const action of ["add", "remove"]) {
    await assert.rejects(labelMessages(client, "INBOX", "Gelöschte Elemente", action, resolveUids({ uid: 1 })), /is a system folder \(\\Trash\), not a label/);
  }
  await assert.rejects(labelMessages(client, "INBOX", "Stuer", "add", resolveUids({ uid: 1 })), (e) => !/Gelöschte/.test(e.message) && /Existing labels: Steuer\./.test(e.message));
  assert.deepEqual(client.calls.writes, []);
});

test("a COPY or EXPUNGE the Bridge does not confirm is reported as an error, not success", async () => {
  const client = mailbox({ labeled: [1] });
  client.messageCopy = async () => false;
  await assert.rejects(labelMessages(client, "INBOX", "Steuer", "add", resolveUids({ uid: 2 })), /did not confirm the request to add the label/);
  client.messageDelete = async () => false;
  await assert.rejects(labelMessages(client, "INBOX", "Steuer", "remove", resolveUids({ uid: 1 })), /did not confirm the request to remove the label/);
});

test("remove leaves indistinguishable labeled copies alone and reports them", async () => {
  // Two labeled copies share one Message-ID (e.g. a mail to yourself), only one message is addressed.
  const client = fakeMailbox({
    INBOX: { messages: [{ uid: 1, messageId: "<self@x>" }, { uid: 2, messageId: "<m2@x>" }] },
    "Labels/Steuer": { messages: [{ uid: 50, messageId: "<self@x>" }, { uid: 51, messageId: "<self@x>" }, { uid: 52, messageId: "<m2@x>" }] },
  });
  const result = await labelMessages(client, "INBOX", "Steuer", "remove", resolveUids({ uids: [1, 2] }));
  assert.deepEqual(result.ambiguous, [1]);
  assert.match(result.warning, /ambiguous/);
  assert.deepEqual(client.calls.writes, [{ op: "delete", folder: "Labels/Steuer", range: "52" }]);
});

test("the label folder is recognized as the source folder regardless of case", async () => {
  const client = mailbox({ labeled: [1] });
  client.getMailboxLock = ((lock) => async (path) => lock(path === "Labels/steuer" ? "Labels/Steuer" : path))(client.getMailboxLock);
  await labelMessages(client, "Labels/steuer", "Steuer", "remove", resolveUids({ uid: 50 }));
  assert.deepEqual(client.calls.writes, [{ op: "delete", folder: "Labels/Steuer", range: "50" }]);
});
