import { readFileSync } from "node:fs";

/** Parse dotenv-style text (KEY=VALUE, # comments, optional quotes, optional `export`). */
export function parseDotEnv(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    const q = v.match(/^(['"])(.*?)\1(?:\s+#.*)?$/);
    if (q) v = q[2];
    else v = v.replace(/\s+#.*$/, ""); // inline comment on unquoted values
    out[m[1]] = v;
  }
  return out;
}

/** Load a .env file into process.env without overriding variables already set. Never logs values. */
export function loadDotEnv(path: string | URL): boolean {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return false;
  }
  for (const [k, v] of Object.entries(parseDotEnv(raw))) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
  return true;
}
