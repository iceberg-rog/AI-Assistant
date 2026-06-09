/**
 * LIVE Business Connection adapter — drop-in replacement for the stub.
 * Implements the SAME TelegramAdapter interface, so swapping stub -> live is one line
 * in run-demo / the server. Networking mirrors the verified 4.1 probe.
 *
 * NOTE: untested against Telegram until 4.1 staging runs with a real token. Inline-keyboard
 * behavior auto-falls-back to plain text if Business Connection rejects it (the 4.1 open item),
 * so the system stays correct either way.
 *
 * Needs: TELEGRAM_BOT_TOKEN, the bot connected to the support account (Settings ->
 * Telegram Business -> Chatbots, "Reply to messages"). Long-poll, no public URL.
 */
import type {
  TelegramAdapter,
  SendMessageInput,
  SendMessageResult,
} from "./telegram-adapter.interface.ts";
import type { Inbound } from "../agent/orchestrator.ts";

export class LiveBusinessConnectionAdapter implements TelegramAdapter {
  private token: string;
  private api: string;
  private offset = 0;
  private chatToBcid = new Map<string, string>();
  private connections = new Map<string, any>();
  private ownerIds = new Set<number>(); // business account owner(s) — never treat as a customer
  inlineSupported: boolean | undefined = undefined; // set false once Telegram rejects inline on-behalf
  takenOver = new Set<string | number>();
  paused = new Set<string | number>();

  constructor(token: string) {
    this.token = token;
    this.api = `https://api.telegram.org/bot${token}`;
  }

  /** Confirm the bot token is valid + get the bot identity. */
  async getMe(): Promise<any> {
    return this.tg("getMe");
  }

  /** Business connections currently linked (populated when the owner connects the bot). */
  get businessConnections(): any[] {
    return Array.from(this.connections.values());
  }

  /** Re-seed connections from a persisted list on startup — the business_connection update fires
   *  only once (when an account adds/edits the bot), so without this a restart shows 0 accounts. */
  seedConnections(arr: any[]): void {
    for (const bc of arr || []) {
      if (!bc?.id) continue;
      if (!this.connections.has(bc.id)) this.connections.set(bc.id, bc);
      if (bc.user_chat_id) this.ownerIds.add(bc.user_chat_id);
      if (bc.user?.id) this.ownerIds.add(bc.user.id);
    }
  }

  private async tg(method: string, params: Record<string, any> = {}): Promise<any> {
    const res = await fetch(`${this.api}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.description || "telegram error");
    return data.result;
  }

  /** Download a Telegram file (photo) and return it as base64 (for Claude vision). Capped at ~4MB. */
  private async downloadFileBase64(fileId: string): Promise<string> {
    const f = await this.tg("getFile", { file_id: fileId });
    if (f.file_size && f.file_size > 4_500_000) throw new Error("file too large");
    const url = `https://api.telegram.org/file/bot${this.token}/${f.file_path}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`file download ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString("base64");
  }

  /** Send a plain message to any chat the bot can reach (used for admin escalation alerts). */
  async notifyChat(chatId: string | number, text: string): Promise<boolean> {
    try { await this.tg("sendMessage", { chat_id: chatId, text }); return true; } catch { return false; }
  }

  /** Long-poll for business_message updates and emit Inbound to the router. */
  async startIngest(onInbound: (inb: Inbound) => Promise<void>): Promise<void> {
    const allowed = [
      "message", "callback_query", "business_connection",
      "business_message", "edited_business_message", "deleted_business_messages",
    ];
    for (;;) {
      try {
        const updates = await this.tg("getUpdates", { offset: this.offset, timeout: 50, allowed_updates: allowed });
        for (const u of updates) {
          this.offset = u.update_id + 1;
          if (u.business_connection) {
            const bc = u.business_connection;
            this.connections.set(bc.id, bc);
            if (bc.user_chat_id) this.ownerIds.add(bc.user_chat_id);
            if (bc.user?.id) this.ownerIds.add(bc.user.id);
            continue;
          }
          const m = u.business_message;
          if (!m) continue;
          const chatId = String(m.chat?.id);
          this.chatToBcid.set(chatId, m.business_connection_id);
          if (this.paused.has(m.chat?.id) || this.takenOver.has(m.chat?.id)) continue; // operator handling
          const from = m.from || {};
          // ignore the business owner's OWN outgoing messages + bots — only react to the customer.
          // (in a private business chat, the customer's own message has from.id === chat.id)
          if (from.is_bot || this.ownerIds.has(from.id) || from.id !== m.chat?.id) continue;

          // determine message kind (text / voice / photo) — voice & photo were previously dropped
          let kind: Inbound["kind"] = "text";
          let text = m.text || "";
          let imageBase64: string | undefined;
          let imageMediaType: string | undefined;
          if (!m.text) {
            if (m.voice || m.audio || m.video_note || m.video) {
              kind = "voice"; text = "[پیام صوتی]";
            } else if (m.photo?.length) {
              kind = "photo"; text = m.caption || "[عکس]";
              try {
                const biggest = m.photo[m.photo.length - 1];
                imageBase64 = await this.downloadFileBase64(biggest.file_id);
                imageMediaType = "image/jpeg";
              } catch { /* if download fails, treat caption-only */ }
            } else if (m.document && /^image\//.test(m.document.mime_type || "")) {
              kind = "photo"; text = m.caption || "[عکس]";
              try { imageBase64 = await this.downloadFileBase64(m.document.file_id); imageMediaType = m.document.mime_type; } catch {}
            } else {
              continue; // sticker / location / contact / other → ignore
            }
          }

          const inb: Inbound = {
            conversationId: `bc:${chatId}`,
            receivedAt: new Date((m.date || 0) * 1000).toISOString(),
            text,
            kind,
            imageBase64,
            imageMediaType,
            caption: m.caption || undefined,
            businessConnectionId: m.business_connection_id,
            user: {
              name: [from.first_name, from.last_name].filter(Boolean).join(" ") || "کاربر",
              username: from.username ? "@" + from.username : undefined,
              telegramId: from.id,
              // userCode resolved downstream by the user-profile/billing tool from telegramId
            },
          };
          await onInbound(inb);
        }
      } catch (e: any) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const bcid = input.businessConnectionId || this.chatToBcid.get(String(input.chatId));
    const base: Record<string, any> = { business_connection_id: bcid, chat_id: input.chatId, text: input.text };

    if (input.inlineButtons?.length && this.inlineSupported !== false) {
      try {
        const r = await this.tg("sendMessage", {
          ...base,
          reply_markup: { inline_keyboard: [input.inlineButtons.map((b) => ({ text: b.text, callback_data: b.data }))] },
        });
        this.inlineSupported = true;
        return { ok: true, messageId: r.message_id };
      } catch {
        this.inlineSupported = false; // Business Connection rejected inline -> fall back to plain (4.1 fallback)
      }
    }
    try {
      const r = await this.tg("sendMessage", base);
      return { ok: true, messageId: r.message_id };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  async sendTyping(chatId: string | number): Promise<void> {
    const bcid = this.chatToBcid.get(String(chatId));
    try { await this.tg("sendChatAction", { business_connection_id: bcid, chat_id: chatId, action: "typing" }); } catch {}
  }
  async markHumanTakeover(chatId: string | number): Promise<void> { this.takenOver.add(chatId); }
  async pauseAutomation(chatId: string | number): Promise<void> { this.paused.add(chatId); }
  async resumeAutomation(chatId: string | number): Promise<void> { this.paused.delete(chatId); this.takenOver.delete(chatId); }
}
