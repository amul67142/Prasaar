import "server-only";
import { downloadMedia, platformFetch } from "./http";
import { PLATFORM_RULES } from "./rules";
import { PlatformError, type AdapterChannel, type AdapterMedia, type PlatformAdapter } from "./types";

export interface TelegramCredentials {
  botToken: string;
}
export interface TelegramMeta {
  chatId: string;
  chatTitle: string;
  chatType: "channel" | "group" | "supergroup" | "private";
  username?: string;
  botUsername?: string;
}

type TgChannel = AdapterChannel<TelegramCredentials, TelegramMeta>;

interface TgResponse<T> {
  ok: boolean;
  result: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

export function describeTelegramError(status: number, body: unknown) {
  const b = body as TgResponse<unknown> | undefined;
  const detail = b?.description ?? "";
  if (status === 401) return { code: "TOKEN_INVALID", message: "Telegram rejected the bot token. Reconnect with a new token.", authFailed: true };
  if (status === 403) return { code: "BOT_REMOVED", message: "The bot was removed from the chat or lost permission to post. Add it back as an admin and reconnect.", authFailed: true };
  if (status === 429) return { code: "RATE_LIMITED", message: `Telegram asked us to slow down${b?.parameters?.retry_after ? ` for ${b.parameters.retry_after}s` : ""}; we'll retry.`, temporary: true };
  if (status === 400 && /chat not found/i.test(detail)) return { code: "CHAT_NOT_FOUND", message: "Telegram can't find this chat. Check the bot is still a member.", authFailed: true };
  if (status === 400) return { code: "PLATFORM_REJECTED", message: `Telegram rejected the post: ${detail || "bad request"}`, temporary: false };
  return undefined;
}

export async function tg<T>(token: string, method: string, body?: Record<string, unknown> | FormData): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await platformFetch(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: "POST",
      headers: isForm ? undefined : { "Content-Type": "application/json" },
      body: isForm ? body : JSON.stringify(body ?? {}),
      timeoutMs: 120_000,
    },
    describeTelegramError,
  );
  const json = (await res.json()) as TgResponse<T>;
  if (!json.ok) throw new PlatformError("PLATFORM_REJECTED", `Telegram rejected the request: ${json.description ?? "unknown error"}`, false, json);
  return json.result;
}

const TYPE = { image: "photo", video: "video", document: "document" } as const;
const METHOD = { image: "sendPhoto", video: "sendVideo", document: "sendDocument" } as const;

async function fileOf(m: AdapterMedia) {
  return downloadMedia(m.url, PLATFORM_RULES.telegram.maxBytes[m.kind]);
}

function permalinkFor(meta: TelegramMeta, messageId: number): string | undefined {
  if (meta.username) return `https://t.me/${meta.username}/${messageId}`;
  if (meta.chatId.startsWith("-100")) return `https://t.me/c/${meta.chatId.slice(4)}/${messageId}`;
  return undefined;
}

export const telegramAdapter: PlatformAdapter<TelegramCredentials, TelegramMeta> = {
  platform: "telegram",

  async publish(channel: TgChannel, input) {
    const token = channel.credentials.botToken;
    const chatId = channel.meta.chatId || channel.externalId;
    let messageId: number;

    if (input.media.length === 0) {
      messageId = (await tg<{ message_id: number }>(token, "sendMessage", { chat_id: chatId, text: input.text })).message_id;
    } else if (input.media.length === 1) {
      const m = input.media[0];
      const form = new FormData();
      form.set("chat_id", chatId);
      if (input.text) form.set("caption", input.text);
      form.set(TYPE[m.kind], await fileOf(m), m.filename);
      messageId = (await tg<{ message_id: number }>(token, METHOD[m.kind], form)).message_id;
    } else {
      const form = new FormData();
      form.set("chat_id", chatId);
      const items = [];
      for (const [i, m] of input.media.entries()) {
        form.set(`file${i}`, await fileOf(m), m.filename);
        items.push({ type: TYPE[m.kind], media: `attach://file${i}`, ...(i === 0 && input.text ? { caption: input.text } : {}) });
      }
      form.set("media", JSON.stringify(items));
      messageId = (await tg<{ message_id: number }[]>(token, "sendMediaGroup", form))[0].message_id;
    }

    return { platformPostId: String(messageId), permalink: permalinkFor(channel.meta, messageId) };
  },

  async check(channel) {
    await assertBotCanPost(channel.credentials.botToken, channel.meta.chatId || channel.externalId);
  },
};

/** Confirms the bot is in the chat with rights to post. Returns what we learned. */
export async function assertBotCanPost(token: string, chatId: string) {
  const bot = await tg<{ id: number; username: string }>(token, "getMe");
  const chat = await tg<{ id: number; title?: string; username?: string; type: TelegramMeta["chatType"]; first_name?: string }>(token, "getChat", { chat_id: chatId });
  const member = await tg<{ status: string; can_post_messages?: boolean; can_send_messages?: boolean }>(token, "getChatMember", {
    chat_id: chat.id,
    user_id: bot.id,
  });
  if (chat.type === "channel") {
    if (member.status !== "administrator" || member.can_post_messages === false) {
      throw new PlatformError("BOT_CANNOT_POST", "Make the bot an admin of the channel with permission to post messages.", false, member, true);
    }
  } else if (member.status === "left" || member.status === "kicked" || (member.status === "restricted" && member.can_send_messages === false)) {
    throw new PlatformError("BOT_CANNOT_POST", "Add the bot to the group and allow it to send messages.", false, member, true);
  }
  return { bot, chat };
}
