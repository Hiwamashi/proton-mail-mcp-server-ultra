import { mkdir, writeFile, access } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { simpleParser } from "mailparser";
import { CONFIG } from "./config.js";
import { extractBody, formatAddresses, formatSize, htmlToText, normalizeText, paginate, describeAttachments } from "./content.js";

const INLINE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;
const TEXT_TYPES = /^(text\/|application\/(json|xml|csv|x-csv|yaml|x-yaml|javascript|ics)|.*\+xml$)/i;
const TEXT_EXTENSIONS = new Set([".txt", ".csv", ".json", ".xml", ".md", ".log", ".ics", ".vcf", ".yaml", ".yml"]);

function sanitizeFilename(name) {
  const cleaned = basename(name || "anhang")
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, "_")
    .trim();
  return cleaned || "anhang";
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function saveAttachment(attachment, uid, directory = CONFIG.attachmentDir) {
  await mkdir(directory, { recursive: true });
  const filename = sanitizeFilename(attachment.filename || `uid-${uid}${extname(attachment.contentType || "")}`);
  const ext = extname(filename);
  const stem = filename.slice(0, filename.length - ext.length);
  let target = join(directory, filename);
  for (let n = 1; await exists(target); n++) {
    target = join(directory, `${stem} (${n})${ext}`);
  }
  await writeFile(target, attachment.content);
  return target;
}

async function extractPdfText(buffer) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  return { totalPages, text: normalizeText(text) };
}

function isText(attachment) {
  return TEXT_TYPES.test(attachment.contentType || "") || TEXT_EXTENSIONS.has(extname(attachment.filename || "").toLowerCase());
}

function pagedText(header, text, offset, maxChars) {
  const page = paginate(text, offset, maxChars);
  const range = page.total ? `chars ${page.start}–${page.end} of ${page.total}` : "empty";
  const more = page.nextOffset !== null ? ` – call again with offset=${page.nextOffset} for more` : "";
  return `${header}\nContent: ${range}${more}\n---\n${page.chunk}`;
}

// Converts an attachment into MCP content blocks. Falls back to saving it to disk.
export async function attachmentToContent(attachment, { uid, index, offset = 0, maxChars = 20000, save = false }) {
  const name = attachment.filename || "(unnamed)";
  const type = (attachment.contentType || "application/octet-stream").toLowerCase();
  const header = `Attachment [${index}] ${name} (${type}, ${formatSize(attachment.size)}) from UID ${uid}`;

  if (save) {
    const path = await saveAttachment(attachment, uid);
    return [{ type: "text", text: `${header}\nSaved to: ${path}` }];
  }

  if (INLINE_IMAGE_TYPES.has(type) && attachment.size <= MAX_INLINE_IMAGE_BYTES) {
    return [
      { type: "text", text: header },
      { type: "image", data: attachment.content.toString("base64"), mimeType: type },
    ];
  }

  if (type === "application/pdf" || extname(name).toLowerCase() === ".pdf") {
    try {
      const { totalPages, text } = await extractPdfText(attachment.content);
      if (text) return [{ type: "text", text: pagedText(`${header}\nPDF pages: ${totalPages}`, text, offset, maxChars) }];
    } catch {
      // fall through to saving; the PDF may be encrypted or damaged
    }
    const path = await saveAttachment(attachment, uid);
    return [{ type: "text", text: `${header}\nNo extractable text (scanned or protected PDF). Saved to: ${path}` }];
  }

  if (type === "message/rfc822" || extname(name).toLowerCase() === ".eml") {
    const inner = await simpleParser(attachment.content);
    const { body } = extractBody(inner);
    const innerAttachments = describeAttachments(inner.attachments).map((a) => `  - ${a.filename} (${a.contentType}, ${formatSize(a.size)})`);
    const meta = [
      header,
      `Embedded message`,
      `From: ${formatAddresses(inner.from)}`,
      `To: ${formatAddresses(inner.to)}`,
      inner.cc ? `Cc: ${formatAddresses(inner.cc)}` : null,
      `Date: ${inner.date?.toISOString() || ""}`,
      `Subject: ${inner.subject || "(no subject)"}`,
      innerAttachments.length ? `Attachments:\n${innerAttachments.join("\n")}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    return [{ type: "text", text: pagedText(meta, body, offset, maxChars) }];
  }

  if (isText(attachment)) {
    const raw = attachment.content.toString("utf-8");
    const text = type === "text/html" ? htmlToText(raw, { includeLinks: true }) : raw;
    return [{ type: "text", text: pagedText(header, text, offset, maxChars) }];
  }

  const path = await saveAttachment(attachment, uid);
  return [{ type: "text", text: `${header}\nThis file type cannot be shown directly. Saved to: ${path}` }];
}
