import process from "node:process";
import type { Command as CommanderCommand } from "commander";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CliIO } from "../lib/cli-io.js";
import { TelegramMcpServer } from "../lib/mcp/server.js";
import { register } from "../lib/signal-handler.js";
import {
  createEventAllowlist,
  loadTelegramConfig,
} from "../lib/telegram/config.js";
import type { CliCommand } from "../types.js";
import {
  resolveTelegramCredentials,
  telegramTokenHelpMessage,
} from "./telegram-auth.js";

export class McpCommand implements CliCommand {
  constructor(
    private readonly io = new CliIO(process.stderr, process.stderr),
  ) {}

  register(program: CommanderCommand): void {
    program
      .command("mcp")
      .description("Start the stdio MCP server for a Telegram bot")
      .option(
        "--channels",
        "Enable hooman/channel notifications for Telegram messages",
      )
      .action(this.action.bind(this));
  }

  private async action(options: { channels?: boolean }): Promise<void> {
    let keep = false;
    const config = await loadTelegramConfig();
    const credentials = resolveTelegramCredentials(config);
    if (!credentials?.token) {
      throw new Error(telegramTokenHelpMessage());
    }

    const { TelegramSession } = await import("../lib/telegram/session.js");
    const session = new TelegramSession({
      token: credentials.token,
      io: this.io,
    });
    let destroyed = false;
    const closeSession = async () => {
      if (destroyed) {
        return;
      }

      destroyed = true;
      await session.destroy();
    };
    const unregister = register(async () => {
      this.io.line("Shutting down Telegram MCP server...");
      await closeSession();
    });

    try {
      const allowlist = options.channels
        ? createEventAllowlist(config.allowlist)
        : undefined;
      const server = TelegramMcpServer.create(
        session,
        Boolean(options.channels),
        allowlist,
      );
      await server.start(new StdioServerTransport());
      if (options.channels) {
        await server.subscribe();
      }
      this.io.line("Starting Telegram MCP server...");
      await session.start();
      keep = true;
    } finally {
      unregister();
      if (!keep) {
        await closeSession();
      }
    }
  }
}
