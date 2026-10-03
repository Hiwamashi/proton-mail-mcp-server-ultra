import { test } from "node:test";
import assert from "node:assert/strict";
import { searchCriteria, searchMessages } from "../src/tools/mailbox.js";
import { fakeMailbox } from "./helpers/fake-mailbox.js";

const day = (n) => Date.UTC(2026, 8, n, 10);

test("maps the additional criteria to imapflow search keys", () => {
  assert.deepEqual(searchCriteria({ cc: "anna", larger: 10000000, smaller: 20000000, answered: true }), {
    cc: "anna",
    larger: 10000000,
    smaller: 20000000,
    answered: true,
  });
  // imapflow turns answered: false into UNANSWERED.
  assert.deepEqual(searchCriteria({ answered: false }), { answered: false });
  assert.deepEqual(searchCriteria({}), { all: true });
  assert.deepEqual(searchCriteria({ hasAttachments: true }), { all: true }, "hasAttachments is not an IMAP criterion");
  assert.deepEqual(searchCriteria({ larger: 0 }), { all: true }, "larger: 0 would compile to a bare SEARCH");
});

test("combines new and existing criteria with AND", () => {
  const criteria = searchCriteria({ from: "bob", cc: "anna", unseen: true, answered: false, since: "2026-09-01" });
  assert.deepEqual(Object.keys(criteria).sort(), ["cc", "from", "seen", "answered", "since"].sort());
  assert.equal(criteria.seen, false);
  assert.throws(() => searchCriteria({ since: "1.9.2026" }), /YYYY-MM-DD/);
});

function mailbox() {
  const messages = [
    { uid: 1, date: day(1), attachment: "attachment", flags: ["\\Answered"] },
    { uid: 2, date: day(5), attachment: "attachment" },
    { uid: 3, date: day(3), attachment: "inline" }, // inline image only
    { uid: 4, date: day(4) },
    { uid: 5, date: day(2), attachment: "attachment", cc: "Anna <anna@example.com>" },
    { uid: 6, date: day(6), size: 12_000_000 },
  ];
  return fakeMailbox({ INBOX: { specialUse: "\\Inbox", messages } });
}

async function run(args) {
  const client = mailbox();
  await client.getMailboxLock("INBOX");
  return searchMessages(client, { folder: "INBOX", ...args });
}

test("hasAttachments: true counts and pages only messages with an attachment part, newest first", async () => {
  const first = await run({ hasAttachments: true, limit: 2 });
  assert.equal(first.totalMatches, 3);
  assert.deepEqual(first.messages.map((m) => m.uid), [2, 5]);
  assert.equal(first.nextOffset, 2);
  assert.ok(first.messages.every((m) => m.hasAttachments));
  const second = await run({ hasAttachments: true, limit: 2, offset: 2 });
  assert.deepEqual(second.messages.map((m) => m.uid), [1]);
  assert.equal(second.nextOffset, null);
});

test("hasAttachments: an email with only inline images does not match true but matches false", async () => {
  const withAtt = await run({ hasAttachments: true });
  assert.ok(!withAtt.messages.some((m) => m.uid === 3));
  const without = await run({ hasAttachments: false });
  assert.deepEqual(without.messages.map((m) => m.uid), [6, 4, 3]);
  assert.equal(without.totalMatches, 3);
});

test("answered: false with hasAttachments: true returns unanswered emails with attachments", async () => {
  const result = await run({ answered: false, hasAttachments: true });
  assert.deepEqual(result.messages.map((m) => m.uid), [2, 5]);
});

test("larger and cc filter on the server side", async () => {
  assert.deepEqual((await run({ larger: 10_000_000 })).messages.map((m) => m.uid), [6]);
  assert.deepEqual((await run({ cc: "anna" })).messages.map((m) => m.uid), [5]);
});

test("no match after the attachment filter gives the no-match message", async () => {
  const client = fakeMailbox({ INBOX: { messages: [{ uid: 1, date: day(1) }] } });
  await client.getMailboxLock("INBOX");
  assert.match(await searchMessages(client, { folder: "INBOX", hasAttachments: true }), /No emails in "INBOX" matched/);
});

test("bodyStructure is only fetched in the candidate step when hasAttachments is set", async () => {
  const client = mailbox();
  await client.getMailboxLock("INBOX");
  await searchMessages(client, { folder: "INBOX", answered: false });
  assert.equal(client.calls.fetch[0].query.bodyStructure, undefined);
  await searchMessages(client, { folder: "INBOX", hasAttachments: true });
  assert.equal(client.calls.fetch[2].query.bodyStructure, true);
});
