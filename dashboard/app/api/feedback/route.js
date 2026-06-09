// Captures the operator's action on each draft (approve / edit / reject) as a learning signal,
// AND marks the draft handled so it won't reappear as a pending draft after the page refreshes.
// An EDIT = the human correcting the bot = the best training data. Append-only queue.
import fs from "node:fs";
import path from "node:path";
import { isRealConv } from "@/lib/data";
export const dynamic = "force-dynamic";

const LEARN = () => path.join(process.cwd(), "data", "learning_queue.json");
const HANDLED = () => path.join(process.cwd(), "data", "handled_drafts.json");

export async function GET() {
  let handled = {};
  try { handled = JSON.parse(fs.readFileSync(HANDLED(), "utf8")).handled || {}; } catch {}
  return Response.json({ handled });
}

export async function POST(req) {
  let b;
  try { b = await req.json(); } catch { return Response.json({ ok: false }, { status: 400 }); }

  // refuse to record a learning item for a test/junk conversation — stops pollution at the source
  if (!isRealConv(b.conversationId)) return Response.json({ ok: false, error: "not a real conversation" }, { status: 422 });

  // 1) learning queue (edit = best training data)
  let q = { items: [] };
  try { q = JSON.parse(fs.readFileSync(LEARN(), "utf8")); } catch {}
  q.items = q.items || [];
  q.items.unshift({
    at: new Date().toISOString(),
    action: b.action || "unknown", // approved | edited | rejected
    conversationId: b.conversationId || null,
    intent: b.intent || null,
    botDraft: (b.botDraft || "").slice(0, 2000),
    sentText: (b.sentText || "").slice(0, 2000),
  });
  if (q.items.length > 500) q.items = q.items.slice(0, 500);
  try { fs.writeFileSync(LEARN(), JSON.stringify(q, null, 2), "utf8"); }
  catch (e) { return Response.json({ ok: false, error: e.message }, { status: 500 }); }

  // 2) mark the draft handled (so it leaves the pending list)
  if (b.draftId) {
    let h = { handled: {} };
    try { h = JSON.parse(fs.readFileSync(HANDLED(), "utf8")); } catch {}
    h.handled = h.handled || {};
    h.handled[b.draftId] = { action: b.action || "approved", at: new Date().toISOString() };
    const keys = Object.keys(h.handled);
    if (keys.length > 2000) for (const k of keys.slice(0, keys.length - 2000)) delete h.handled[k]; // cap
    try { fs.writeFileSync(HANDLED(), JSON.stringify(h, null, 2), "utf8"); } catch {}
  }

  return Response.json({ ok: true });
}
