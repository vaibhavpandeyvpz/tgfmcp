import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ZodError, z } from "zod";
import { configPath } from "../paths.js";

const allowlistSchema = z.object({
  chats: z.array(z.string()).default([]),
  users: z.array(z.string()).default([]),
});

const telegramConfigSchema = z.object({
  botToken: z.string().default(""),
  allowlist: allowlistSchema.default({
    chats: [],
    users: [],
  }),
});

export type TelegramAllowlist = z.infer<typeof allowlistSchema>;
export type TelegramConfig = z.infer<typeof telegramConfigSchema>;

export type TelegramEventAllowlist = {
  chats: ReadonlySet<string>;
  users: ReadonlySet<string>;
  enabled: boolean;
};

const DEFAULT_CONFIG: TelegramConfig = {
  botToken: "",
  allowlist: {
    chats: [],
    users: [],
  },
};

export async function loadTelegramConfig(): Promise<TelegramConfig> {
  const path = configPath();
  try {
    const content = await readFile(path, "utf8");
    return normalizeConfig(telegramConfigSchema.parse(JSON.parse(content)));
  } catch (error) {
    if (isMissingFile(error)) {
      return DEFAULT_CONFIG;
    }
    if (error instanceof ZodError) {
      throw new Error(
        `Invalid Telegram config at ${path}. Expected { botToken, allowlist: { chats, users } }.`,
      );
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in Telegram config at ${path}.`);
    }
    throw error;
  }
}

export async function saveTelegramConfig(
  config: TelegramConfig,
): Promise<string> {
  const path = configPath();
  const normalized = normalizeConfig(config);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return path;
}

export function createEventAllowlist(
  allowlist: TelegramAllowlist,
): TelegramEventAllowlist {
  const chats = new Set(normalizeIds(allowlist.chats));
  const users = new Set(normalizeIds(allowlist.users));
  return {
    chats,
    users,
    enabled: chats.size > 0 || users.size > 0,
  };
}

function normalizeConfig(config: TelegramConfig): TelegramConfig {
  return {
    botToken: config.botToken.trim(),
    allowlist: {
      chats: normalizeIds(config.allowlist.chats),
      users: normalizeIds(config.allowlist.users),
    },
  };
}

function normalizeIds(values: ReadonlyArray<string>): string[] {
  return Array.from(
    new Set(
      values.map((value) => value.trim()).filter((value) => value.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
