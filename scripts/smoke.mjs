// End-to-end check against the running Proton Bridge via the built server.
// Read-only by default; --drafts additionally creates, updates and deletes a draft addressed to yourself.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const withDrafts = process.argv.includes("--drafts");
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

const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));

await call("list_folders");
const inbox = (await call("list_emails", { limit: 5 })).json();
const newest = inbox.messages[0];
await call("read_email", { uid: newest.uid, maxChars: 1500 });
await call("search_emails", { folder: "All Mail", text: "Rechnung", limit: 3 });

if (withDrafts) {
  const self = process.env.SMOKE_SELF;
  const created = (await call("create_draft", { to: self, subject: "MCP Smoke-Test Entwurf", body: "Erste Fassung." })).json();
  await call("list_drafts", { limit: 3 });
  const updated = (await call("update_draft", { uid: created.draftUid, body: "Zweite Fassung." })).json();
  await call("read_email", { uid: updated.draftUid, folder: updated.folder });
  const reply = (await call("create_draft", { replyToUid: newest.uid, body: "Antwortentwurf (Smoke-Test)." })).json();
  await call("read_email", { uid: reply.draftUid, folder: reply.folder, maxChars: 800 });
  await call("delete_draft", { uid: updated.draftUid });
  await call("delete_draft", { uid: reply.draftUid });
}

await client.close();
