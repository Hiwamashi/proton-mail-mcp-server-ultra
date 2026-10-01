import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CREDENTIALS_PATH = join(homedir(), ".proton-bridge-credentials");

// Reads KEY=VALUE lines; values may be wrapped in single or double quotes.
function readCredentialsFile() {
  let raw;
  try {
    raw = readFileSync(CREDENTIALS_PATH, "utf-8");
  } catch {
    return {};
  }
  const values = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    values[key] = val;
  }
  return values;
}

// Environment variables win over the credentials file.
function loadConfig() {
  const file = readCredentialsFile();
  const get = (key, fallback) => process.env[key] || file[key] || fallback;

  const username = get("PROTON_BRIDGE_USERNAME");
  const password = get("PROTON_BRIDGE_PASSWORD");
  const fromAddress = get("PROTON_BRIDGE_FROM", username);
  const fromName = get("PROTON_BRIDGE_FROM_NAME", "");
  const aliases = get("PROTON_BRIDGE_ALIASES", "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);

  return {
    host: get("PROTON_BRIDGE_HOST", "127.0.0.1"),
    imapPort: parseInt(get("PROTON_BRIDGE_IMAP_PORT", "1143"), 10),
    smtpPort: parseInt(get("PROTON_BRIDGE_SMTP_PORT", "1025"), 10),
    // Bridge SMTP listens in plaintext and upgrades via STARTTLS. Set to "true" for implicit TLS.
    smtpSecure: get("PROTON_BRIDGE_SMTP_SECURE", "false") === "true",
    username,
    password,
    from: fromName ? { name: fromName, address: fromAddress } : fromAddress,
    selfAddresses: [...new Set([username, fromAddress, ...aliases].filter(Boolean).map((a) => a.toLowerCase()))],
    imapIdleTimeoutMs: parseInt(get("PROTON_BRIDGE_IDLE_TIMEOUT_MS", "300000"), 10),
    attachmentDir: get("PROTON_MCP_ATTACHMENT_DIR", join(homedir(), "Downloads", "Proton-Anhänge")),
  };
}

export const CONFIG = loadConfig();

export function assertCredentials() {
  if (!CONFIG.username || !CONFIG.password) {
    console.error(
      "Error: Proton Bridge credentials not found.\n" +
        "Either set PROTON_BRIDGE_USERNAME and PROTON_BRIDGE_PASSWORD environment variables,\n" +
        `or create ${CREDENTIALS_PATH} with:\n\n` +
        "  PROTON_BRIDGE_USERNAME=your-email@proton.me\n" +
        "  PROTON_BRIDGE_PASSWORD=your-bridge-password\n"
    );
    process.exit(1);
  }
}
