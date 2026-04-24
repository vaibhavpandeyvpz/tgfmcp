import type { TelegramConfig } from "../lib/telegram/config.js";

export function resolveTelegramCredentials(config: TelegramConfig):
  | {
      token: string;
    }
  | undefined {
  const token = config.botToken.trim();
  if (token) {
    return { token };
  }
  return undefined;
}

export function telegramTokenHelpMessage(): string {
  return 'Run "tgfmcp configure" with a bot token before starting tgfmcp.';
}
