import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { serverInstructions } from "./modes.js";
import { SERVER_VERSION } from "./version.js";
import { CONFIG, assertCredentials, assertMode, assertLocale, logStartupConfig } from "./config.js";
import { shutdownConnections } from "./connections.js";
import { registerMailboxTools } from "./tools/mailbox.js";
import { registerComposeTools } from "./tools/compose.js";
import { registerLabelTools } from "./tools/labels.js";

assertMode();
assertLocale();
assertCredentials();
logStartupConfig();

const server = new McpServer({ name: "proton-mail", version: SERVER_VERSION }, { instructions: serverInstructions(CONFIG.mode) });
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
