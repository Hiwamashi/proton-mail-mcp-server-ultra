import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { assertCredentials } from "./config.js";
import { shutdownConnections } from "./connections.js";
import { registerMailboxTools } from "./tools/mailbox.js";
import { registerComposeTools } from "./tools/compose.js";

assertCredentials();

const server = new McpServer({ name: "proton-mail", version: "1.0.0" });
registerMailboxTools(server);
registerComposeTools(server);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    shutdownConnections().finally(() => process.exit(0));
  });
}
process.stdin.once("close", () => {
  shutdownConnections().finally(() => process.exit(0));
});

await server.connect(new StdioServerTransport());
