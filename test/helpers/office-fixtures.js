// Small Office/ODF documents built at test time, in the structure Word, Excel, PowerPoint and
// LibreOffice write. Only the parts the reader needs are included.
import { zipSync, strToU8 } from "fflate";

const zip = (files) => Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)]))));

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const run = (text) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
const para = (text, props = "") => `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${run(text)}</w:p>`;
const cell = (text) => `<w:tc><w:tcPr><w:tcW w:w="2000"/></w:tcPr>${para(text)}</w:tc>`;

export function docx() {
  const body = [
    para("Rahmenvertrag", '<w:pStyle w:val="berschrift1"/>'),
    para("Zwischen A &amp; B.", '<w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs>'),
    para("§ 2 Preise", '<w:pStyle w:val="Heading2"/>'),
    para("Wartung", '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'),
    `<w:tbl><w:tblPr/><w:tr>${cell("Position")}${cell("Preis")}</w:tr><w:tr>${cell("Wartung")}${cell("1.200 €")}</w:tr></w:tbl>`,
    `<w:p><w:r><w:t>Name:</w:t><w:tab/><w:t>Muster</w:t><w:br/><w:t>Zeile 2</w:t></w:r></w:p>`,
    `<w:p><w:r><w:delText>gelöscht</w:delText></w:r></w:p>`,
  ].join("");
  return zip({ "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>` });
}

export function pptx() {
  const slide = (...paras) =>
    `<p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree><p:sp><p:txBody>${paras.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join("")}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  return zip({
    // Presentation order differs from the file numbering: slide2.xml is shown first.
    "ppt/presentation.xml": `<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": `<Relationships><Relationship Id="rId2" Target="slides/slide1.xml"/><Relationship Id="rId3" Target="slides/slide2.xml"/></Relationships>`,
    "ppt/slides/slide1.xml": slide("Agenda", "Punkt 1"),
    "ppt/slides/slide2.xml": slide("Titel &lt;Q3&gt;"),
  });
}

export function xlsx() {
  return zip({
    "xl/workbook.xml": `<workbook xmlns:r="r"><sheets><sheet name="Umsatz" sheetId="1" r:id="rId1"/><sheet name="Kunden" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>`,
    "xl/sharedStrings.xml": `<sst><si><t>Monat</t></si><si><t>Betrag</t></si><si><r><t>Ja</t></r><r><t>nuar</t></r><rPh><t>x</t></rPh></si><si><t>Name</t></si></sst>`,
    "xl/styles.xml": `<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="&quot;Tag&quot; 0"/></numFmts><cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="165"/></cellXfs></styleSheet>`,
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>Notiz</t></is></c></row>
      <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><f>SUM(1,2)</f><v>0.30000000000000004</v></c><c r="C2" t="b"><v>1</v></c></row>
      <row r="3"><c r="A3" s="1"><v>46023</v></c><c r="B3" s="2"><v>46023.5</v></c><c r="C3" s="3"><v>7</v></c></row>
      <row r="4"/>
    </sheetData></worksheet>`,
    "xl/worksheets/sheet2.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>3</v></c></row><row r="2"><c r="A2" t="str"><v>Müller</v></c></row></sheetData></worksheet>`,
  });
}

const ODF_NS = 'xmlns:office="o" xmlns:text="t" xmlns:table="tb" xmlns:draw="d" xmlns:presentation="p"';
const odf = (body, { encrypted = false } = {}) =>
  zip({
    "content.xml": `<?xml version="1.0"?><office:document-content ${ODF_NS}><office:body>${body}</office:body></office:document-content>`,
    "META-INF/manifest.xml": `<manifest:manifest xmlns:manifest="m"><manifest:file-entry manifest:full-path="content.xml">${
      encrypted ? '<manifest:encryption-data manifest:checksum="x"/>' : ""
    }</manifest:file-entry></manifest:manifest>`,
  });

export function odt(options) {
  return odf(
    `<office:text><text:h text:outline-level="1">Vertrag</text:h><text:p>Text<text:tab/>mit<text:s text:c="2"/>Abstand<office:annotation><text:p>Kommentar</text:p></office:annotation></text:p>` +
      `<text:list><text:list-item><text:p>Punkt eins</text:p></text:list-item></text:list><text:p/>` +
      `<table:table><table:table-row><table:table-cell><text:p>A</text:p></table:table-cell><table:table-cell><text:p>B</text:p></table:table-cell></table:table-row></table:table></office:text>`,
    options
  );
}

export function ods() {
  return odf(
    `<office:spreadsheet><table:table table:name="Liste"><table:table-row><table:table-cell><text:p>Artikel</text:p></table:table-cell><table:table-cell table:number-columns-repeated="2"/><table:table-cell office:value="3" office:value-type="float"><text:p>3,00 €</text:p></table:table-cell><table:table-cell table:number-columns-repeated="16380"/></table:table-row>` +
      `<table:table-row table:number-rows-repeated="1048570"><table:table-cell table:number-columns-repeated="1024"/></table:table-row></table:table>` +
      `<table:table table:name="Leer2"><table:table-row><table:table-cell><text:p>x</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet>`
  );
}

export function odp() {
  return odf(
    `<office:presentation><draw:page draw:name="page1"><draw:frame><draw:text-box><text:p>Willkommen</text:p></draw:text-box></draw:frame><presentation:notes><draw:frame><draw:text-box><text:p>Sprechernotiz</text:p></draw:text-box></draw:frame></presentation:notes></draw:page>` +
      `<draw:page draw:name="Ausblick"><draw:frame><draw:text-box><text:p>Nächste Schritte</text:p></draw:text-box></draw:frame></draw:page></office:presentation>`
  );
}

// An OLE compound file header, as used by password-protected OOXML and by legacy .doc/.xls/.ppt.
export function encryptedOoxml() {
  return Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(504)]);
}

// A DOCX whose document.xml inflates to more than 50 MB.
export function zipBomb() {
  return Buffer.from(zipSync({ "word/document.xml": new Uint8Array(51 * 1024 * 1024) }, { level: 9 }));
}
