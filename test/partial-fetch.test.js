import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { simpleParser } from "mailparser";
import { CONFIG } from "../src/config.js";
import { messageCache } from "../src/message-cache.js";
import { loadMessage, loadAttachment } from "../src/connections.js";
import { planPartialFetch, decodedBase64Size } from "../src/partial-fetch.js";
import { describeAttachments, extractBody, paginate } from "../src/content.js";
import { renderEmail } from "../src/tools/mailbox.js";
import { fakeImap, describeMime } from "./helpers/fake-imap.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const FIXTURES = ["nested-multipart.eml", "related-images.eml", "rfc822-attachment.eml", "html-only.eml", "signed.eml"];

const savedThreshold = CONFIG.partialFetchBytes;
const savedCache = { maxBytes: messageCache.maxBytes, ttlMs: messageCache.ttlMs };
beforeEach(() => {
  messageCache.maxBytes = 1024 * 1024; // independent of PROTON_MCP_CACHE_* in the environment
  messageCache.ttlMs = 60000;
  CONFIG.partialFetchBytes = 1000; // every fixture counts as "large"
  messageCache.clear();
});
afterEach(() => {
  CONFIG.partialFetchBytes = savedThreshold;
  messageCache.clear();
  Object.assign(messageCache, savedCache);
});

const render = (parsed, flags, options = {}) => {
  const { body, source } = extractBody(parsed, options);
  const page = paginate(body, 0, 100000);
  return renderEmail({ uid: 5, folder: "INBOX", parsed, flags, body: page.chunk, source, page, quotedRemoved: false });
};

for (const name of FIXTURES) {
  test(`${name}: partial path equals full path (attachment list, bodies, rendered output)`, async () => {
    const source = fixture(name);
    const full = await simpleParser(source, { skipImageLinks: true });
    const client = fakeImap(source);
    const loaded = await loadMessage(client, "INBOX", 5, { allowPartial: true });

    assert.ok(loaded.partial, "the structure must be handled part by part, not fall back");
    assert.equal(client.calls.source, 0, "the full source is never downloaded");
    assert.deepEqual(describeAttachments(loaded.parsed.attachments), describeAttachments(full.attachments));
    assert.deepEqual(
      loaded.parsed.attachments.map((a) => [a.filename, a.contentType, a.contentDisposition, a.cid, a.related === true]),
      full.attachments.map((a) => [a.filename, a.contentType, a.contentDisposition, a.cid, a.related === true])
    );
    for (const key of ["text", "html", "textAsHtml", "subject", "messageId", "inReplyTo", "references"]) {
      assert.equal(loaded.parsed[key], full[key], key);
    }
    for (const key of ["from", "to", "cc", "bcc", "replyTo"]) assert.deepEqual(loaded.parsed[key], full[key], key);
    assert.equal(loaded.parsed.date?.getTime(), full.date?.getTime());

    for (const format of ["auto", "text", "html", "raw_html"]) {
      for (const includeLinks of [false, true]) {
        assert.equal(render(loaded.parsed, loaded.flags, { format, includeLinks }), render(full, loaded.flags, { format, includeLinks }), `${format}/${includeLinks}`);
      }
    }
  });

  test(`${name}: every attachment index addresses the same attachment in both paths`, async () => {
    const source = fixture(name);
    const full = await simpleParser(source, { skipImageLinks: true });
    const client = fakeImap(source);
    const loaded = await loadMessage(client, "INBOX", 5, { allowPartial: true });
    assert.ok(loaded.partial);
    assert.equal(loaded.partial.parts.length, full.attachments.length);
    for (let i = 0; i < full.attachments.length; i++) {
      const downloaded = await loadAttachment(client, 5, loaded, i);
      assert.equal(downloaded.filename, full.attachments[i].filename, `filename [${i}]`);
      assert.equal(downloaded.contentType, full.attachments[i].contentType, `type [${i}]`);
      assert.equal(downloaded.size, full.attachments[i].size, `size [${i}]`);
      assert.ok(downloaded.content.equals(full.attachments[i].content), `content [${i}]`);
    }
    assert.equal(await loadAttachment(client, 5, loaded, full.attachments.length), undefined);
  });
}

test("read_email path never downloads attachment parts; get_attachment downloads only the requested one", async () => {
  const source = fixture("nested-multipart.eml");
  const full = await simpleParser(source, { skipImageLinks: true });
  const client = fakeImap(source);
  const loaded = await loadMessage(client, "INBOX", 5, { allowPartial: true });

  assert.equal(client.calls.source, 0);
  // Attachment bodies are only touched by the size probes (a few bytes), never as whole parts.
  const attachmentParts = new Set(loaded.partial.parts);
  const bodyRequests = client.calls.ranges.filter((r) => !r.key.endsWith(".mime") && attachmentParts.has(r.key));
  assert.ok(bodyRequests.length > 0, "probes are expected for base64 attachments");
  assert.ok(bodyRequests.every((r) => r.partial && r.bytes <= 200), JSON.stringify(bodyRequests));

  const wholeParts = (parts) => client.calls.ranges.filter((r) => !r.partial && parts.has(r.key)).map((r) => r.key);
  assert.deepEqual(wholeParts(attachmentParts), [], "no whole attachment part before get_attachment");
  await loadAttachment(client, 5, loaded, 2);
  assert.deepEqual(wholeParts(attachmentParts), [loaded.partial.parts[2]], "one single-request download of exactly that part");
  assert.equal(full.attachments.length, loaded.parsed.attachments.length);
});

test("part numbers of the attachments follow the IMAP numbering of the structure", async () => {
  const client = fakeImap(fixture("nested-multipart.eml"));
  const loaded = await loadMessage(client, "INBOX", 5, { allowPartial: true });
  // logo.png in alternative/related, then the nested mixed pair, then the jpg and the 8bit file
  assert.deepEqual(loaded.partial.parts, ["1.2.2", "2.1", "2.2", "3", "4"]);
});

test("a signed message lists the signature like the full path", async () => {
  const client = fakeImap(fixture("signed.eml"));
  const loaded = await loadMessage(client, "INBOX", 5, { allowPartial: true });
  const described = describeAttachments(loaded.parsed.attachments);
  assert.deepEqual(described.map((a) => a.signature), [false, true]);
});

test("the partial result is cached and served without another download", async () => {
  const client = fakeImap(fixture("signed.eml"));
  const first = await loadMessage(client, "INBOX", 5, { allowPartial: true });
  const structureCalls = client.calls.structure;
  const second = await loadMessage(client, "INBOX", 5, { allowPartial: true });
  assert.equal(second.parsed, first.parsed);
  assert.equal(second.partial, first.partial);
  assert.equal(client.calls.structure, structureCalls);
  assert.equal(client.calls.source, 0);
});

test("callers that rebuild the message never get a partially loaded entry", async () => {
  const source = fixture("nested-multipart.eml");
  const client = fakeImap(source);
  const partial = await loadMessage(client, "INBOX", 5, { allowPartial: true });
  assert.ok(partial.partial);
  const full = await loadMessage(client, "INBOX", 5);
  assert.equal(full.partial, undefined);
  assert.equal(client.calls.source, 1);
  assert.ok(full.parsed.attachments.every((a) => Buffer.isBuffer(a.content) && a.content.length > 0));
  // The full entry replaced the partial one; read_email may now use it.
  const again = await loadMessage(client, "INBOX", 5, { allowPartial: true });
  assert.equal(again.parsed, full.parsed);
  assert.equal(client.calls.source, 1);
});

test("a message at or below the threshold takes the full path", async () => {
  const source = fixture("signed.eml");
  CONFIG.partialFetchBytes = source.length;
  const client = fakeImap(source);
  const loaded = await loadMessage(client, "INBOX", 5, { allowPartial: true });
  assert.equal(loaded.partial, undefined);
  assert.equal(client.calls.source, 1);
});

test("flags of a partially loaded message are fetched fresh", async () => {
  const client = fakeImap(fixture("signed.eml"), { flags: ["\\Seen"] });
  const first = await loadMessage(client, "INBOX", 5, { allowPartial: true });
  assert.deepEqual(first.flags, ["\\Seen"]);
  client.state.flags = new Set(["\\Flagged"]);
  assert.deepEqual((await loadMessage(client, "INBOX", 5, { allowPartial: true })).flags, ["\\Flagged"]);
});

// --- fallbacks: the full path must give the same answer ---

async function assertFallsBack(source, editStructure) {
  messageCache.clear();
  const client = fakeImap(source, { editStructure });
  const loaded = await loadMessage(client, "INBOX", 5, { allowPartial: true });
  assert.equal(loaded.partial, undefined, "must use the full path");
  assert.equal(client.calls.source, 1);
  const full = await simpleParser(source, { skipImageLinks: true });
  assert.deepEqual(describeAttachments(loaded.parsed.attachments), describeAttachments(full.attachments));
}

const mail = (headers, body) => Buffer.from(`From: a@example.com\r\nTo: b@example.com\r\nSubject: s\r\nMIME-Version: 1.0\r\n${headers}\r\n\r\n${body}`.replace(/\r?\n/g, "\r\n"));

test("fallback: multipart/encrypted", async () => {
  await assertFallsBack(
    mail(
      'Content-Type: multipart/encrypted; protocol="application/pgp-encrypted"; boundary="E"',
      `--E\nContent-Type: application/pgp-encrypted\n\nVersion: 1\n--E\nContent-Type: application/octet-stream\n\n-----BEGIN PGP MESSAGE-----\nabc\n-----END PGP MESSAGE-----\n--E--\n`
    )
  );
});

test("fallback: application/pkcs7-mime inside a multipart", async () => {
  await assertFallsBack(
    mail(
      'Content-Type: multipart/mixed; boundary="X"',
      `--X\nContent-Type: text/plain\n\nhi\n--X\nContent-Type: application/pkcs7-mime; smime-type=enveloped-data; name="smime.p7m"\nContent-Transfer-Encoding: base64\nContent-Disposition: attachment; filename="smime.p7m"\n\nAAAA\n--X--\n`
    )
  );
});

test("fallback: unknown multipart subtype", async () => {
  await assertFallsBack(
    mail('Content-Type: multipart/x-custom; boundary="X"', `--X\nContent-Type: text/plain\n\nhi\n--X\nContent-Type: application/pdf; name="a.pdf"\nContent-Transfer-Encoding: base64\n\nAAAA\n--X--\n`)
  );
});

test("fallback: single-part message", async () => {
  await assertFallsBack(mail("Content-Type: text/html; charset=utf-8", "<p>only html</p>"));
});

test("fallback: inline message/rfc822 (mailparser descends into it)", async () => {
  await assertFallsBack(
    mail(
      'Content-Type: multipart/mixed; boundary="X"',
      `--X\nContent-Type: text/plain\n\nouter\n--X\nContent-Type: message/rfc822\nContent-Disposition: inline\n\nSubject: inner\nContent-Type: text/plain\n\ninner body\n--X--\n`
    )
  );
});

test("fallback: quoted-printable attachment (decoded size not derivable)", async () => {
  await assertFallsBack(
    mail(
      'Content-Type: multipart/mixed; boundary="X"',
      `--X\nContent-Type: text/plain\n\nhi\n--X\nContent-Type: text/csv; name="a.csv"\nContent-Transfer-Encoding: quoted-printable\nContent-Disposition: attachment; filename="a.csv"\n\na=3Db,c\n--X--\n`
    )
  );
});

test("fallback: the structure disagrees with mailparser (attachment numbering cross-check)", async () => {
  // Claim the text body is an attachment: the plan blanks it, mailparser finds no attachment there.
  await assertFallsBack(fixture("signed.eml"), (root) => {
    const body = root.childNodes[0].childNodes[0];
    body.disposition = "attachment";
  });
  // Claim a PDF is a body part: it is fetched, and mailparser lists it as an attachment the plan does not know.
  await assertFallsBack(fixture("signed.eml"), (root) => {
    const pdf = root.childNodes[0].childNodes[1];
    pdf.type = "text/plain";
    delete pdf.disposition;
  });
});

test("fallback: a part the server does not return", async () => {
  const source = fixture("signed.eml");
  const client = fakeImap(source);
  const original = client.fetchOne;
  client.fetchOne = async (seq, query) => {
    const response = await original(seq, query);
    if (response && query.bodyParts) response.bodyParts.delete("1.1");
    return response;
  };
  const loaded = await loadMessage(client, "INBOX", 5, { allowPartial: true });
  assert.equal(loaded.partial, undefined);
  assert.equal(client.calls.source, 1);
});

// --- attachment download edge cases ---

const EMPTY_ATTACHMENT = Buffer.from(
  [
    "From: a@example.com",
    "To: b@example.com",
    "Subject: Empty attachment",
    'Content-Type: multipart/mixed; boundary="B"',
    "",
    "--B",
    "Content-Type: text/plain",
    "",
    "Body text",
    "--B",
    'Content-Type: application/octet-stream; name="empty.bin"',
    'Content-Disposition: attachment; filename="empty.bin"',
    "Content-Transfer-Encoding: base64",
    "",
    "",
    "--B--",
    "",
  ].join("\r\n")
);

test("a zero-byte attachment is returned empty without downloading its part", async () => {
  CONFIG.partialFetchBytes = 10; // the inline message is tiny
  const client = fakeImap(EMPTY_ATTACHMENT);
  const loaded = await loadMessage(client, "INBOX", 5, { allowPartial: true });
  assert.ok(loaded.partial);
  const before = client.calls.ranges.length;
  const found = await loadAttachment(client, 5, loaded, 0, "INBOX");
  assert.equal(found.content.length, 0);
  assert.equal(found.size, 0);
  assert.equal(client.calls.ranges.length, before, "no fetch for an empty part");
});

for (const [label, answer] of [["undefined", undefined], ["NIL as null", null]]) {
  test(`an attachment part the Bridge answers with ${label} falls back to the full message`, async () => {
    const source = fixture("signed.eml");
    const full = await simpleParser(source, { skipImageLinks: true });
    const client = fakeImap(source);
    const loaded = await loadMessage(client, "INBOX", 5, { allowPartial: true });
    assert.ok(loaded.partial);
    assert.equal(client.calls.source, 0);
    const original = client.fetchOne;
    client.fetchOne = async (seq, query) => {
      const response = await original(seq, query);
      if (response && query.bodyParts && !query.bodyParts.some((e) => typeof e === "object")) response.bodyParts.set("2", answer);
      return response;
    };
    const found = await loadAttachment(client, 5, loaded, 1, "INBOX");
    assert.equal(client.calls.source, 1, "the attachment came from the full path");
    assert.ok(found.content.equals(full.attachments[1].content));
    assert.equal(found.filename, full.attachments[1].filename);
  });
}

test("a message at or below the threshold costs one size fetch more than the full path and no BODYSTRUCTURE", async () => {
  const source = fixture("signed.eml");
  CONFIG.partialFetchBytes = source.length;
  const client = fakeImap(source);
  let fetches = 0;
  const original = client.fetchOne;
  client.fetchOne = async (...args) => (fetches++, original(...args));
  await loadMessage(client, "INBOX", 5, { allowPartial: true });
  assert.equal(fetches, 2, "size fetch + source fetch");
  assert.equal(client.calls.structure, 0);
});

test("planPartialFetch only accepts known multipart structures", () => {
  assert.equal(planPartialFetch(null), null);
  assert.equal(planPartialFetch({ type: "text/plain" }), null);
  const { node } = describeMime(fixture("signed.eml"));
  assert.deepEqual(planPartialFetch(node).attachments.map((n) => n.part), ["1.2", "2"]);
});

// --- decoded size of base64 parts without downloading them ---

test("decodedBase64Size equals the decoded length for any content length and line width", () => {
  for (const width of [76, 72, 64, 1000]) {
    for (const newline of ["\r\n", "\n"]) {
      for (let length = 0; length <= 400; length++) {
        const content = Buffer.alloc(length, 7);
        const encoded = Buffer.from(content.toString("base64").replace(new RegExp(`(.{${width}})(?=.)`, "g"), `$1${newline}`));
        const size = decodedBase64Size(encoded.length, encoded.subarray(0, 200), encoded.subarray(Math.max(0, encoded.length - 8)));
        // A first line longer than the probe is not measurable: null sends the caller to the full path.
        const measurable = encoded.length <= 200 || encoded.subarray(0, 200).includes(10);
        assert.equal(size, measurable ? length : null, `width ${width}, ${JSON.stringify(newline)}, length ${length}`);
      }
    }
  }
});

test("decodedBase64Size copes with a trailing line break", () => {
  const encoded = Buffer.from(`${Buffer.alloc(100, 1).toString("base64").replace(/(.{76})/, "$1\r\n")}\r\n`);
  assert.equal(decodedBase64Size(encoded.length, encoded.subarray(0, 200), encoded.subarray(encoded.length - 8)), 100);
});
