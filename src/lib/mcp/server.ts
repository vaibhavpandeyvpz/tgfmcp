import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";
import { createJsonResult } from "./helpers.js";
import { packageMetadata } from "../package-metadata.js";
import { TelegramChannel } from "../telegram/channel.js";
import type { TelegramSession } from "../telegram/session.js";
import type { ChannelPermissionOption } from "../telegram/types.js";

const HOOMAN_CHANNEL = "hooman/channel";
const HOOMAN_CHANNEL_PERMISSION = "hooman/channel/permission";
const HOOMAN_PERMISSION_REQUEST_METHOD =
  "notifications/hooman/channel/permission_request";

const DEFAULT_PERMISSION_OPTIONS: ChannelPermissionOption[] = [
  { id: "allow_once", label: "Allow once" },
  { id: "allow_always", label: "Always allow" },
  { id: "deny", label: "Deny" },
];

function instructions(channel = false): string {
  const files = ["formatting.md", channel ? "channel.md" : null].filter(
    Boolean,
  );
  const root = dirname(fileURLToPath(import.meta.url));
  const sections = files.map((file) =>
    readFileSync(resolve(root, `../../prompts/${file}`), "utf8").trim(),
  );
  return `${sections.join("\n\n").trim()}\n`;
}

export class TelegramMcpServer {
  readonly mcp: McpServer;

  private constructor(
    private readonly session: TelegramSession,
    private readonly channels: boolean,
  ) {
    this.mcp = new McpServer(
      {
        name: packageMetadata.name,
        version: packageMetadata.version,
      },
      {
        capabilities: {
          experimental: channels
            ? {
                "hooman/user": { path: "meta.user" },
                "hooman/session": { path: "meta.session" },
                "hooman/thread": { path: "meta.thread" },
                [HOOMAN_CHANNEL]: {},
                [HOOMAN_CHANNEL_PERMISSION]: {},
              }
            : undefined,
        },
        instructions: instructions(channels),
      },
    );
    if (channels) {
      this.registerPermissionRelay();
    }
  }

  static create(
    session: TelegramSession,
    channels: boolean,
  ): TelegramMcpServer {
    const server = new TelegramMcpServer(session, channels);
    server.registerTools();
    return server;
  }

  async start(transport: Transport): Promise<void> {
    await this.mcp.connect(transport);
  }

  async subscribe(): Promise<void> {
    if (!this.channels) {
      throw new Error("Channels are not enabled");
    }

    const channel = new TelegramChannel(
      this.session,
      this.mcp.server,
      HOOMAN_CHANNEL,
    );
    await channel.start();
  }

  private registerTools(): void {
    this.mcp.registerTool(
      "telegram_get_me",
      {
        title: "Get connected Telegram bot",
        description:
          "Return the current session details for the connected Telegram bot.",
      },
      async () => createJsonResult(await this.session.getMe()),
    );

    this.mcp.registerTool(
      "telegram_get_status",
      {
        title: "Get Telegram connection status",
        description:
          "Return the current connection status for this Telegram bot session.",
      },
      async () => createJsonResult(await this.session.getStatus()),
    );

    this.mcp.registerTool(
      "telegram_get_chat",
      {
        title: "Get Telegram chat",
        description:
          "Get details for a Telegram chat by numeric ID or username.",
        inputSchema: z.object({
          chatId: z.string().describe("Target chat ID or @username."),
        }),
      },
      async ({ chatId }) =>
        createJsonResult(await this.session.getChatInfo(chatId)),
    );

    this.mcp.registerTool(
      "telegram_get_chat_administrators",
      {
        title: "Get Telegram chat administrators",
        description:
          "List administrators for a Telegram group, supergroup, or channel.",
        inputSchema: z.object({
          chatId: z.string().describe("Target chat ID or @username."),
        }),
      },
      async ({ chatId }) =>
        createJsonResult(await this.session.getChatAdministrators(chatId)),
    );

    this.mcp.registerTool(
      "telegram_lookup_chat",
      {
        title: "Lookup Telegram chat",
        description:
          "Resolve a Telegram chat or channel by numeric ID or username.",
        inputSchema: z.object({
          chatId: z.string().describe("Numeric chat ID or @username."),
        }),
      },
      async ({ chatId }) =>
        createJsonResult(await this.session.lookupChat(chatId)),
    );

    this.mcp.registerTool(
      "telegram_send_message",
      {
        title: "Send a Telegram message",
        description:
          "Send a plain text message to a Telegram chat, group, or channel.",
        inputSchema: z.object({
          chatId: z.string().describe("Target chat ID or @username."),
          text: z.string().describe("Message text."),
        }),
      },
      async ({ chatId, text }) => {
        return createJsonResult(await this.session.sendMessage(chatId, text));
      },
    );

    this.mcp.registerTool(
      "telegram_send_media_from_base64",
      {
        title: "Send Telegram media from base64",
        description:
          "Send media to Telegram using a base64 payload with MIME type and optional filename/caption.",
        inputSchema: z.object({
          chatId: z.string(),
          data: z.string().describe("Base64-encoded file content."),
          mimetype: z
            .string()
            .describe("MIME type, for example image/png or application/pdf."),
          filename: z.string().optional(),
          caption: z.string().optional(),
        }),
      },
      async ({ chatId, data, mimetype, filename, caption }) => {
        return createJsonResult(
          await this.session.sendMediaFromBase64(
            chatId,
            mimetype,
            data,
            filename,
            caption,
          ),
        );
      },
    );

    this.mcp.registerTool(
      "telegram_send_media_from_path",
      {
        title: "Send Telegram media from path",
        description: "Send a local file to Telegram by file path.",
        inputSchema: z.object({
          chatId: z.string(),
          path: z.string().describe("Absolute or relative local file path."),
          caption: z.string().optional(),
        }),
      },
      async ({ chatId, path, caption }) => {
        return createJsonResult(
          await this.session.sendMediaFromPath(chatId, path, caption),
        );
      },
    );

    this.mcp.registerTool(
      "telegram_reply_to_message",
      {
        title: "Reply to a Telegram message",
        description:
          "Send a reply to an existing Telegram message using explicit chat and message IDs.",
        inputSchema: z.object({
          chatId: z.string().describe("Chat ID containing the target message."),
          messageId: z.number().int().describe("Message ID to reply to."),
          text: z.string().describe("Reply text."),
        }),
      },
      async ({ chatId, messageId, text }) =>
        createJsonResult(
          await this.session.replyToMessage(chatId, messageId, text),
        ),
    );

    this.mcp.registerTool(
      "telegram_react_to_message",
      {
        title: "React to a Telegram message",
        description:
          "Add an emoji reaction to an existing Telegram message using explicit chat and message IDs.",
        inputSchema: z.object({
          chatId: z.string().describe("Chat ID containing the target message."),
          messageId: z.number().int().describe("Target message ID."),
          emoji: z
            .string()
            .optional()
            .describe("Emoji reaction. Default is thumbs up."),
        }),
      },
      async ({ chatId, messageId, emoji }) => {
        await this.session.reactToMessage(chatId, messageId, emoji ?? "👍");
        return createJsonResult({ ok: true });
      },
    );

    this.mcp.registerTool(
      "telegram_edit_message",
      {
        title: "Edit a Telegram message",
        description:
          "Edit a previously sent Telegram text message using explicit chat and message IDs.",
        inputSchema: z.object({
          chatId: z.string().describe("Chat ID containing the target message."),
          messageId: z.number().int().describe("Target message ID."),
          text: z.string().describe("Updated message text."),
        }),
      },
      async ({ chatId, messageId, text }) => {
        await this.session.editMessage(chatId, messageId, text);
        return createJsonResult({ ok: true });
      },
    );

    this.mcp.registerTool(
      "telegram_delete_message",
      {
        title: "Delete a Telegram message",
        description:
          "Delete a Telegram message using explicit chat and message IDs.",
        inputSchema: z.object({
          chatId: z.string().describe("Chat ID containing the target message."),
          messageId: z.number().int().describe("Target message ID."),
        }),
      },
      async ({ chatId, messageId }) => {
        await this.session.deleteMessage(chatId, messageId);
        return createJsonResult({ ok: true });
      },
    );

    this.mcp.registerTool(
      "telegram_forward_message",
      {
        title: "Forward a Telegram message",
        description:
          "Forward an existing Telegram message to another chat using explicit source chat and message IDs.",
        inputSchema: z.object({
          fromChatId: z.string().describe("Source chat ID."),
          messageId: z.number().int().describe("Source message ID."),
          chatId: z.string().describe("Destination chat ID."),
        }),
      },
      async ({ fromChatId, messageId, chatId }) => {
        await this.session.forwardMessage(fromChatId, messageId, chatId);
        return createJsonResult({ ok: true });
      },
    );

    this.mcp.registerTool(
      "telegram_send_typing",
      {
        title: "Show Telegram typing state",
        description: "Show the typing indicator in a target Telegram chat.",
        inputSchema: z.object({
          chatId: z.string().describe("Target chat ID."),
        }),
      },
      async ({ chatId }) => {
        await this.session.sendTyping(chatId);
        return createJsonResult({ ok: true });
      },
    );
  }

  private registerPermissionRelay(): void {
    const schema = z.object({
      method: z.literal(HOOMAN_PERMISSION_REQUEST_METHOD),
      params: z.object({
        request_id: z.string().min(1),
        tool_name: z.string().min(1),
        description: z.string().min(1),
        input_preview: z.string().min(1),
        options: z
          .array(
            z.object({
              id: z.string().min(1),
              label: z.string().min(1),
            }),
          )
          .optional(),
        meta: z
          .object({
            source: z.string().optional(),
            user: z.string().optional(),
            session: z.string().optional(),
            thread: z.string().optional(),
          })
          .optional(),
      }),
    });
    this.mcp.server.setNotificationHandler(
      schema,
      async ({ params }: z.infer<typeof schema>) => {
        const chatId = params.meta?.session?.trim();
        if (!chatId) {
          return;
        }
        const text = [
          `Hooman wants to run ${params.tool_name}.`,
          `Description: ${params.description}`,
          `Input: ${params.input_preview}`,
          "",
          "Choose an approval option below, or reply with text:",
          `"yes ${params.request_id}", "always ${params.request_id}", or "no ${params.request_id}".`,
        ].join("\n");
        const options = this.resolvePermissionOptions(params.options);
        const messageId = Number(params.meta?.thread);
        if (Number.isInteger(messageId) && messageId > 0) {
          await this.session.sendPermissionRequest(
            chatId,
            text,
            params.request_id,
            options,
            messageId,
          );
          return;
        }
        await this.session.sendPermissionRequest(
          chatId,
          text,
          params.request_id,
          options,
        );
      },
    );
  }

  private resolvePermissionOptions(
    options:
      | Array<{
          id: string;
          label: string;
        }>
      | undefined,
  ): ChannelPermissionOption[] {
    const valid = (options ?? [])
      .map((option) => ({
        id: option.id.trim(),
        label: option.label.trim(),
      }))
      .filter(
        (option) =>
          option.id.length > 0 &&
          option.label.length > 0 &&
          (option.id === "allow_once" ||
            option.id === "allow_always" ||
            option.id === "deny"),
      );

    return valid.length > 0 ? valid : DEFAULT_PERMISSION_OPTIONS;
  }
}
