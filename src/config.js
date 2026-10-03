import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parseLocale, parseTimeZone } from "./locale.js";

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

export const MODES = ["read-only", "drafts", "full"];
export const DEFAULT_MODE = "drafts";

// Validates the operating mode; empty/unset falls back to the default.
export function parseMode(value) {
  const mode = (value ?? "").trim() || DEFAULT_MODE;
  if (!MODES.includes(mode)) {
    throw new Error(
      `Invalid PROTON_MCP_MODE "${mode}". Valid values: ${MODES.map((m) => `"${m}"`).join(", ")}.`
    );
  }
  return mode;
}

export function expandHome(p, home) {
  if (p === "~") return home;
  if (p.startsWith("~/")) return join(home, p.slice(2));
  return p;
}

// Parses PROTON_MCP_ATTACHMENT_ROOTS: comma-separated, "~" expanded, trimmed, empty entries dropped.
// Returns the string "*" for unrestricted access, otherwise an array of paths (not realpath-resolved).
// Unset/empty yields the defaults: ~/Downloads, ~/Documents, ~/Desktop and attachmentDir.
export function parseAttachmentRoots(value, attachmentDir, home = homedir()) {
  const entries = (value ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (entries.length === 0) {
    return [join(home, "Downloads"), join(home, "Documents"), join(home, "Desktop"), attachmentDir];
  }
  if (entries.length === 1 && entries[0] === "*") return "*";
  return entries.map((e) => expandHome(e, home));
}

// Parses a non-negative integer setting. Anything else (empty, "abc", "1.5", "-3") falls back to the
// default and reports one line naming the variable via `warn`. 0 is accepted as a value.
export function parseNonNegativeInt(name, raw, fallback, warn = (line) => console.error(line)) {
  const text = String(raw).trim();
  if (/^\d+$/.test(text)) {
    const value = Number(text);
    if (Number.isSafeInteger(value)) return value;
  }
  warn(`proton-mail-mcp: ignoring invalid ${name}="${raw}" (expected a non-negative integer), using ${fallback}`);
  return fallback;
}

// Environment variables win over the credentials file.
function loadConfig() {
  const file = readCredentialsFile();
  const get = (key, fallback) => process.env[key] || file[key] || fallback;
  const getInt = (key, fallback) => parseNonNegativeInt(key, get(key, String(fallback)), fallback);

  const username = get("PROTON_BRIDGE_USERNAME");
  const password = get("PROTON_BRIDGE_PASSWORD");
  const fromAddress = get("PROTON_BRIDGE_FROM", username);
  const fromName = get("PROTON_BRIDGE_FROM_NAME", "");
  const aliases = get("PROTON_BRIDGE_ALIASES", "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);

  const attachmentDir = get("PROTON_MCP_ATTACHMENT_DIR", join(homedir(), "Downloads", "Proton-Anhänge"));

  // An invalid mode must not exit on import (tests); assertMode() reports it at startup.
  let mode;
  let modeError;
  try {
    mode = parseMode(get("PROTON_MCP_MODE"));
  } catch (err) {
    modeError = err.message;
  }

  // Like the mode: invalid values are reported by assertLocale() at startup, not on import.
  const startupErrors = [];
  let locale;
  let timeZone;
  try {
    locale = parseLocale(get("PROTON_MCP_LOCALE"));
  } catch (err) {
    startupErrors.push(err.message);
  }
  try {
    timeZone = parseTimeZone(get("PROTON_MCP_TIMEZONE"));
  } catch (err) {
    startupErrors.push(err.message);
  }

  return {
    mode,
    modeError,
    locale,
    timeZone,
    localeErrors: startupErrors,
    attachmentRoots: parseAttachmentRoots(get("PROTON_MCP_ATTACHMENT_ROOTS"), attachmentDir),
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
    attachmentDir,
    // Message cache and large-message handling (see message-cache.js). A cache size of 0 disables the cache.
    cacheMaxBytes: getInt("PROTON_MCP_CACHE_MAX_BYTES", 67108864),
    cacheTtlMs: getInt("PROTON_MCP_CACHE_TTL_MS", 600000),
    partialFetchBytes: getInt("PROTON_MCP_PARTIAL_FETCH_BYTES", 5242880),
    maxInlineImageBytes: getInt("PROTON_MCP_MAX_INLINE_IMAGE_BYTES", 1048576),
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

export function assertMode() {
  if (CONFIG.modeError) {
    console.error(`Error: ${CONFIG.modeError}`);
    process.exit(1);
  }
}

export function assertLocale() {
  if (CONFIG.localeErrors.length) {
    for (const message of CONFIG.localeErrors) console.error(`Error: ${message}`);
    process.exit(1);
  }
}

// stderr only — stdout is the MCP channel.
export function logStartupConfig() {
  const roots = CONFIG.attachmentRoots === "*" ? "* (unrestricted)" : CONFIG.attachmentRoots.join(", ");
  console.error(`proton-mail-mcp: mode=${CONFIG.mode}`);
  console.error(`proton-mail-mcp: locale=${CONFIG.locale} timezone=${CONFIG.timeZone}`);
  console.error(`proton-mail-mcp: attachment roots=${roots}`);
}
