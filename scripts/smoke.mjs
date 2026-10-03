// End-to-end check against the running Proton Bridge via the built server.
// Read-only by default; --drafts additionally creates, updates and deletes drafts addressed to yourself
// (new, reply and forward). --labels creates a temporary label, puts it on a draft to yourself,
// removes it again, deletes the draft and finally the label (the label via IMAP, as the server offers
// no deletion). Nothing is ever sent.
import { ImapFlow } from "imapflow";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CONFIG } from "../src/config.js";

const withDrafts = process.argv.includes("--drafts");
const withLabels = process.argv.includes("--labels");
const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ["dist/server.mjs"] }));

async function call(name, args = {}) {
  const started = Date.now();
  const result = await client.callTool({ name, arguments: args });
  const first = result.content?.[0]?.text ?? "";
  console.log(`\n### ${name} ${JSON.stringify(args)} – ${Date.now() - started} ms${result.isError ? " – ERROR" : ""}`);
  console.log(first.slice(0, 600) + (first.length > 600 ? `\n… (${first.length} chars)` : ""));
  for (const block of result.content.slice(1)) console.log(`[+ ${block.type} block${block.mimeType ? " " + block.mimeType : ""}]`);
  if (result.isError) process.exitCode = 1;
  return { result, text: first, json: () => JSON.parse(first) };
}

console.log("instructions:", client.getInstructions());
const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));

const folders = (await call("list_folders")).json();
const inbox = (await call("list_emails", { limit: 5 })).json();
const newest = inbox.messages[0];
await call("read_email", { uid: newest.uid, maxChars: 1500 });
await call("search_emails", { folder: "All Mail", text: "Rechnung", limit: 3 });
await call("search_emails", { folder: "INBOX", answered: false, hasAttachments: true, limit: 3 });

// A conversation: the newest own reply in Sent pulls in what it answers.
const sent = folders.find((f) => f.specialUse === "\\Sent")?.path;
if (sent) {
  const latestSent = (await call("list_emails", { folder: sent, limit: 1 })).json().messages[0];
  if (latestSent) {
    const thread = (await call("get_thread", { uid: latestSent.uid, folder: sent, maxChars: 3000 })).json();
    console.log(`thread: ${thread.count} messages, truncated=${thread.truncated}, foldersChecked=${thread.foldersChecked.join(", ")}`);
  }
}

if (withDrafts) {
  const self = process.env.SMOKE_SELF || CONFIG.from;
  const created = (await call("create_draft", { to: self, subject: "MCP Smoke-Test Entwurf", body: "Erste Fassung." })).json();
  await call("list_drafts", { limit: 3 });
  const updated = (await call("update_draft", { uid: created.draftUid, body: "Zweite Fassung." })).json();
  await call("read_email", { uid: updated.draftUid, folder: updated.folder });
  const reply = (await call("create_draft", { replyToUid: newest.uid, body: "Antwortentwurf (Smoke-Test)." })).json();
  await call("read_email", { uid: reply.draftUid, folder: reply.folder, maxChars: 800 });
  const forward = (await call("create_draft", { forwardUid: newest.uid, body: "Weiterleitungsentwurf (Smoke-Test)." })).json();
  await call("read_email", { uid: forward.draftUid, folder: forward.folder, maxChars: 800 });
  await call("delete_draft", { uid: updated.draftUid });
  await call("delete_draft", { uid: reply.draftUid });
  await call("delete_draft", { uid: forward.draftUid });
}

if (withLabels) {
  const self = process.env.SMOKE_SELF || CONFIG.from;
  const name = `MCP-Smoke-${Date.now()}`;
  await call("create_folder", { name, type: "label" });
  let draft;
  try {
    draft = (await call("create_draft", { to: self, subject: "MCP Smoke-Test Label", body: "Wird wieder gelöscht." })).json();
    await call("label_email", { uid: draft.draftUid, folder: draft.folder, label: name, action: "add" });
    const labeled = (await call("list_emails", { folder: `Labels/${name}`, limit: 5 })).json();
    console.log(`label check: ${labeled.total} message(s) in Labels/${name}`);
    await call("label_email", { uid: draft.draftUid, folder: draft.folder, label: name, action: "remove" });
    const after = (await call("list_emails", { folder: `Labels/${name}`, limit: 5 })).json();
    const still = (await call("list_drafts", { limit: 20 })).json().drafts.some((d) => d.uid === draft.draftUid);
    console.log(`label check after remove: ${after.total} in label, draft still in Drafts: ${still}`);
  } finally {
    if (draft) await call("delete_draft", { uid: draft.draftUid });
    const imap = new ImapFlow({ host: CONFIG.host, port: CONFIG.imapPort, secure: false, auth: { user: CONFIG.username, pass: CONFIG.password }, tls: { rejectUnauthorized: false }, logger: false });
    imap.on("error", () => {});
    await imap.connect();
    await imap.mailboxDelete(`Labels/${name}`);
    await imap.logout();
    console.log(`cleanup: Labels/${name} deleted`);
  }
}

await client.close();
