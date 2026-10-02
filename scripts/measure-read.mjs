// Timing of read_email + get_attachment(0) through the built server (npm run build first).
// READ-ONLY. Usage: node scripts/measure-read.mjs <uid> [folder="All Mail"]
// Cache and partial settings are taken from the environment (PROTON_MCP_CACHE_MAX_BYTES,
// PROTON_MCP_PARTIAL_FETCH_BYTES). Prints only tool names, sizes of the answer and timings.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const uid = Number(process.argv[2]);
const folder = process.argv[3] || "All Mail";
const client = new Client({ name: "measure", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ["dist/server.mjs"], env: { ...process.env } }));

async function time(label, name, args) {
  const started = Date.now();
  const result = await client.callTool({ name, arguments: args });
  const chars = result.content.reduce((n, b) => n + (b.text?.length ?? b.data?.length ?? 0), 0);
  console.log(`${label}\t${name}\t${Date.now() - started} ms\t${result.isError ? "ERROR" : "ok"}\t${chars} chars`);
}

await time("1", "read_email", { uid, folder });
await time("2", "get_attachment", { uid, folder, index: 0 });
await time("3", "read_email", { uid, folder });
await time("4", "get_attachment", { uid, folder, index: 0 });
await client.close();
