import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { serverInstructions } from "./modes.js";
import { CONFIG, assertCredentials, assertMode, logStartupConfig } from "./config.js";
import { shutdownConnections } from "./connections.js";
import { registerMailboxTools } from "./tools/mailbox.js";
import { registerComposeTools } from "./tools/compose.js";
import { registerLabelTools } from "./tools/labels.js";

assertMode();
assertCredentials();
logStartupConfig();

const server = new McpServer({ name: "proton-mail", version: "1.0.0" }, { instructions: serverInstructions(CONFIG.mode) });
registerMailboxTools(server);
registerComposeTools(server);
registerLabelTools(server);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    shutdownConnections().finally(() => process.exit(0));
  });
}
process.stdin.once("close", () => {
  shutdownConnections().finally(() => process.exit(0));
});

await server.connect(new StdioServerTransport());
