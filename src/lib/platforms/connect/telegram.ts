import "server-only";
import { AppError } from "../../errors";
import type { Ctx } from "../../session";
import { assertCan } from "../../session";
import { upsertChannels, type ChannelView } from "../../services/channels";
import { assertBotCanPost, type TelegramCredentials, type TelegramMeta } from "../telegram";
import { PlatformError } from "../types";

const TOKEN_RE = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;

/** "@name", "name", "t.me/name", "https://t.me/name" or a numeric id. */
function normalizeChatId(input: string): string {
  const v = input.trim();
  if (/^-?\d+$/.test(v)) return v;
  const name = v.replace(/^https?:\/\//i, "").replace(/^t\.me\//i, "").replace(/^@/, "").split(/[/?]/)[0];
  if (!/^[A-Za-z][A-Za-z0-9_]{3,}$/.test(name)) {
    throw new AppError("INVALID_CHAT", "Enter the channel's @username or numeric chat id.", 400, "chatId");
  }
  return `@${name}`;
}

export async function connectTelegram(ctx: Ctx, input: { botToken: string; chatId: string }): Promise<ChannelView[]> {
  assertCan(ctx, "channel:manage");
  const botToken = input.botToken.trim();
  if (!TOKEN_RE.test(botToken)) throw new AppError("INVALID_TOKEN", "That doesn't look like a bot token from @BotFather.", 400, "botToken");
  const chatId = normalizeChatId(input.chatId);

  let info: Awaited<ReturnType<typeof assertBotCanPost>>;
  try {
    info = await assertBotCanPost(botToken, chatId);
  } catch (err) {
    if (err instanceof PlatformError) {
      if (err.code === "TOKEN_INVALID") throw new AppError("INVALID_TOKEN", "Telegram rejected this bot token.", 400, "botToken");
      if (err.code === "CHAT_NOT_FOUND" || err.code === "BOT_REMOVED")
        throw new AppError("INVALID_CHAT", "The bot can't see this chat. Add the bot to the channel or group first.", 400, "chatId");
      throw new AppError(err.code, err.message, 400, err.code === "BOT_CANNOT_POST" ? "chatId" : undefined);
    }
    throw err;
  }

  const { chat, bot } = info;
  return upsertChannels(ctx, [
    {
      platform: "telegram",
      externalId: String(chat.id),
      displayName: chat.title ?? chat.first_name ?? chat.username ?? String(chat.id),
      username: chat.username ? `@${chat.username}` : undefined,
      credentials: { botToken } satisfies TelegramCredentials,
      meta: {
        chatId: String(chat.id),
        chatTitle: chat.title ?? chat.username ?? String(chat.id),
        chatType: chat.type,
        username: chat.username,
        botUsername: bot.username,
      } satisfies TelegramMeta,
    },
  ]);
}
