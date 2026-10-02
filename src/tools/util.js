import { CONFIG } from "../config.js";
import { toolAvailable } from "../modes.js";
import { TOOL_META } from "./annotations.js";
import { NotFoundError } from "../connections.js";
import { formatAddress } from "../content.js";

export function text(value) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

function errorResult(error) {
  const message = error instanceof NotFoundError ? error.message : `Error: ${error?.message || error}`;
  return { content: [{ type: "text", text: message }], isError: true };
}

// Registers a tool whose handler errors are returned to the model instead of crashing the call.
// `config.modes` lists the operating modes the tool exists in; in any other mode it is not registered.
export function defineTool(server, name, { modes, ...config }, handler, mode = CONFIG.mode) {
  if (!toolAvailable(modes, mode)) return false;
  const meta = TOOL_META[name];
  if (!meta) throw new Error(`No title/annotations defined for tool ${name}`);
  server.registerTool(name, { ...meta, ...config }, async (args) => {
    try {
      return await handler(args);
    } catch (error) {
      return errorResult(error);
    }
  });
  return true;
}

// imapflow bodyStructure → true if any part is a real (non-inline) attachment.
export function hasAttachments(node) {
  if (!node) return false;
  if (node.disposition === "attachment") return true;
  return (node.childNodes || []).some(hasAttachments);
}

export function envelopeAddresses(list) {
  return (list || []).map(formatAddress).join(", ");
}

export function summarize(msg) {
  return {
    uid: msg.uid,
    date: msg.envelope?.date?.toISOString?.() || null,
    from: envelopeAddresses(msg.envelope?.from),
    to: envelopeAddresses(msg.envelope?.to),
    subject: msg.envelope?.subject || "(no subject)",
    unread: !msg.flags?.has("\\Seen"),
    flagged: msg.flags?.has("\\Flagged") || false,
    hasAttachments: hasAttachments(msg.bodyStructure),
    size: msg.size,
  };
}

export const SUMMARY_FETCH = { envelope: true, uid: true, flags: true, bodyStructure: true, size: true };
