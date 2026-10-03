import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getThread, applyBodyBudget, parseMessageIds, parseThreadHeaders } from "../src/thread.js";
import { messageCache } from "../src/message-cache.js";
import { fakeMailbox } from "./helpers/fake-mailbox.js";

beforeEach(() => messageCache.clear());

const day = (n) => Date.UTC(2026, 8, n, 10);

// A → B → C: B replies to A, C replies to B. Own reply B is in Sent; A and C in INBOX.
function chain() {
  const A = { messageId: "<a@x>", subject: "Plan", date: day(1), body: "Original question" };
  const B = { messageId: "<b@me>", inReplyTo: "<a@x>", references: "<a@x>", subject: "Re: Plan", date: day(2), body: "My answer\n\nOn Tue, 1 Sep 2026 someone wrote:\n> Original question" };
  const C = { messageId: "<c@x>", inReplyTo: "<b@me>", references: "<a@x> <b@me>", subject: "Re: Plan", date: day(3), body: "Thanks", flags: [] };
  return fakeMailbox({
    INBOX: { specialUse: "\\Inbox", messages: [{ ...A, uid: 1 }, { ...C, uid: 2 }] },
    Sent: { specialUse: "\\Sent", messages: [{ ...B, uid: 7 }] },
    "All Mail": { specialUse: "\\All", messages: [{ ...C, uid: 30 }, { ...A, uid: 10 }, { ...B, uid: 20 }, { messageId: "<other@x>", uid: 40, date: day(4) }] },
  });
}

test("parses Message-ID lists with and without angle brackets", () => {
  assert.deepEqual(parseMessageIds("<a@b>  <c@d>"), ["<a@b>", "<c@d>"]);
  assert.deepEqual(parseMessageIds("a@b"), ["<a@b>"]);
  assert.deepEqual(parseMessageIds(""), []);
  const h = parseThreadHeaders(Buffer.from("Message-ID: <x@y>\r\nReferences: <a@b>\r\n <c@d>\r\n\r\n"));
  assert.deepEqual(h, { messageId: "<x@y>", inReplyTo: [], references: ["<a@b>", "<c@d>"] });
});

test("reply chain: started from C, returns A, B, C oldest first and marks C", async () => {
  const client = chain();
  const result = await getThread(client, { uid: 2, folder: "INBOX", includeBodies: false });
  assert.equal(result.folder, "All Mail");
  assert.deepEqual(result.messages.map((m) => m.messageId), ["<a@x>", "<b@me>", "<c@x>"]);
  assert.deepEqual(result.messages.map((m) => m.uid), [10, 20, 30]);
  assert.deepEqual(result.messages.map((m) => Boolean(m.start)), [false, false, true]);
  assert.equal(result.messages[2].inReplyTo, "<b@me>");
  assert.equal(result.truncated, false);
  assert.equal("bodies" in result, false);
  assert.equal("body" in result.messages[0], false);
});

test("own replies in Sent are part of the thread and folders are reported", async () => {
  const client = chain();
  const result = await getThread(client, { uid: 1, folder: "INBOX", includeBodies: false });
  assert.deepEqual(result.messages.map((m) => m.messageId), ["<a@x>", "<b@me>", "<c@x>"]);
  assert.equal(result.messages[0].start, true);
  assert.deepEqual(result.messages[1].folders, ["Sent"]);
  assert.deepEqual(result.messages[0].folders, ["INBOX"]);
  assert.deepEqual(result.foldersChecked.sort(), ["INBOX", "Sent"]);
});

test("message without threading headers and without replies is alone", async () => {
  const client = chain();
  client.calls.search.length = 0;
  const result = await getThread(client, { uid: 40, folder: "All Mail", includeBodies: false });
  assert.equal(result.count, 1);
  assert.equal(result.messages[0].start, true);
  assert.equal(result.truncated, false);
});

test("searches all IDs of a round as one OR batch in All Mail", async () => {
  const client = chain();
  await getThread(client, { uid: 2, folder: "INBOX", includeBodies: false });
  const inAllMail = client.calls.search.filter((s) => s.folder === "All Mail");
  // Round 1: C, A, B by Message-ID and replies; round 2 finds nothing new and ends the search.
  assert.equal(inAllMail.length, 1);
  assert.equal(inAllMail[0].criteria.or.length, 9);
});

test("a thread with more than 100 messages is truncated at 100", async () => {
  const root = { uid: 1, messageId: "<root@x>", date: day(1) };
  const replies = Array.from({ length: 120 }, (_, i) => ({ uid: i + 2, messageId: `<r${i}@x>`, inReplyTo: "<root@x>", references: "<root@x>", date: day(1) + i * 1000 }));
  const client = fakeMailbox({ "All Mail": { specialUse: "\\All", messages: [root, ...replies] } });
  const result = await getThread(client, { uid: 1, folder: "All Mail", includeBodies: false });
  assert.equal(result.count, 100);
  assert.equal(result.truncated, true);
  assert.match(result.note, /more than 100 messages/);
  assert.equal(result.messages[0].start, true);
});

test("stops after the maximum number of rounds and says so", async () => {
  // Each message replies to the previous one: one new message per round.
  const msgs = Array.from({ length: 6 }, (_, i) => ({ uid: i + 1, messageId: `<m${i}@x>`, inReplyTo: i ? `<m${i - 1}@x>` : undefined, date: day(1) + i }));
  const client = fakeMailbox({ "All Mail": { specialUse: "\\All", messages: msgs } });
  const result = await getThread(client, { uid: 1, folder: "All Mail", includeBodies: false, maxRounds: 3 });
  assert.equal(result.truncated, true);
  assert.match(result.note, /3 search rounds/);
});

test("copies with the same Message-ID become one entry listing the other UIDs", async () => {
  const client = fakeMailbox({
    "All Mail": {
      specialUse: "\\All",
      messages: [
        { uid: 1, messageId: "<a@x>", date: day(1), body: "Question" },
        { uid: 2, messageId: "<a@x>", date: day(1), body: "Question" },
        { uid: 3, messageId: "<b@x>", inReplyTo: "<a@x>", date: day(2), body: "Answer" },
      ],
    },
  });
  const result = await getThread(client, { uid: 3, folder: "All Mail" });
  assert.equal(result.count, 2);
  assert.deepEqual(result.messages.map((m) => m.uid), [1, 3]);
  assert.deepEqual(result.messages[0].duplicateUids, [2]);
  assert.equal("duplicateUids" in result.messages[1], false);
  assert.deepEqual(result.messages.map((m) => m.body), ["Question", "Answer"]);
});

test("search hits whose headers do not contain a searched ID are dropped", async () => {
  const client = fakeMailbox({
    "All Mail": {
      specialUse: "\\All",
      messages: [
        { uid: 1, messageId: "<a@x>", date: day(1) },
        { uid: 2, messageId: "<z@x>", references: "<y@x>", date: day(2) },
      ],
    },
  });
  // HEADER search is a substring match on the server; simulate a hit that only matched loosely.
  const search = client.search;
  client.search = async (criteria, options) => [...(await search(criteria, options)), 2];
  const result = await getThread(client, { uid: 1, folder: "All Mail", includeBodies: false });
  assert.deepEqual(result.messages.map((m) => m.uid), [1]);
});

test("includes quote-stripped bodies within the budget", async () => {
  const client = chain();
  const result = await getThread(client, { uid: 2, folder: "INBOX" });
  const bodies = result.messages.map((m) => m.body);
  assert.deepEqual(bodies, ["Original question", "My answer", "Thanks"]);
  assert.deepEqual(result.bodies.shortened, []);
  assert.deepEqual(result.bodies.omitted, []);
});

test("does not change flags of unread messages", async () => {
  const client = chain();
  await getThread(client, { uid: 2, folder: "INBOX" });
  assert.deepEqual(client.calls.writes, [], "no flag change or other write");
  for (const f of client.calls.fetch) assert.equal(f.query.markAsSeen, undefined);
});

test("unknown start UID is a not-found error", async () => {
  await assert.rejects(getThread(chain(), { uid: 999, folder: "INBOX" }), /No message with UID 999/);
});

test("budget: newest bodies stay full, oldest are shortened or omitted first", () => {
  const newestFirst = ["n".repeat(300), "m".repeat(300), "o".repeat(300), "p".repeat(300)];
  const out = applyBodyBudget(newestFirst, 800);
  assert.deepEqual(out.map((o) => o.status), ["full", "full", "shortened", "omitted"]);
  assert.equal(out[2].body.length, 200);
  assert.equal(out.reduce((n, o) => n + (o.body?.length || 0), 0), 800);
});

test("budget: tiny remainders are omitted instead of shortened; unloaded bodies are omitted", () => {
  const out = applyBodyBudget(["x".repeat(950), "y".repeat(500), undefined], 1000);
  assert.deepEqual(out.map((o) => o.status), ["full", "omitted", "omitted"]);
  const shortOnes = applyBodyBudget(["a".repeat(990), "ok"], 1000);
  assert.deepEqual(shortOnes.map((o) => o.status), ["full", "full"]);
});

test("truncation keeps the start message and its ancestors before other replies", async () => {
  // The root has 120 direct replies; the start message is one of them with a high UID.
  const root = { uid: 500, messageId: "<root@x>", date: day(1) };
  const replies = Array.from({ length: 120 }, (_, i) => ({ uid: i + 1, messageId: `<r${i}@x>`, inReplyTo: "<root@x>", references: "<root@x>", date: day(2) + i }));
  const startMsg = { uid: 900, messageId: "<start@x>", inReplyTo: "<root@x>", references: "<root@x>", date: day(9) };
  const client = fakeMailbox({ "All Mail": { specialUse: "\\All", messages: [root, ...replies, startMsg] } });
  const result = await getThread(client, { uid: 900, folder: "All Mail", includeBodies: false });
  assert.equal(result.count, 100);
  assert.equal(result.truncated, true);
  assert.ok(result.messages.some((m) => m.start && m.uid === 900));
  assert.ok(result.messages.some((m) => m.uid === 500));
  assert.doesNotMatch(result.note, /not found/);
});

test("budget: after a newer body is omitted, older short ones are omitted too", () => {
  const out = applyBodyBudget(["x".repeat(950), "y".repeat(500), "z".repeat(20)], 1000);
  assert.deepEqual(out.map((o) => o.status), ["full", "omitted", "omitted"]);
});
