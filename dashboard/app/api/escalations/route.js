// Live human-support inbox. The connector appends new escalations to escalations_live.json
// (and pings the admin on Telegram). This route lets the operator claim/resolve/reopen them.
import fs from "node:fs";
import path from "node:path";
import { isRealConv, isRealChatId } from "@/lib/data";
export const dynamic = "force-dynamic";

const FILE = () => path.join(process.cwd(), "data", "escalations_live.json");
function read() { try { return JSON.parse(fs.readFileSync(FILE(), "utf8")).items || []; } catch { return []; } }
function write(items) { fs.writeFileSync(FILE(), JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2), "utf8"); }

export async function GET() {
  // keep an item if its conversation OR its telegram id is real → drops junk, never hides a real escalation
  const items = read().filter((x) => isRealConv(x.conversationId) || isRealChatId(x.telegramId));
  const open = items.filter((x) => !x.resolved).length;
  return Response.json({ items, open });
}

export async function POST(req) {
  let b;
  try { b = await req.json(); } catch { return Response.json({ ok: false, error: "bad json" }, { status: 400 }); }
  const items = read();
  const it = items.find((x) => x.id === b.id);
  if (!it) return Response.json({ ok: false, error: "not found" }, { status: 404 });
  if (b.action === "claim") { it.claimedBy = b.by || "اپراتور"; it.claimedAt = new Date().toISOString(); }
  else if (b.action === "resolve") { it.resolved = true; it.resolvedAt = new Date().toISOString(); }
  else if (b.action === "reopen") { it.resolved = false; it.resolvedAt = null; }
  else return Response.json({ ok: false, error: "bad action" }, { status: 400 });
  try { write(items); } catch (e) { return Response.json({ ok: false, error: e.message }, { status: 500 }); }
  return Response.json({ ok: true, item: it });
}
