// Serves a photo the user sent (saved by the connector to data/media). Read-only, sanitized.
import fs from "node:fs";
import path from "node:path";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const f = new URL(req.url).searchParams.get("f") || "";
  if (!/^[a-z0-9_]+\.jpg$/i.test(f)) return new Response("bad name", { status: 400 });
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), "data", "media", f));
    return new Response(buf, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
