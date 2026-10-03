import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractOfficeText, officeKind, OfficeError } from "../src/office.js";
import { zipSync, strToU8 } from "fflate";
import * as fixtures from "./helpers/office-fixtures.js";

const real = (name) => readFileSync(new URL(`./fixtures/office/${name}`, import.meta.url));

test("detects the kind by extension first, then by MIME type", () => {
  assert.equal(officeKind("application/octet-stream", "Vertrag.DOCX"), "docx");
  assert.equal(officeKind("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "export"), "xlsx");
  assert.equal(officeKind("application/vnd.oasis.opendocument.presentation", "x.bin"), "odp");
  assert.equal(officeKind("application/msword", "alt.doc"), "legacy");
  assert.equal(officeKind("application/octet-stream", "alt.xls"), "legacy");
  assert.equal(officeKind("application/vnd.ms-powerpoint", ""), "legacy");
  assert.equal(officeKind("application/pdf", "a.pdf"), null);
});

test("DOCX: headings, list items, tables as tab-separated rows, tabs and line breaks", () => {
  const text = extractOfficeText(fixtures.docx(), "docx");
  assert.equal(text, "# Rahmenvertrag\nZwischen A & B.\n## § 2 Preise\n- Wartung\nPosition\tPreis\nWartung\t1.200 €\nName:\tMuster\nZeile 2");
  assert.doesNotMatch(text, /gelöscht/, "deleted tracked-change text is not shown");
});

test("PPTX: one block per slide in presentation order", () => {
  assert.equal(extractOfficeText(fixtures.pptx(), "pptx"), "=== Slide 1 ===\nTitel <Q3>\n\n=== Slide 2 ===\nAgenda\nPunkt 1");
});

test("XLSX: both sheets with names, shared/inline strings, booleans, dates, no formulas", () => {
  const text = extractOfficeText(fixtures.xlsx(), "xlsx");
  assert.equal(
    text,
    "=== Sheet: Umsatz ===\nMonat\tBetrag\t\tNotiz\nJanuar\t0.3\tTRUE\n2026-01-01\t2026-01-01 12:00\t7\n\n=== Sheet: Kunden ===\nName\nMüller"
  );
  assert.doesNotMatch(text, /SUM/);
});

test("ODT: headings, lists, tables; annotations skipped", () => {
  const text = extractOfficeText(fixtures.odt(), "odt");
  assert.equal(text, "# Vertrag\nText\tmit  Abstand\n- Punkt eins\n\nA\tB");
});

test("ODS: displayed cell text per sheet; repeated empty rows and columns are not expanded", () => {
  const text = extractOfficeText(fixtures.ods(), "ods");
  assert.equal(text, "=== Sheet: Liste ===\nArtikel\t\t\t3,00 €\n\n=== Sheet: Leer2 ===\nx");
});

test("ODP: one block per page, speaker notes skipped", () => {
  assert.equal(extractOfficeText(fixtures.odp(), "odp"), "=== Slide 1 ===\nWillkommen\n\n=== Slide 2: Ausblick ===\nNächste Schritte");
});

test("files written by macOS textutil are read", () => {
  for (const kind of ["docx", "odt"]) {
    const text = extractOfficeText(real(`contract.${kind}`), kind);
    for (const needle of ["Rahmenvertrag", "Muster GmbH & Co. KG", "Wartung der Kassen", "1.200 €", "Ende des Vertrags."]) {
      assert.ok(text.includes(needle), `${kind} contains ${needle}`);
    }
  }
});

function rejects(buffer, kind, reason) {
  assert.throws(
    () => extractOfficeText(buffer, kind),
    (error) => error instanceof OfficeError && error.reason === reason
  );
}

test("encrypted OOXML and ODF are reported as encrypted", () => {
  rejects(fixtures.encryptedOoxml(), "docx", "encrypted");
  rejects(fixtures.encryptedOoxml(), "xlsx", "encrypted");
  rejects(fixtures.odt({ encrypted: true }), "odt", "encrypted");
});

test("a ZIP bomb is refused before inflating", () => {
  rejects(fixtures.zipBomb(), "docx", "too-large");
});

test("damaged files and missing parts are reported as damaged", () => {
  rejects(Buffer.from("not a zip"), "docx", "damaged");
  rejects(fixtures.xlsx(), "docx", "damaged"); // no word/document.xml
  rejects(fixtures.docx(), "pptx", "damaged"); // no slides
});

const zipOf = (files) => Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([n, t]) => [n, strToU8(t)]))));

test("DOCX: text boxes keep the surrounding paragraph and are not doubled by mc:Fallback", () => {
  const box = "<w:txbxContent><w:p><w:r><w:t>Box</w:t></w:r></w:p></w:txbxContent>";
  const xml = `<w:document><w:body><w:p><w:r><w:t xml:space="preserve">Before </w:t></w:r><w:r><mc:AlternateContent><mc:Choice><w:drawing>${box}</w:drawing></mc:Choice><mc:Fallback><w:pict>${box}</w:pict></mc:Fallback></mc:AlternateContent></w:r><w:r><w:t xml:space="preserve"> after</w:t></w:r></w:p><w:p><w:r><w:t>Next</w:t></w:r></w:p></w:body></w:document>`;
  assert.equal(extractOfficeText(zipOf({ "word/document.xml": xml }), "docx"), "Before Box after\nNext");
});

test("XLSX: 1904 date system and elapsed-time formats", () => {
  const workbook = (pr) => `<workbook xmlns:r="r">${pr}<sheets><sheet name="S" r:id="rId1"/></sheets></workbook>`;
  const files = (pr) => ({
    "xl/workbook.xml": workbook(pr),
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/styles.xml": `<styleSheet><numFmts><numFmt numFmtId="164" formatCode="[h]:mm"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs></styleSheet>`,
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="1"><c r="A1" s="1"><v>44561</v></c><c r="B1" s="2"><v>1.5</v></c></row></sheetData></worksheet>`,
  });
  assert.equal(extractOfficeText(zipOf(files("")), "xlsx"), "=== Sheet: S ===\n2021-12-31\t36:00");
  assert.equal(extractOfficeText(zipOf(files('<workbookPr date1904="1"/>')), "xlsx"), "=== Sheet: S ===\n2026-01-01\t36:00");
});
