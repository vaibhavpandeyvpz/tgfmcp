import { Buffer } from "node:buffer";
import { EventEmitter } from "node:events";
import { Input, Telegraf, type Context } from "telegraf";
import { saveTelegramFile } from "../attachments.js";
import { CliIO } from "../cli-io.js";
import { createDeferred } from "../deferred-promise.js";
import type {
  Chat,
  ChatParticipant,
  Connection,
  Entity,
  LookupResult,
  Message,
  MessageReference,
  TelegramChatLike,
  TelegramFileLike,
  TelegramMessageLike,
  TelegramUserLike,
} from "./types.js";

type SessionEvents = {
  message: [Message];
};

export type StartResult =
  | { kind: "ready"; info: Connection }
  | { kind: "auth_failure"; message: string }
  | { kind: "timeout" };

export class TelegramSession {
  private readonly io: CliIO;
  private readonly token: string;
  private readonly events = new EventEmitter();
  private bot: Telegraf | null = null;
  private state: Connection["status"] = "idle";
  private self?: Entity;
  private initializePromise?: Promise<void>;
  private readonly readyDeferred = createDeferred<Connection>();
  private readonly authFailureDeferred = createDeferred<string>();

  constructor(options: { token: string; io?: CliIO }) {
    this.token = options.token;
    this.io = options.io ?? new CliIO();
  }

  get client(): Telegraf | null {
    return this.bot;
  }

  on<EventName extends keyof SessionEvents>(
    event: EventName,
    listener: (...args: SessionEvents[EventName]) => void,
  ): () => void {
    this.events.on(event, listener);
    return () => this.events.off(event, listener);
  }

  async start(): Promise<void> {
    if (this.initializePromise) {
      await this.initializePromise;
      return;
    }

    this.initializePromise = this.connect().finally(() => {
      this.initializePromise = undefined;
    });

    await this.initializePromise;
  }

  async waitForStartup(timeoutMs: number): Promise<StartResult> {
    return Promise.race([
      this.readyDeferred.promise.then(
        (info) => ({ kind: "ready", info }) as const,
      ),
      this.authFailureDeferred.promise.then(
        (message) => ({ kind: "auth_failure", message }) as const,
      ),
      new Promise((resolve) => {
        setTimeout(resolve, timeoutMs);
      }).then(() => ({ kind: "timeout" }) as const),
    ]);
  }

  async waitForReady(timeoutMs: number): Promise<void> {
    const result = await this.waitForStartup(timeoutMs);

    if (result.kind === "ready") {
      return;
    }

    if (result.kind === "auth_failure") {
      throw new Error(`Authentication failed: ${result.message}`);
    }

    throw new Error("Timeout waiting for startup");
  }

  async destroy(): Promise<void> {
    const bot = this.bot;
    this.bot = null;
    this.state = "disconnected";

    if (!bot) {
      return;
    }

    bot.stop("destroy");
  }

  async logOut(): Promise<void> {
    await this.destroy();
  }

  async getMe(): Promise<Entity> {
    if (this.self) {
      return this.self;
    }

    const bot = this.assertBot();
    const me = await bot.telegram.getMe();
    this.self = this.toEntity(me, "bot");
    return this.self;
  }

  async getStatus(): Promise<Connection> {
    return {
      profile: {
        env: "TELEGRAM_BOT_TOKEN",
      },
      status: this.state,
      device: {
        library: "telegraf",
        mode: "polling",
      },
      bot: this.self,
    };
  }

  async getChatInfo(chatId: string): Promise<Chat> {
    const bot = this.assertBot();
    const telegramChat = await bot.telegram.getChat(this.parseChatId(chatId));
    return this.toChat(telegramChat);
  }

  async getChatAdministrators(chatId: string): Promise<ChatParticipant[]> {
    const bot = this.assertBot();
    const admins = await bot.telegram.getChatAdministrators(
      this.parseChatId(chatId),
    );

    return admins.map((member) => {
      const user = "user" in member ? member.user : undefined;
      return {
        ...this.toEntity(
          user ?? { id: 0, first_name: "Unknown" },
          user?.is_bot ? "bot" : "user",
        ),
        flags: {
          admin:
            member.status === "administrator" || member.status === "creator",
          owner: member.status === "creator",
          anonymous: Boolean("is_anonymous" in member && member.is_anonymous),
          bot: Boolean(user?.is_bot),
        },
      };
    });
  }

  async lookupChat(input: string): Promise<LookupResult> {
    const bot = this.assertBot();
    const query = input.trim();
    const chatId = this.parseChatId(query);

    try {
      const chat = await bot.telegram.getChat(chatId);
      return {
        q: query,
        id: String(chat.id),
        username: "username" in chat ? chat.username : undefined,
        type: chat.type,
        found: true,
      };
    } catch {
      return {
        q: query,
        found: false,
      };
    }
  }

  async sendMessage(chatId: string, text: string): Promise<MessageReference> {
    const bot = this.assertBot();
    const message = await bot.telegram.sendMessage(
      this.parseChatId(chatId),
      text,
    );
    return this.toMessageReference(message);
  }

  async sendMediaFromBase64(
    chatId: string,
    mimetype: string,
    data: string,
    filename?: string,
    caption?: string,
  ): Promise<MessageReference> {
    const bot = this.assertBot();
    const input = Input.fromBuffer(Buffer.from(data, "base64"), filename);
    const message = await this.sendMedia(
      bot,
      chatId,
      input,
      mimetype,
      filename,
      caption,
    );
    return this.toMessageReference(message);
  }

  async sendMediaFromPath(
    chatId: string,
    path: string,
    caption?: string,
  ): Promise<MessageReference> {
    const bot = this.assertBot();
    const message = await bot.telegram.sendDocument(
      this.parseChatId(chatId),
      Input.fromLocalFile(path),
      { caption },
    );
    return this.toMessageReference(message);
  }

  async replyToMessage(
    chatId: string,
    messageId: number,
    text: string,
  ): Promise<MessageReference> {
    const bot = this.assertBot();
    const targetChatId = this.parseChatId(chatId);
    const message = await bot.telegram.sendMessage(targetChatId, text, {
      reply_parameters: {
        message_id: messageId,
      },
    } as never);
    return this.toMessageReference(message);
  }

  async reactToMessage(
    chatId: string,
    messageId: number,
    emoji = "👍",
  ): Promise<void> {
    const bot = this.assertBot();
    await bot.telegram.setMessageReaction(this.parseChatId(chatId), messageId, [
      { type: "emoji", emoji: emoji as never },
    ] as never);
  }

  async editMessage(
    chatId: string,
    messageId: number,
    text: string,
  ): Promise<void> {
    const bot = this.assertBot();
    await bot.telegram.editMessageText(
      this.parseChatId(chatId),
      messageId,
      undefined,
      text,
    );
  }

  async deleteMessage(chatId: string, messageId: number): Promise<void> {
    const bot = this.assertBot();
    await bot.telegram.deleteMessage(this.parseChatId(chatId), messageId);
  }

  async forwardMessage(
    fromChatId: string,
    messageId: number,
    chatId: string,
  ): Promise<void> {
    const bot = this.assertBot();
    await bot.telegram.forwardMessage(
      this.parseChatId(chatId),
      this.parseChatId(fromChatId),
      messageId,
    );
  }

  async sendTyping(chatId: string): Promise<void> {
    const bot = this.assertBot();
    await bot.telegram.sendChatAction(this.parseChatId(chatId), "typing");
  }

  async handleMessage(message: TelegramMessageLike): Promise<Message> {
    const transformed = await this.transformMessage(message, false);
    this.events.emit("message", transformed);
    return transformed;
  }

  private async connect(): Promise<void> {
    if (this.bot) {
      return;
    }

    this.state = "starting";

    try {
      const bot = new Telegraf(this.token);
      bot.catch((error) => {
        this.io.error(String(error));
      });

      bot.on("message", async (ctx) => {
        if ("message" in ctx.update && ctx.update.message) {
          await this.handleMessage(ctx.update.message as TelegramMessageLike);
        }
      });
      bot.on("edited_message", async (ctx) => {
        if ("edited_message" in ctx.update && ctx.update.edited_message) {
          await this.handleMessage(
            ctx.update.edited_message as TelegramMessageLike,
          );
        }
      });
      bot.on("channel_post", async (ctx) => {
        if ("channel_post" in ctx.update && ctx.update.channel_post) {
          await this.handleMessage(
            ctx.update.channel_post as TelegramMessageLike,
          );
        }
      });
      bot.on("edited_channel_post", async (ctx) => {
        if (
          "edited_channel_post" in ctx.update &&
          ctx.update.edited_channel_post
        ) {
          await this.handleMessage(
            ctx.update.edited_channel_post as TelegramMessageLike,
          );
        }
      });

      this.bot = bot;
      const me = await bot.telegram.getMe();
      const entity = this.toEntity(me, "bot");
      this.self = entity;
      bot.botInfo = me;
      await bot.launch({
        allowedUpdates: [
          "message",
          "edited_message",
          "channel_post",
          "edited_channel_post",
        ],
      });

      this.state = "connected";
      const status = await this.getStatus();
      this.io.line(
        `Connected to Telegram bot @${entity.username ?? entity.id}.`,
      );
      if (!this.readyDeferred.settled) {
        this.readyDeferred.resolve(status);
      }
    } catch (error) {
      this.state = "disconnected";
      const message = error instanceof Error ? error.message : String(error);
      if (!this.authFailureDeferred.settled) {
        this.authFailureDeferred.resolve(message);
      }
      if (!this.readyDeferred.settled) {
        this.readyDeferred.reject(new Error(message));
      }
      throw error;
    }
  }

  private assertBot(): Telegraf {
    if (!this.bot) {
      throw new Error("Telegram session is not connected");
    }

    return this.bot;
  }

  private parseChatId(chatId: string): string | number {
    const value = chatId.trim();
    if (/^-?\d+$/.test(value)) {
      return Number(value);
    }

    return value;
  }

  private toMessageReference(message: TelegramMessageLike): MessageReference {
    return {
      chat_id: String(message.chat.id),
      message_id: message.message_id,
    };
  }

  private async transformMessage(
    message: TelegramMessageLike,
    outgoing: boolean,
  ): Promise<Message> {
    const chat = this.toChat(message.chat);
    const sender = message.from
      ? this.toEntity(message.from, message.from.is_bot ? "bot" : "user")
      : message.sender_chat
        ? this.toEntity(message.sender_chat, "chat")
        : (this.self ?? {
            id: "unknown",
            type: "bot",
          });

    const attachments = await this.downloadAttachments(message);
    const body = message.text ?? message.caption ?? "";
    const links = [
      ...(message.entities ?? []),
      ...(message.caption_entities ?? []),
    ]
      .filter((entity) => entity.type === "url" || entity.type === "text_link")
      .map(
        (entity) =>
          entity.url ??
          body.slice(entity.offset, entity.offset + entity.length),
      );
    const mentions = [
      ...(message.entities ?? []),
      ...(message.caption_entities ?? []),
    ]
      .filter(
        (entity) => entity.type === "mention" || entity.type === "text_mention",
      )
      .map(
        (entity) =>
          entity.user?.username ??
          body.slice(entity.offset, entity.offset + entity.length),
      );

    return {
      id: `${message.chat.id}:${message.message_id}`,
      message_id: message.message_id,
      body,
      type: this.detectMessageType(message),
      chat,
      sender,
      timestamp: new Date((message.edit_date ?? message.date) * 1000),
      flags: {
        outgoing,
        forwarded: Boolean(message.forward_origin),
        edited: Boolean(message.edit_date),
      },
      relationships: {
        media: attachments.length > 0,
        reply: Boolean(message.reply_to_message),
        reaction: false,
      },
      attachments,
      links,
      mentions,
      parent_id: message.reply_to_message
        ? `${message.reply_to_message.chat.id}:${message.reply_to_message.message_id}`
        : undefined,
    };
  }

  private async downloadAttachments(
    message: TelegramMessageLike,
  ): Promise<string[]> {
    const bot = this.assertBot();
    const file = this.primaryFile(message);
    if (!file) {
      return [];
    }

    const localPath = await saveTelegramFile(
      bot.telegram,
      file.file_id,
      file.file_name,
      file.mime_type,
    );

    return localPath ? [localPath] : [];
  }

  private primaryFile(
    message: TelegramMessageLike,
  ): TelegramFileLike | undefined {
    if (message.document) return message.document;
    if (message.audio) return message.audio;
    if (message.video) return message.video;
    if (message.animation) return message.animation;
    if (message.voice) return message.voice;
    if (message.video_note) return message.video_note;
    if (message.sticker) return message.sticker;
    if (Array.isArray(message.photo) && message.photo.length > 0) {
      const last = message.photo[message.photo.length - 1];
      return {
        file_id: last.file_id,
        file_unique_id: last.file_unique_id,
        mime_type: "image/jpeg",
        file_name: `photo-${last.file_unique_id ?? last.file_id}.jpg`,
      };
    }

    return undefined;
  }

  private detectMessageType(message: TelegramMessageLike): string | null {
    if (message.text) return "text";
    if (message.photo) return "photo";
    if (message.document) return "document";
    if (message.audio) return "audio";
    if (message.video) return "video";
    if (message.animation) return "animation";
    if (message.voice) return "voice";
    if (message.video_note) return "video_note";
    if (message.sticker) return "sticker";
    if (message.contact) return "contact";
    if (message.location) return "location";
    if (message.venue) return "venue";
    if (message.poll) return "poll";
    return null;
  }

  private toEntity(
    value: TelegramUserLike | TelegramChatLike,
    type: Entity["type"],
  ): Entity {
    const firstName = "first_name" in value ? value.first_name : undefined;
    const lastName = "last_name" in value ? value.last_name : undefined;
    return {
      id: String(value.id),
      username: value.username,
      name:
        "title" in value && value.title
          ? value.title
          : [firstName, lastName].filter(Boolean).join(" ") || undefined,
      language_code: "language_code" in value ? value.language_code : undefined,
      type,
    };
  }

  private toChat(chat: TelegramChatLike): Chat {
    const name =
      chat.title ??
      ([chat.first_name, chat.last_name].filter(Boolean).join(" ") ||
        undefined);

    return {
      id: String(chat.id),
      name,
      username: chat.username,
      type: chat.type,
      flags: {
        forum: Boolean(chat.is_forum),
        verified: false,
      },
      unreads: 0,
      timestamp: new Date(),
    };
  }

  private async sendMedia(
    bot: Telegraf<Context>,
    chatId: string,
    input: ReturnType<typeof Input.fromBuffer>,
    mimetype: string,
    filename?: string,
    caption?: string,
  ): Promise<TelegramMessageLike> {
    const target = this.parseChatId(chatId);

    if (mimetype.startsWith("image/")) {
      return bot.telegram.sendPhoto(target, input, { caption });
    }

    if (mimetype.startsWith("video/")) {
      return bot.telegram.sendVideo(target, input, { caption });
    }

    if (mimetype.startsWith("audio/")) {
      return bot.telegram.sendAudio(target, input, { caption });
    }

    return bot.telegram.sendDocument(target, input, {
      caption,
      filename,
    } as never);
  }
}
