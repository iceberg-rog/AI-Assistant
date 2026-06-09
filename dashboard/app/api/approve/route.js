// Proxies an operator-approved draft to the connector's control server (which owns the Telegram token),
// then marks the draft handled so it leaves the pending list even if the feedback call doesn't land.
import fs from "node:fs";
import path from "node:path";
export const dynamic = "force-dynamic";

function markHandled(draftId, action) {
  if (!draftId) return;
  const f = path.join(process.cwd(), "data", "handled_drafts.json");
  let h = { handled: {} };
  try { h = JSON.parse(fs.readFileSync(f, "utf8")); } catch {}
  h.handled = h.handled || {};
  h.handled[draftId] = { action: action || "approved", at: new Date().toISOString() };
  try { fs.writeFileSync(f, JSON.stringify(h, null, 2), "utf8"); } catch {}
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  if (!body?.chatId || !body?.text) {
    return Response.json({ ok: false, error: "chatId و text لازم است" }, { status: 400 });
  }
  try {
    const r = await fetch("http://127.0.0.1:4050/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chatId: body.chatId, text: body.text, businessConnectionId: body.businessConnectionId }),
    });
    const data = await r.json();
    if (data?.ok) markHandled(body.draftId, "approved"); // sent → never resurface as pending
    return Response.json(data, { status: r.status });
  } catch (e) {
    return Response.json({ ok: false, error: "connector در دسترس نیست (روی پورت 4050). آیا run-live.ts روشن است؟" }, { status: 502 });
  }
}
