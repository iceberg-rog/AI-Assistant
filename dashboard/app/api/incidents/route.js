// Incident / announcement injection — admin posts a temporary rule (default 24h):
// "anyone who mentions X (or whose topic is Y) → tell them <message>".
// Writes data/incidents.json, which the live connector reads (mtime-cached, picks up in seconds).
import fs from "node:fs";
import path from "node:path";
export const dynamic = "force-dynamic";

const FILE = () => path.join(process.cwd(), "data", "incidents.json");
function read() { try { return JSON.parse(fs.readFileSync(FILE(), "utf8")).incidents || []; } catch { return []; } }
function write(list) { fs.writeFileSync(FILE(), JSON.stringify({ generatedAt: new Date().toISOString(), incidents: list }, null, 2), "utf8"); }

export async function GET() {
  const now = Date.now();
  const list = read().map((i) => ({ ...i, active: i.enabled && new Date(i.expiresAt).getTime() > now }));
  return Response.json({ incidents: list });
}

export async function POST(req) {
  let b;
  try { b = await req.json(); } catch { return Response.json({ ok: false, error: "bad json" }, { status: 400 }); }
  const message = (b.message || "").trim();
  if (!message) return Response.json({ ok: false, error: "message required" }, { status: 400 });
  const hours = Number(b.hours) > 0 ? Number(b.hours) : 24;
  const inc = {
    id: "inc_" + Date.now().toString(36),
    message,
    scope: b.scope === "all" ? "all" : "match",
    mode: b.mode === "replace" ? "replace" : "prepend",
    keywords: Array.isArray(b.keywords) ? b.keywords.map((s) => String(s).trim()).filter(Boolean) : (b.keywords || "").split(/[,،\n]/).map((s) => s.trim()).filter(Boolean),
    intents: Array.isArray(b.intents) ? b.intents.filter(Boolean) : [],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + hours * 3600_000).toISOString(),
    enabled: true,
    note: b.note ? String(b.note).slice(0, 200) : undefined,
    hits: 0,
  };
  const list = read();
  list.unshift(inc);
  try { write(list); } catch (e) { return Response.json({ ok: false, error: e.message }, { status: 500 }); }
  return Response.json({ ok: true, incident: inc });
}

export async function DELETE(req) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ ok: false, error: "id required" }, { status: 400 });
  const mode = new URL(req.url).searchParams.get("mode"); // "expire" keeps the audit row
  let list = read();
  if (mode === "expire") {
    const inc = list.find((i) => i.id === id);
    if (inc) { inc.enabled = false; inc.expiresAt = new Date().toISOString(); }
  } else {
    list = list.filter((i) => i.id !== id);
  }
  try { write(list); } catch (e) { return Response.json({ ok: false, error: e.message }, { status: 500 }); }
  return Response.json({ ok: true });
}
