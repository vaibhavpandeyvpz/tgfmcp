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
      .option("--channel <name>", "Channel name, for receiving notifications")
      .action(this.action.bind(this));
  }

  private async action(options: { channel?: string }): Promise<void> {
    let keep = false;
    const token = process.env[TOKEN_ENV_NAME]?.trim();

    if (!token) {
      throw new Error(`Set ${TOKEN_ENV_NAME} before starting tgmcp.`);
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
      this.io.line("Starting Telegram MCP server...");
      await session.start();
      const server = TelegramMcpServer.create(session, options.channel);
      await server.start(new StdioServerTransport());
      if (options.channel) {
        await server.subscribe();
      }
      keep = true;
    } finally {
      unregister();
      if (!keep) {
        await closeSession();
      }
    }
  }
}
