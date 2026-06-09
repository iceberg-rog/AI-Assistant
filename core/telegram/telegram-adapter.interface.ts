/**
 * The ONE seam that may change after the 4.1 staging test.
 * Everything else in core/ is independent of how Telegram actually behaves.
 */

export interface InlineButton {
  text: string;
  data: string;
}

export interface SendMessageInput {
  conversationId: string;
  chatId: string | number;
  text: string;
  inlineButtons?: InlineButton[]; // may be dropped if Business Connection rejects inline (4.1 result)
  businessConnectionId?: string;
}

export interface SendMessageResult {
  ok: boolean;
  messageId?: number;
  error?: string;
}

export interface TelegramAdapter {
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
  sendTyping(chatId: string | number): Promise<void>;
  markHumanTakeover(chatId: string | number): Promise<void>;
  pauseAutomation(chatId: string | number): Promise<void>;
  resumeAutomation(chatId: string | number): Promise<void>;
}
