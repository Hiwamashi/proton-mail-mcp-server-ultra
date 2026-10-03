import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attachmentToContent } from "../src/attachments.js";
import * as office from "./helpers/office-fixtures.js";

const file = (content, filename, contentType = "application/octet-stream") => ({ filename, contentType, size: content.length, content });
const ics = (name) => readFileSync(new URL(`./fixtures/ical/${name}.ics`, import.meta.url));

async function open(attachment, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "proton-mcp-doc-"));
  try {
    const blocks = await attachmentToContent(attachment, { uid: 9, index: 0, directory, ...options });
    return { blocks, text: blocks[0].text, saved: await readdir(directory) };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("DOCX is returned as text and not saved", async () => {
  const { blocks, text, saved } = await open(file(office.docx(), "Vertrag.docx"));
  assert.equal(blocks.length, 1);
  assert.match(text, /Word document as text/);
  assert.match(text, /# Rahmenvertrag/);
  assert.match(text, /Wartung\t1\.200 €/);
  assert.deepEqual(saved, []);
});

test("XLSX is recognized by MIME type alone and paged like other text", async () => {
  const xlsx = file(office.xlsx(), "export", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const { text } = await open(xlsx, { maxChars: 500, offset: 10 });
  assert.match(text, /Excel workbook as text/);
  assert.match(text, /Content: chars 10–/);
});

test("password-protected DOCX is saved with a message that it cannot be read", async () => {
  const { text, saved } = await open(file(office.encryptedOoxml(), "geheim.docx"));
  assert.match(text, /This Word document is password-protected \(encrypted\) or a legacy binary Office file with a new extension, so its text cannot be read\. Saved to: /);
  assert.deepEqual(saved, ["geheim.docx"]);
});

test("a ZIP bomb is saved, not inflated", async () => {
  const { text, saved } = await open(file(office.zipBomb(), "bomb.docx"));
  assert.match(text, /possible ZIP bomb/);
  assert.deepEqual(saved, ["bomb.docx"]);
});

test("legacy .doc is still saved, now with a message saying it cannot be read", async () => {
  const { text, saved } = await open(file(office.encryptedOoxml(), "alt.doc", "application/msword"));
  assert.match(text, /Legacy binary Office format \(\.doc\/\.xls\/\.ppt\) – its text cannot be read\. Saved to: /);
  assert.deepEqual(saved, ["alt.doc"]);
});

test("calendar invitation: summary first, then the raw iCalendar text", async () => {
  const { text } = await open(file(ics("request"), "invite.ics", "text/calendar"));
  assert.match(text, /Calendar summary followed by the raw iCalendar text/);
  const summary = text.indexOf("Calendar method: REQUEST");
  const raw = text.indexOf("--- Raw iCalendar ---\nBEGIN:VCALENDAR");
  assert.ok(summary > 0 && raw > summary);
  assert.match(text, /Organizer: Krinke, Anna/);
});

test("calendar with raw: true returns only the raw text", async () => {
  const { text } = await open(file(ics("cancel"), "", "application/ics"), { raw: true });
  assert.match(text, /\nRaw iCalendar\n/);
  assert.doesNotMatch(text, /Calendar method:/);
  assert.match(text, /---\nBEGIN:VCALENDAR/);
});

test("raw has no effect on other text attachments", async () => {
  const { text } = await open(file(Buffer.from("a,b\n1,2"), "data.csv", "text/csv"), { raw: true });
  assert.match(text, /---\na,b\n1,2$/);
});
