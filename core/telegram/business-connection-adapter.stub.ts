/**
 * STUB Business Connection adapter — no real network. Records what WOULD be sent.
 * After the 4.1 staging test, this is replaced by the real getUpdates/sendMessage
 * implementation (with business_connection_id, 24h-window + inline handling).
 */
import type {
  TelegramAdapter,
  SendMessageInput,
  SendMessageResult,
} from "./telegram-adapter.interface.ts";

export interface SentRecord {
  at: string;
  chatId: string | number;
  text: string;
  hadInline: boolean;
  channel: "business_connection";
}

export class BusinessConnectionStubAdapter implements TelegramAdapter {
  sent: SentRecord[] = [];
  takenOver = new Set<string | number>();
  paused = new Set<string | number>();

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    this.sent.push({
      at: new Date().toISOString(),
      chatId: input.chatId,
      text: input.text,
      hadInline: !!input.inlineButtons?.length,
      channel: "business_connection",
    });
    return { ok: true, messageId: this.sent.length };
  }
  async sendTyping(): Promise<void> {}
  async markHumanTakeover(chatId: string | number): Promise<void> {
    this.takenOver.add(chatId);
  }
  async pauseAutomation(chatId: string | number): Promise<void> {
    this.paused.add(chatId);
  }
  async resumeAutomation(chatId: string | number): Promise<void> {
    this.paused.delete(chatId);
  }
}
