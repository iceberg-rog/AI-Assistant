/**
 * Loads Shelter/.env into process.env as an import SIDE EFFECT, so config flags
 * (which read process.env at module-eval time) see the real values.
 * MUST be the very first import in any entrypoint (run-live, etc).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
try {
  const txt = fs.readFileSync(path.join(__dir, "..", ".env"), "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}
