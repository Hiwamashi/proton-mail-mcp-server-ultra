import { realpath, stat } from "node:fs/promises";
import { isAbsolute, sep } from "node:path";
import { homedir } from "node:os";
import { CONFIG, expandHome } from "./config.js";

const warned = new Set();

// stderr only — stdout is the MCP channel.
function warnOnce(message) {
  if (warned.has(message)) return;
  warned.add(message);
  console.error(`proton-mail-mcp: ${message}`);
}

// Real paths of the configured roots. Relative or non-existent roots are ignored with a warning.
// A "*" entry inside an array is a literal path, not the wildcard (only a lone "*" yields the string "*").
async function resolveRoots(roots) {
  const resolved = [];
  for (const root of roots) {
    if (!isAbsolute(root)) {
      warnOnce(`ignoring attachment root "${root}": not an absolute path`);
      continue;
    }
    try {
      resolved.push(await realpath(root));
    } catch {
      warnOnce(`ignoring attachment root "${root}": does not exist`);
    }
  }
  return resolved;
}

function refusal(path, roots) {
  const allowed = roots === "*" ? "any directory" : roots.length ? roots.join(", ") : "none";
  return new Error(
    `Attachment refused: ${path} is not an allowed attachment file. ` +
      `Allowed directories: ${allowed}. Hidden files and folders (names starting with ".") are never allowed. ` +
      `Change the allowed directories with PROTON_MCP_ATTACHMENT_ROOTS.`
  );
}

const hasHiddenSegment = (relative) => relative.split(sep).some((segment) => segment.startsWith("."));

// Returns the real path of a file that may be attached, or throws.
// Checks: absolute path (after "~"), realpath (symlinks, ".."), regular file, inside a root,
// no hidden segment below the root. roots "*" skips only the root check.
export async function assertAttachable(path, roots = CONFIG.attachmentRoots, home = homedir()) {
  const expanded = expandHome(path, home);
  if (!isAbsolute(expanded)) {
    throw new Error(`Attachment path must be absolute: ${path}`);
  }

  let real;
  let info;
  try {
    real = await realpath(expanded);
    info = await stat(real);
  } catch {
    throw new Error(`Attachment file not found: ${path}`);
  }
  if (!info.isFile()) throw refusal(path, roots);

  if (roots === "*") {
    if (hasHiddenSegment(real)) throw refusal(path, roots);
    return real;
  }

  for (const root of await resolveRoots(roots)) {
    const prefix = root.endsWith(sep) ? root : root + sep;
    if (real.startsWith(prefix) && !hasHiddenSegment(real.slice(prefix.length))) return real;
  }
  throw refusal(path, roots);
}
