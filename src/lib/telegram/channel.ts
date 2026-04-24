import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { TelegramSession } from "./session.js";
import type { Entity, Message } from "./types.js";

const PERMISSION_REPLY_RE =
  /^\s*(yes|y|always|a|no|n)\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*$/i;

export interface MessageChannelEvent {
  source: "telegram";
  self: Entity;
  message: Message;
  text: string;
}

export class TelegramChannel {
  private unsubscribe?: () => void;
  private self?: Entity;

  constructor(
    private readonly session: TelegramSession,
    private readonly mcp: Server,
    private readonly channel: string,
  ) {}

  async start(): Promise<void> {
    this.unsubscribe = this.session.on("message", (message) => {
      void this.publish(message);
    });

    if (this.session.client) {
      this.self = await this.session.getMe();
    }

    const onclose = this.mcp.onclose;
    this.mcp.onclose = () => {
      this.stop();
      onclose?.();
    };
  }

  private stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private async publish(message: Message): Promise<void> {
    try {
      const verdict = parsePermissionVerdict(message.body);
      if (verdict) {
        await this.mcp.notification({
          method: "notifications/hooman/channel/permission",
          params: {
            request_id: verdict.requestId,
            behavior: verdict.behavior,
          },
        } as never);
        return;
      }

      this.self ??= await this.session.getMe();
      const event: MessageChannelEvent = {
        source: "telegram",
        self: this.self!,
        message,
        text: message.body,
      };

      await this.mcp.notification({
        method: `notifications/${this.channel}`,
        params: {
          content: JSON.stringify(event),
          meta: {
            source: "telegram",
            user: event.message.sender.id,
            session: event.message.chat.id,
            thread: String(event.message.message_id),
          },
        },
      } as never);
    } catch {
      // Ignore closed transport or unsupported client errors.
    }
  }
}

function parsePermissionVerdict(text: string): {
  requestId: string;
  behavior: "allow_once" | "allow_always" | "deny";
} | null {
  const match = PERMISSION_REPLY_RE.exec(text);
  if (!match) {
    return null;
  }
  const command = match[1]!.toLowerCase();
  const requestId = match[2]!.toLowerCase();
  if (command === "yes" || command === "y") {
    return { requestId, behavior: "allow_once" };
  }
  if (command === "always" || command === "a") {
    return { requestId, behavior: "allow_always" };
  }
  return { requestId, behavior: "deny" };
}
