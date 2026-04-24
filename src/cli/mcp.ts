import process from "node:process";
import type { Command as CommanderCommand } from "commander";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CliIO } from "../lib/cli-io.js";
import { TelegramMcpServer } from "../lib/mcp/server.js";
import { register } from "../lib/signal-handler.js";
import type { CliCommand } from "../types.js";

const TOKEN_ENV_NAME = "TELEGRAM_BOT_TOKEN";

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
    const token = process.env[TOKEN_ENV_NAME]?.trim();

    if (!token) {
      throw new Error(`Set ${TOKEN_ENV_NAME} before starting tgfmcp.`);
    }

    const { TelegramSession } = await import("../lib/telegram/session.js");
    const session = new TelegramSession({
      token,
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
      const server = TelegramMcpServer.create(
        session,
        Boolean(options.channels),
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
