import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { setImapClientFactory, setSmtpTransportFactory, withImapClient, shutdownConnections } from "../src/connections.js";
import { messageCache } from "../src/message-cache.js";
import { registerMailboxTools } from "../src/tools/mailbox.js";
import { registerComposeTools } from "../src/tools/compose.js";
import { fakeImapFactory } from "./helpers/fake-imap-client.js";

function folders() {
  return {
    INBOX: { specialUse: "\\Inbox", messages: [{ uid: 5, messageId: "<m5@x>", subject: "Hallo", body: "Text", flags: ["\\Seen"] }] },
    Archive: { specialUse: "\\Archive", messages: [] },
    Drafts: { specialUse: "\\Drafts", messages: [{ uid: 3, messageId: "<d3@x>", subject: "Entwurf", to: "a@example.com", body: "Alt", flags: ["\\Draft", "\\Seen"] }] },
    Trash: { specialUse: "\\Trash", messages: [] },
  };
}

let fake;
let tools;

beforeEach(() => {
  messageCache.clear();
  fake = fakeImapFactory(folders());
  setImapClientFactory(fake.factory);
  tools = new Map();
  const server = { registerTool: (name, config, handler) => tools.set(name, handler) };
  registerMailboxTools(server, { mode: "full" });
  registerComposeTools(server, { mode: "full" });
});

afterEach(async () => {
  await shutdownConnections();
  setImapClientFactory(null);
  setSmtpTransportFactory(null);
});

const calls = (method) => fake.state.calls.filter((c) => c.method === method);
const call = (name, args) => tools.get(name)(args);

test("withImapClient uses the client from the injected factory and reuses it", async () => {
  const first = await withImapClient(async (client) => client);
  const second = await withImapClient(async (client) => client);
  assert.equal(first, fake.state.connections[0]);
  assert.equal(second, first);
  assert.equal(fake.state.connections.length, 1);
});

test("a read is retried once on a new connection after a connection error", async () => {
  fake.state.failures.push({ method: "fetchOne", error: "Connection closed", disconnect: true });
  const result = await call("read_email", { uid: 5, folder: "INBOX", format: "auto", includeLinks: false, stripQuoted: false, offset: 0, maxChars: 20000, markAsRead: false });
  assert.equal(result.isError, undefined, result.content[0].text);
  assert.match(result.content[0].text, /Subject: Hallo/);
  assert.equal(fake.state.connections.length, 2);
});

test("a read is not retried after an error that is not a connection error", async () => {
  fake.state.failures.push({ method: "fetchOne", error: "Internal server error" });
  const result = await call("read_email", { uid: 5, folder: "INBOX", format: "auto", includeLinks: false, stripQuoted: false, offset: 0, maxChars: 20000, markAsRead: false });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Internal server error/);
  assert.equal(calls("fetchOne").length, 1);
  assert.equal(fake.state.connections.length, 1);
});

test("a write is not retried after a connection error", async () => {
  fake.state.failures.push({ method: "messageMove", error: "Connection closed", disconnect: true });
  const result = await call("move_email", { uid: 5, sourceFolder: "INBOX", destinationFolder: "Archive" });
  assert.equal(result.isError, true);
  assert.equal(calls("messageMove").length, 1, "MOVE must not be sent twice");
  assert.equal(fake.state.connections.length, 1, "no second connection for a retry");
});

test("update_draft appends the new draft before deleting the old one and warns if the delete fails", async () => {
  fake.state.failures.push({ method: "messageDelete", error: "Delete failed" });
  const result = await call("update_draft", { uid: 3, body: "Neu" });
  const json = JSON.parse(result.content[0].text);
  assert.equal(json.replacedUid, 3);
  assert.match(json.warning, /old draft UID 3 could not be deleted \(Delete failed\)/);
  const order = fake.state.calls.map((c) => c.method).filter((m) => m === "append" || m === "messageDelete");
  assert.deepEqual(order, ["append", "messageDelete"]);
  assert.equal(fake.folders.Drafts.messages.length, 2, "old and new draft both remain");
});

test("send_draft reports success with a warning when the cleanup fails, and sends once", async () => {
  const sent = [];
  setSmtpTransportFactory(() => ({ sendMail: async (options) => (sent.push(options), { messageId: "<sent@x>" }), close() {} }));
  fake.state.failures.push({ method: "messageDelete", error: "Delete failed" });
  const result = await call("send_draft", { uid: 3 });
  const json = JSON.parse(result.content[0].text);
  assert.equal(json.success, true);
  assert.match(json.warning, /Sent, but the draft UID 3 could not be removed .* Do not send it again/);
  assert.equal(sent.length, 1);
});

test("a failed send is not retried", async () => {
  let attempts = 0;
  setSmtpTransportFactory(() => ({ sendMail: async () => { attempts++; throw new Error("Connection closed"); }, close() {} }));
  const result = await call("send_draft", { uid: 3 });
  assert.equal(result.isError, true);
  assert.equal(attempts, 1);
  assert.equal(calls("messageDelete").length, 0, "the draft stays when sending failed");
});

function renameFolder(from, to) {
  fake.folders[to] = fake.folders[from];
  delete fake.folders[from];
}

test("a Trash folder renamed in Proton is picked up after a reconnect", async () => {
  fake.folders.INBOX.messages.push({ uid: 6, messageId: "<m6@x>" });
  let json = JSON.parse((await call("delete_email", { uid: 5, folder: "INBOX" })).content[0].text);
  assert.equal(json.movedTo, "Trash");
  renameFolder("Trash", "Papierkorb");
  fake.state.connections[0].usable = false; // the Bridge connection dropped and is reopened
  json = JSON.parse((await call("delete_email", { uid: 6, folder: "INBOX" })).content[0].text);
  assert.equal(json.movedTo, "Papierkorb");
  assert.equal(fake.state.connections.length, 2);
});

test("on the same connection a failed move to a renamed Trash resets the resolution for the next call", async () => {
  fake.folders.INBOX.messages.push({ uid: 6, messageId: "<m6@x>" });
  await call("delete_email", { uid: 5, folder: "INBOX" }); // resolves and caches Trash
  renameFolder("Trash", "Papierkorb");
  const failed = await call("delete_email", { uid: 6, folder: "INBOX" });
  assert.equal(failed.isError, true, "the write returns the error and is not retried");
  assert.equal(calls("messageMove").length, 2);
  const json = JSON.parse((await call("delete_email", { uid: 6, folder: "INBOX" })).content[0].text);
  assert.equal(json.movedTo, "Papierkorb");
  assert.equal(fake.state.connections.length, 1);
});

test("a read on a renamed Drafts folder is retried once with freshly resolved folders", async () => {
  JSON.parse((await call("list_drafts", { limit: 5 })).content[0].text); // caches Drafts
  renameFolder("Drafts", "Entwürfe");
  const json = JSON.parse((await call("list_drafts", { limit: 5 })).content[0].text);
  assert.equal(json.folder, "Entwürfe");
  assert.equal(json.total, 1);
  assert.equal(fake.state.connections.length, 1);
});

test("a write to a renamed Drafts folder returns the error and resolves anew next time", async () => {
  await call("list_drafts", { limit: 5 });
  renameFolder("Drafts", "Entwürfe");
  const failed = await call("create_draft", { to: "a@example.com", subject: "S", body: "B", replyFolder: "INBOX", forwardFolder: "INBOX" });
  assert.equal(failed.isError, true);
  assert.match(failed.content[0].text, /doesn't exist/);
  const json = JSON.parse((await call("create_draft", { to: "a@example.com", subject: "S", body: "B", replyFolder: "INBOX", forwardFolder: "INBOX" })).content[0].text);
  assert.equal(json.folder, "Entwürfe");
  assert.equal(calls("append").length, 2, "the failed append was not repeated automatically");
});
