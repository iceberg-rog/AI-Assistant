// Per-user lifetime stats + full history (from the connector's conversation_state.json), for the
// row+modal users UI.
import fs from "node:fs";
import path from "node:path";
export const dynamic = "force-dynamic";

const read = (name, fb) => { try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", name), "utf8")); } catch { return fb; } };

export async function GET() {
  const state = read("conversation_state.json", {});
  const users = Object.values(state).map((s) => {
    const hist = Array.isArray(s.history) ? s.history : [];
    // the lifetime counter can drift below the actual history (e.g. missed increments) — never understate
    const msgIn = Math.max(s.msgIn ?? 0, hist.filter((h) => h.role === "user").length);
    const msgOut = Math.max(s.msgOut ?? 0, hist.filter((h) => h.role === "bot").length);
    const firstSeenAt = s.firstSeenAt || (hist[0] && hist[0].at) || s.lastUserAt || null;
    const lastSeenAt = s.lastSeenAt || s.lastUserAt || (hist[hist.length - 1] && hist[hist.length - 1].at) || null;
    return {
      telegramId: s.telegramId,
      name: s.name || "کاربر",
      username: s.username || null,
      intent: s.intent || null,
      stage: s.stage || null,
      lastKind: s.lastKind || "text",
      firstSeenAt, lastSeenAt,
      msgIn, msgOut,
      sessions: s.sessions || 1,
      escalations: s.escalations || 0,
      history: hist,
    };
  });
  users.sort((a, b) => ((a.lastSeenAt || "") < (b.lastSeenAt || "") ? 1 : -1));
  const totals = {
    users: users.length,
    msgIn: users.reduce((a, u) => a + (u.msgIn || 0), 0),
    msgOut: users.reduce((a, u) => a + (u.msgOut || 0), 0),
    escalations: users.reduce((a, u) => a + (u.escalations || 0), 0),
  };
  return Response.json({ users, totals });
}
