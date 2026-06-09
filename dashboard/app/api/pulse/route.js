// Tiny heartbeat for the notification bell: detects new incoming messages + open escalations.
import fs from "node:fs";
import path from "node:path";
export const dynamic = "force-dynamic";

const read = (name, fb) => { try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", name), "utf8")); } catch { return fb; } };

export async function GET() {
  const status = read("connection_status.json", {});
  const events = read("live_conversations.json", { events: [] }).events || [];
  const esc = read("escalations_live.json", { items: [] }).items || [];
  const latest = events[0] || null; // newest first
  // a written botOnline:true goes stale when the process dies; trust the 5s heartbeat instead.
  const hbAgeMs = status.heartbeatAt ? Date.now() - Date.parse(status.heartbeatAt) : Infinity;
  const online = !!status.botOnline && hbAgeMs < 15000;
  return Response.json({
    processed: status.processed || 0,
    botOnline: online,
    online,
    heartbeatAt: status.heartbeatAt || null,
    heartbeatAgeSec: Number.isFinite(hbAgeMs) ? Math.round(hbAgeMs / 1000) : null,
    open: esc.filter((x) => !x.resolved).length,
    lastUser: latest?.user?.name || null,
    lastInbound: (latest?.inbound || "").slice(0, 80),
    lastKind: latest?.kind || "text",
    lastAt: latest?.receivedAt || status.lastActivity || null,
  });
}
