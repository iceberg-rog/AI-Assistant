// One entry per USER who has ≥1 pending draft. Each carries the user's FULL thread (for the modal).
import fs from "node:fs";
import path from "node:path";
import { isRealConv, isRealChatId } from "@/lib/data";
export const dynamic = "force-dynamic";

const read = (name, fb) => { try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", name), "utf8")); } catch { return fb; } };

export async function GET() {
  const events = (read("live_conversations.json", { events: [] }).events || [])
    .filter((e) => isRealConv(e.conversationId) && isRealChatId(e.chatId ?? e.user?.telegramId)); // drop test/junk threads
  const handled = read("handled_drafts.json", { handled: {} }).handled || {};
  const status = read("connection_status.json", {});

  // group by telegram user
  const byUser = {};
  for (const e of events) {
    const tid = e.user?.telegramId ?? e.chatId ?? e.conversationId;
    (byUser[tid] ||= []).push(e);
  }

  const users = [];
  for (const [tid, evs] of Object.entries(byUser)) {
    evs.sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : 1)); // chronological
    const thread = evs.map((e) => {
      const id = `${e.conversationId}:${e.receivedAt}`;
      const h = handled[id] || null;
      const userRec = (e.evidence?.tools || []).find((t) => t.name === "get_user_record");
      const pending = !!(e.reply && e.decision?.action !== "escalate_human" && !h && e.delivered !== "auto_sent");
      return {
        id, conversationId: e.conversationId, chatId: e.chatId ?? e.user?.telegramId, businessConnectionId: e.businessConnectionId || null,
        receivedAt: e.receivedAt, kind: e.kind || "text", imageUrl: e.imageUrl || null,
        inbound: e.inbound || "", reply: e.reply?.text || null,
        intentId: e.classification?.intentId || "", faLabel: e.classification?.faLabel || "", confidence: e.classification?.confidence ?? 0,
        tier: e.classification?.tier || "", action: e.decision?.action || "draft_for_review",
        delivered: e.delivered || null, escalatedTo: e.escalated?.routeTo || null,
        pending, handled: h, userRecord: userRec ? userRec.result : null,
      };
    });
    const pendingCount = thread.filter((t) => t.pending).length;
    if (pendingCount === 0) continue; // queue = only users awaiting approval
    const last = evs[evs.length - 1];
    const u = last.user || {};
    const lastRec = [...thread].reverse().find((t) => t.userRecord);
    users.push({
      telegramId: tid,
      user: { name: u.name || "کاربر", username: u.username || null, telegramId: u.telegramId ?? null, userCode: u.userCode || null },
      pendingCount, total: thread.length,
      lastAt: last.receivedAt, latestInbound: last.inbound || "", latestKind: last.kind || "text",
      latestFaLabel: last.classification?.faLabel || "", latestConfidence: last.classification?.confidence ?? 0, latestTier: last.classification?.tier || "",
      userRecord: lastRec ? lastRec.userRecord : null,
      thread,
    });
  }
  users.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1)); // newest activity first
  return Response.json({ users, count: users.length, autoReply: !!status.autoReply, bot: status.bot || null });
}
