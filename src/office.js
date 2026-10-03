import { extname, posix } from "node:path";
import { unzipSync } from "fflate";
import { normalizeText } from "./content.js";

// Text from Office Open XML (DOCX, XLSX, PPTX) and OpenDocument (ODT, ODS, ODP) attachments. Both
// are ZIP containers of XML parts; fflate unzips, small purpose-built readers pick the text. Only
// the parts that carry text are inflated, and their declared size is capped (ZIP bombs).

export const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_ENTRIES = 10000;
const MAX_COLUMNS = 16384;
const MAX_REPEATED_ROWS = 100;

const KINDS = {
  docx: { ext: ".docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word document" },
  xlsx: { ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel workbook" },
  pptx: { ext: ".pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", label: "PowerPoint presentation" },
  odt: { ext: ".odt", mime: "application/vnd.oasis.opendocument.text", label: "OpenDocument text" },
  ods: { ext: ".ods", mime: "application/vnd.oasis.opendocument.spreadsheet", label: "OpenDocument spreadsheet" },
  odp: { ext: ".odp", mime: "application/vnd.oasis.opendocument.presentation", label: "OpenDocument presentation" },
};
const LEGACY = {
  ".doc": "application/msword",
  ".xls": "application/vnd.ms-excel",
  ".ppt": "application/vnd.ms-powerpoint",
};

export class OfficeError extends Error {
  constructor(reason, message) {
    super(message);
    this.reason = reason;
  }
}

// "docx" … "odp", "legacy" for .doc/.xls/.ppt, or null. The file extension wins over a generic MIME type.
export function officeKind(contentType, filename) {
  const ext = extname(filename || "").toLowerCase();
  const type = (contentType || "").toLowerCase();
  for (const [kind, info] of Object.entries(KINDS)) if (ext === info.ext) return kind;
  if (LEGACY[ext]) return "legacy";
  for (const [kind, info] of Object.entries(KINDS)) if (type === info.mime) return kind;
  if (Object.values(LEGACY).includes(type)) return "legacy";
  return null;
}

export const officeLabel = (kind) => KINDS[kind]?.label || "Office document";

// ---- XML ----

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, name) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name] ?? whole;
  });
}

const TOKEN = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;

// Yields { open, close, name, attrs } for elements (a self-closing element has open and close set)
// and { text } for character data.
function* xmlTokens(xml) {
  for (const m of xml.matchAll(TOKEN)) {
    if (m[1] !== undefined) yield { text: m[1] };
    else if (m[3]) {
      const closing = m[2] === "/";
      yield { name: m[3], attrs: m[4] || "", open: !closing, close: closing || m[5] === "/" };
    } else if (m[6] !== undefined) yield { text: decodeEntities(m[6]) };
  }
}

function attr(attrs, name) {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name.replace(/[.:]/g, "\\$&")}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  return m ? decodeEntities(m[1] ?? m[2]) : undefined;
}

// ---- ZIP ----

const CFB_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

// Inflates only the entries `want(name)` accepts. Returns { names, files: Map name → string }.
function openZip(buffer, want) {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  // Encrypted OOXML files are OLE compound files, not ZIP archives – as are legacy .doc/.xls/.ppt
  // files that were only given a new extension.
  if (Buffer.from(data.subarray(0, 8)).equals(CFB_MAGIC)) {
    throw new OfficeError("encrypted", "is password-protected (encrypted) or a legacy binary Office file with a new extension");
  }
  const names = [];
  let total = 0;
  let entries;
  try {
    entries = unzipSync(data, {
      filter(file) {
        names.push(file.name);
        if (names.length > MAX_ENTRIES) throw new OfficeError("too-large", `has more than ${MAX_ENTRIES} entries`);
        if (!want(file.name)) return false;
        total += file.originalSize;
        if (total > MAX_UNCOMPRESSED_BYTES) {
          throw new OfficeError("too-large", `expands to more than ${MAX_UNCOMPRESSED_BYTES / 1024 / 1024} MB (possible ZIP bomb)`);
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof OfficeError) throw error;
    throw new OfficeError("damaged", "is damaged or not a valid file of this type");
  }
  const decoder = new TextDecoder("utf-8");
  const files = new Map(Object.entries(entries).map(([name, bytes]) => [name, decoder.decode(bytes)]));
  return { names, files };
}

function required(files, name) {
  const xml = files.get(name);
  if (xml === undefined) throw new OfficeError("damaged", `is damaged or not a valid file of this type (missing ${name})`);
  return xml;
}

// Relationship id → target path, resolved against the folder of the part the .rels file belongs to.
function relationships(xml, baseDir) {
  const map = new Map();
  if (!xml) return map;
  for (const t of xmlTokens(xml)) {
    if (t.open && t.name === "Relationship") {
      const target = attr(t.attrs, "Target");
      if (!target) continue;
      map.set(attr(t.attrs, "Id"), target.startsWith("/") ? target.slice(1) : posix.normalize(posix.join(baseDir, target)));
    }
  }
  return map;
}

const byNumber = (prefix) => (a, b) => Number(a.slice(prefix.length).match(/\d+/)?.[0]) - Number(b.slice(prefix.length).match(/\d+/)?.[0]);

// ---- Tables shared by DOCX and ODF: rows of cells, a cell collects its paragraphs. ----

function tableCollector() {
  const stack = [];
  return {
    get depth() {
      return stack.length;
    },
    startTable: () => stack.push({ row: null, cell: null }),
    endTable: () => stack.pop(),
    startRow: () => stack.length && (stack.at(-1).row = []),
    startCell: () => stack.length && (stack.at(-1).cell = ""),
    addToCell(text) {
      const top = stack.at(-1);
      if (top?.cell !== null && text) top.cell = top.cell ? `${top.cell} ${text}` : text;
    },
    endCell() {
      const top = stack.at(-1);
      if (top?.row && top.cell !== null) top.row.push(top.cell.replace(/[\t\n]+/g, " ").trim());
      if (top) top.cell = null;
    },
    // Returns the finished row as one tab-separated line (outermost table) or adds it to the outer cell.
    endRow() {
      const top = stack.at(-1);
      if (!top?.row) return null;
      const line = top.row.join("\t").replace(/\t+$/, "");
      top.row = null;
      if (stack.length > 1) {
        stack.at(-2).cell = [stack.at(-2).cell, line.replace(/\t/g, " ")].filter(Boolean).join(" ");
        return null;
      }
      return line;
    },
  };
}

// ---- DOCX ----

function headingLevel(style) {
  const m = (style || "").match(/^(?:heading|berschrift|überschrift|titre|titolo|ttulo|título)\s*(\d)/i);
  if (m) return Number(m[1]);
  return /^(title|titel)$/i.test(style || "") ? 1 : 0;
}

// Paragraphs are kept on a stack: text boxes (w:txbxContent) nest whole paragraphs inside a run of the
// surrounding one; their text is appended to it. mc:Fallback repeats the mc:Choice content and is skipped.
function docxText(files) {
  const xml = required(files, "word/document.xml");
  const lines = [];
  const table = tableCollector();
  const paras = [];
  let inText = false;
  let inProps = 0;
  let skip = 0;

  for (const t of xmlTokens(xml)) {
    const para = paras.at(-1);
    if (t.text !== undefined) {
      if (!skip && inText && para) para.text += t.text;
      continue;
    }
    const { name } = t;
    if (name === "mc:Fallback") {
      if (t.open && !t.close) skip++;
      else if (!t.open && t.close) skip = Math.max(0, skip - 1);
      continue;
    }
    if (skip) continue;
    if (t.open) {
      if (name === "w:tbl") table.startTable();
      else if (name === "w:tr") table.startRow();
      else if (name === "w:tc") table.startCell();
      else if (name === "w:p" && !t.close) paras.push({ text: "", style: "", listItem: false });
      else if (name === "w:pPr" && !t.close) inProps++;
      else if (name === "w:pStyle" && inProps && para) para.style = attr(t.attrs, "w:val") || "";
      else if (name === "w:numPr" && inProps && para) para.listItem = true;
      else if (name === "w:t" && !t.close) inText = true;
      else if (name === "w:tab" && !inProps && para) para.text += "\t";
      else if ((name === "w:br" || name === "w:cr") && para) para.text += "\n";
    }
    if (t.close) {
      if (name === "w:t") inText = false;
      else if (name === "w:pPr") inProps = Math.max(0, inProps - 1);
      else if (name === "w:p" && !t.open && para) {
        paras.pop();
        const level = headingLevel(para.style);
        const prefix = level ? `${"#".repeat(level)} ` : para.listItem ? "- " : "";
        const text = para.text.trim() ? prefix + para.text : "";
        const outer = paras.at(-1);
        if (outer) {
          if (text) outer.text += `${outer.text && !/\s$/.test(outer.text) ? " " : ""}${text}`;
        } else if (table.depth) table.addToCell(text);
        else lines.push(text);
      } else if (name === "w:tc") table.endCell();
      else if (name === "w:tr") {
        const line = table.endRow();
        if (line !== null) lines.push(line);
      } else if (name === "w:tbl") table.endTable();
    }
  }
  return lines.join("\n");
}

// ---- PPTX ----

function drawingParagraphs(xml) {
  const paragraphs = [];
  let para = null;
  let inText = false;
  for (const t of xmlTokens(xml)) {
    if (t.text !== undefined) {
      if (inText && para !== null) para += t.text;
      continue;
    }
    if (t.open && t.name === "a:p" && !t.close) para = "";
    else if (t.open && t.name === "a:t" && !t.close) inText = true;
    else if (t.open && (t.name === "a:br" || t.name === "a:tab") && para !== null) para += t.name === "a:br" ? "\n" : "\t";
    if (t.close && t.name === "a:t") inText = false;
    else if (t.close && t.name === "a:p" && para !== null) {
      if (para.trim()) paragraphs.push(para);
      para = null;
    }
  }
  return paragraphs;
}

function pptxText(files, names) {
  const presentation = files.get("ppt/presentation.xml");
  const rels = relationships(files.get("ppt/_rels/presentation.xml.rels"), "ppt");
  let slides = [];
  if (presentation) {
    for (const t of xmlTokens(presentation)) {
      if (t.open && t.name === "p:sldId") {
        const target = rels.get(attr(t.attrs, "r:id"));
        if (target && files.has(target)) slides.push(target);
      }
    }
  }
  if (!slides.length) slides = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort(byNumber("ppt/slides/slide"));
  if (!slides.length) throw new OfficeError("damaged", "is damaged or not a valid file of this type (no slides)");
  return slides.map((path, i) => [`=== Slide ${i + 1} ===`, ...drawingParagraphs(files.get(path) || "")].join("\n")).join("\n\n");
}

// ---- XLSX ----

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

// "date" for date/time formats, "duration" for elapsed-time formats like [h]:mm, otherwise null.
function formatKind(code) {
  const text = code || "";
  if (/\[(h+|m+|s+)\]/i.test(text)) return "duration";
  const bare = text.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, "");
  return /[dmyhs]/i.test(bare) && !/^general$/i.test(bare.trim()) ? "date" : null;
}

// Cell style index (the `s` attribute) → "date" | "duration" for styles that display a date or time.
function dateStyles(xml) {
  const custom = new Map();
  const dates = new Map();
  if (!xml) return dates;
  let inCellXfs = false;
  let index = 0;
  for (const t of xmlTokens(xml)) {
    if (!t.name) continue;
    if (t.open && t.name === "numFmt") custom.set(Number(attr(t.attrs, "numFmtId")), attr(t.attrs, "formatCode"));
    if (t.name === "cellXfs") inCellXfs = t.open && !t.close;
    else if (inCellXfs && t.open && t.name === "xf") {
      const id = Number(attr(t.attrs, "numFmtId") || 0);
      const kind = BUILTIN_DATE_FORMATS.has(id) ? (id === 46 ? "duration" : "date") : custom.has(id) ? formatKind(custom.get(id)) : null;
      if (kind) dates.set(index, kind);
      index++;
    }
  }
  return dates;
}

const pad = (n) => String(n).padStart(2, "0");

// Excel serial date (days since 1899-12-30, or since 1904-01-01 in the 1904 date system) as ISO
// date, date-time or time.
function serialToDate(serial, date1904) {
  const ms = Math.round(serial * 86400000);
  const d = new Date((date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)) + ms);
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${d.getUTCSeconds() ? `:${pad(d.getUTCSeconds())}` : ""}`;
  if (serial < 1) return time;
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return Number.isInteger(serial) ? date : `${date} ${time}`;
}

// Elapsed time in days as total hours, e.g. 1.5 → 36:00.
function serialToDuration(serial) {
  const totalSeconds = Math.round(Math.abs(serial) * 86400);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const sec = totalSeconds % 60;
  return `${serial < 0 ? "-" : ""}${h}:${pad(m)}${sec ? `:${pad(sec)}` : ""}`;
}

function formatNumber(value, kind, date1904) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (kind === "date") return serialToDate(n, date1904);
  if (kind === "duration") return serialToDuration(n);
  return String(Number(n.toPrecision(15)));
}

function sharedStrings(xml) {
  const strings = [];
  if (!xml) return strings;
  let current = null;
  let inText = false;
  let inPhonetic = false;
  for (const t of xmlTokens(xml)) {
    if (t.text !== undefined) {
      if (inText && !inPhonetic && current !== null) current += t.text;
      continue;
    }
    if (t.name === "si") {
      if (t.open && !t.close) current = "";
      else if (t.close) {
        strings.push(current ?? "");
        current = null;
      }
    } else if (t.name === "rPh") inPhonetic = t.open && !t.close;
    else if (t.name === "t") inText = t.open && !t.close;
  }
  return strings;
}

function columnIndex(ref) {
  const letters = (ref || "").match(/^[A-Z]+/i)?.[0];
  if (!letters) return null;
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function rowsToLines(rows) {
  return rows
    .map((row) => row.map((v) => (v ?? "").replace(/[\t\n]+/g, " ")).join("\t").replace(/\t+$/, ""))
    .filter((line) => line.trim());
}

function worksheetLines(xml, shared, dates, date1904) {
  const rows = [];
  let row = null;
  let cell = null;
  let target = null;
  for (const t of xmlTokens(xml)) {
    if (t.text !== undefined) {
      if (cell && target) cell[target] += t.text;
      continue;
    }
    const { name } = t;
    if (name === "row" && t.open) row = [];
    if (name === "c" && t.open) {
      const col = columnIndex(attr(t.attrs, "r"));
      cell = { col: col ?? row?.length ?? 0, type: attr(t.attrs, "t") || "n", style: Number(attr(t.attrs, "s") || 0), v: "", is: "" };
    }
    if (cell && t.open && !t.close && name === "v") target = "v";
    else if (cell && t.open && !t.close && name === "t") target = "is";
    else if (t.close && (name === "v" || name === "t")) target = null;
    if (name === "c" && t.close && cell && row) {
      let value;
      if (cell.type === "s") value = shared[Number(cell.v)] ?? "";
      else if (cell.type === "inlineStr") value = cell.is;
      else if (cell.type === "b") value = cell.v === "1" ? "TRUE" : "FALSE";
      else if (cell.type === "str" || cell.type === "e") value = cell.v;
      else value = cell.v === "" ? "" : formatNumber(cell.v, dates.get(cell.style), date1904);
      if (cell.col < MAX_COLUMNS) row[cell.col] = value;
      cell = null;
    }
    if (name === "row" && t.close && row) {
      rows.push(Array.from(row, (v) => v ?? ""));
      row = null;
    }
  }
  return rowsToLines(rows);
}

function xlsxText(files) {
  const workbook = required(files, "xl/workbook.xml");
  const rels = relationships(files.get("xl/_rels/workbook.xml.rels"), "xl");
  const shared = sharedStrings(files.get("xl/sharedStrings.xml"));
  const dates = dateStyles(files.get("xl/styles.xml"));
  const blocks = [];
  let date1904 = false;
  for (const t of xmlTokens(workbook)) {
    if (t.open && t.name === "workbookPr") date1904 = /^(1|true)$/i.test(attr(t.attrs, "date1904") || "");
    if (!(t.open && t.name === "sheet")) continue;
    const name = attr(t.attrs, "name") || `Sheet ${blocks.length + 1}`;
    const xml = files.get(rels.get(attr(t.attrs, "r:id")));
    if (xml === undefined) continue; // chart sheets and missing parts
    blocks.push([`=== Sheet: ${name} ===`, ...worksheetLines(xml, shared, dates, date1904)].join("\n"));
  }
  if (!blocks.length) throw new OfficeError("damaged", "is damaged or not a valid file of this type (no worksheets)");
  return blocks.join("\n\n");
}

// ---- OpenDocument ----

function checkOdfEncryption(files) {
  if (/encryption-data/.test(files.get("META-INF/manifest.xml") || "")) {
    throw new OfficeError("encrypted", "is password-protected (encrypted)");
  }
}

// Text of ODT and ODP bodies. Paragraphs, headings (# by outline level), list items (-), tables and,
// for presentations, one block per page. Annotations and speaker notes are skipped.
function odfText(xml, { pages }) {
  const lines = [];
  const table = tableCollector();
  const paraStack = [];
  let skip = 0;
  let listDepth = 0;
  let pendingListItem = false;
  let page = 0;

  for (const t of xmlTokens(xml)) {
    if (t.text !== undefined) {
      if (!skip && paraStack.length) paraStack[paraStack.length - 1].text += t.text;
      continue;
    }
    const { name } = t;
    if (name === "office:annotation" || name === "presentation:notes") {
      if (t.open && !t.close) skip++;
      else if (!t.open && t.close) skip = Math.max(0, skip - 1);
      continue;
    }
    if (skip) continue;
    if (t.open) {
      if (pages && name === "draw:page") {
        page++;
        const title = attr(t.attrs, "draw:name");
        lines.push(`${page > 1 ? "\n" : ""}=== Slide ${page}${title && !/^page\d+$/i.test(title) ? `: ${title}` : ""} ===`);
      } else if (name === "table:table") table.startTable();
      else if (name === "table:table-row") table.startRow();
      else if (name === "table:table-cell" || name === "table:covered-table-cell") table.startCell();
      else if (name === "text:list") listDepth++;
      else if (name === "text:list-item") pendingListItem = true;
      else if ((name === "text:p" || name === "text:h") && !t.close) {
        const level = name === "text:h" ? Number(attr(t.attrs, "text:outline-level") || 1) : 0;
        const prefix = level ? `${"#".repeat(Math.min(level, 6))} ` : pendingListItem && listDepth ? "- " : "";
        pendingListItem = false;
        paraStack.push({ prefix, text: "" });
      } else if (paraStack.length && name === "text:tab") paraStack.at(-1).text += "\t";
      else if (paraStack.length && name === "text:line-break") paraStack.at(-1).text += "\n";
      else if (paraStack.length && name === "text:s") paraStack.at(-1).text += " ".repeat(Math.min(Number(attr(t.attrs, "text:c") || 1), 100));
    }
    if (t.close) {
      // A self-closing <text:p/> is an empty paragraph and never opened an entry on the stack.
      if ((name === "text:p" || name === "text:h") && t.open) {
        if (!paraStack.length && !table.depth) lines.push("");
      } else if ((name === "text:p" || name === "text:h") && paraStack.length) {
        const { prefix, text } = paraStack.pop();
        const line = text.trim() ? prefix + text : "";
        if (paraStack.length) paraStack.at(-1).text += (paraStack.at(-1).text ? " " : "") + line;
        else if (table.depth) table.addToCell(line);
        else lines.push(line);
      } else if (name === "text:list") listDepth = Math.max(0, listDepth - 1);
      else if (name === "table:table-cell" || name === "table:covered-table-cell") table.endCell();
      else if (name === "table:table-row") {
        const line = table.endRow();
        if (line !== null) lines.push(line);
      } else if (name === "table:table") table.endTable();
    }
  }
  return lines.join("\n");
}

// ODS: one block per sheet. Cells carry their displayed text in text:p, so no number formatting is
// needed. Repeated empty cells and rows (often up to the sheet's end) are not expanded.
function odsText(xml) {
  const blocks = [];
  let sheet = null;
  let row = null;
  let rowRepeat = 1;
  let cell = null;
  let para = null;
  let skip = 0;

  for (const t of xmlTokens(xml)) {
    if (t.text !== undefined) {
      if (!skip && para !== null) para += t.text;
      continue;
    }
    const { name } = t;
    if (name === "office:annotation") {
      if (t.open && !t.close) skip++;
      else if (!t.open && t.close) skip = Math.max(0, skip - 1);
      continue;
    }
    if (skip) continue;
    if (t.open) {
      if (name === "table:table") sheet = { name: attr(t.attrs, "table:name") || `Sheet ${blocks.length + 1}`, rows: [] };
      else if (name === "table:table-row") {
        row = { cells: [], pendingEmpty: 0 };
        rowRepeat = Number(attr(t.attrs, "table:number-rows-repeated") || 1);
      } else if (name === "table:table-cell" || name === "table:covered-table-cell") {
        cell = { text: "", repeat: Number(attr(t.attrs, "table:number-columns-repeated") || 1) };
      } else if (name === "text:p" && !t.close) para = "";
      else if (para !== null && name === "text:tab") para += "\t";
      else if (para !== null && name === "text:line-break") para += " ";
      else if (para !== null && name === "text:s") para += " ".repeat(Math.min(Number(attr(t.attrs, "text:c") || 1), 100));
    }
    if (t.close) {
      if (name === "text:p" && para !== null) {
        if (cell) cell.text = cell.text ? `${cell.text} ${para}` : para;
        para = null;
      } else if ((name === "table:table-cell" || name === "table:covered-table-cell") && cell && row) {
        if (cell.text) {
          for (let i = 0; i < row.pendingEmpty && row.cells.length < MAX_COLUMNS; i++) row.cells.push("");
          row.pendingEmpty = 0;
          for (let i = 0; i < cell.repeat && row.cells.length < MAX_COLUMNS; i++) row.cells.push(cell.text);
        } else row.pendingEmpty += cell.repeat;
        cell = null;
      } else if (name === "table:table-row" && row && sheet) {
        if (row.cells.length) for (let i = 0; i < Math.min(rowRepeat, MAX_REPEATED_ROWS); i++) sheet.rows.push(row.cells);
        row = null;
      } else if (name === "table:table" && sheet) {
        blocks.push([`=== Sheet: ${sheet.name} ===`, ...rowsToLines(sheet.rows)].join("\n"));
        sheet = null;
      }
    }
  }
  if (!blocks.length) throw new OfficeError("damaged", "is damaged or not a valid file of this type (no sheets)");
  return blocks.join("\n\n");
}

// ---- Entry point ----

const WANTED = {
  docx: (n) => n === "word/document.xml",
  pptx: (n) => n === "ppt/presentation.xml" || n === "ppt/_rels/presentation.xml.rels" || /^ppt\/slides\/slide\d+\.xml$/.test(n),
  xlsx: (n) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/.test(n),
  odt: (n) => n === "content.xml" || n === "META-INF/manifest.xml",
  ods: (n) => n === "content.xml" || n === "META-INF/manifest.xml",
  odp: (n) => n === "content.xml" || n === "META-INF/manifest.xml",
};

// Returns the normalized text of an Office/ODF file. Throws OfficeError (reason: encrypted, damaged,
// too-large) when it cannot be read.
export function extractOfficeText(buffer, kind) {
  const want = WANTED[kind];
  if (!want) throw new OfficeError("unsupported", "is not a supported document type");
  const { names, files } = openZip(buffer, want);
  let text;
  if (kind === "docx") text = docxText(files);
  else if (kind === "pptx") text = pptxText(files, names);
  else if (kind === "xlsx") text = xlsxText(files);
  else {
    checkOdfEncryption(files);
    const content = required(files, "content.xml");
    text = kind === "ods" ? odsText(content) : odfText(content, { pages: kind === "odp" });
  }
  return normalizeText(text);
}
