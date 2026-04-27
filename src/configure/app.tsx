import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Telegraf } from "telegraf";
import { Box, Text, useApp, useInput } from "ink";
import { z } from "zod";
import { configPath, rootPath } from "../lib/paths.js";
import type { TelegramConfig } from "../lib/telegram/config.js";
import { BusyScreen } from "./components/BusyScreen.js";
import { HomeScreen } from "./components/HomeScreen.js";
import { MenuScreen } from "./components/MenuScreen.js";
import { PromptForm } from "./components/PromptForm.js";
import type {
  ConfigureAppProps,
  ConfigureScreen,
  MenuItem,
  Notice,
  PromptState,
} from "./types.js";

type UserCandidate = {
  id: string;
  label: string;
};

type ChatCandidate = {
  id: string;
  label: string;
};

type EnrollmentTarget = "users" | "chats";

type EnrollmentState = {
  target: EnrollmentTarget;
  code: string;
  offset: number;
};

const inboundMessageSchema = z.object({
  from: z
    .object({
      id: z.number(),
      username: z.string().optional(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
    })
    .optional(),
  chat: z.object({
    id: z.number(),
    type: z.string(),
    title: z.string().optional(),
    username: z.string().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  }),
  text: z.string().optional(),
  caption: z.string().optional(),
});

const updatesSchema = z.array(
  z.object({
    update_id: z.number(),
    message: inboundMessageSchema.optional(),
    edited_message: inboundMessageSchema.optional(),
    channel_post: inboundMessageSchema.optional(),
    edited_channel_post: inboundMessageSchema.optional(),
  }),
);

export function ConfigureApp({
  initial,
  onSave,
  onExit,
}: ConfigureAppProps): React.JSX.Element {
  const { exit } = useApp();
  const [screen, setScreen] = useState<ConfigureScreen>({ kind: "home" });
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<TelegramConfig>(initial);
  const [users, setUsers] = useState<UserCandidate[] | null>(null);
  const [chats, setChats] = useState<ChatCandidate[] | null>(null);
  const [enrollment, setEnrollment] = useState<EnrollmentState | null>(null);

  const runTask = useCallback(
    async (label: string, task: () => Promise<void>) => {
      setBusyMessage(label);
      try {
        await task();
      } catch (error) {
        setNotice({
          kind: "error",
          text: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setBusyMessage(null);
      }
    },
    [],
  );

  const setSuccess = useCallback((text: string) => {
    setNotice({ kind: "success", text });
  }, []);

  useEffect(() => {
    if (
      enrollment &&
      ((enrollment.target === "users" && screen.kind !== "edit-users") ||
        (enrollment.target === "chats" && screen.kind !== "edit-chats"))
    ) {
      setEnrollment(null);
    }
  }, [enrollment, screen.kind]);

  useEffect(() => {
    if (!enrollment) {
      return;
    }
    const token = draft.botToken.trim();
    if (!token) {
      return;
    }

    const bot = new Telegraf(token);
    let cancelled = false;

    const poll = async () => {
      let offset = enrollment.offset;
      while (!cancelled) {
        try {
          const updates = updatesSchema.parse(
            await bot.telegram.callApi("getUpdates", {
              allowed_updates: [
                "message",
                "edited_message",
                "channel_post",
                "edited_channel_post",
              ],
              offset,
              limit: 25,
              timeout: 10,
            }),
          );

          for (const update of updates) {
            offset = Math.max(offset, update.update_id + 1);
            const candidates = [
              update.message,
              update.edited_message,
              update.channel_post,
              update.edited_channel_post,
            ].filter((value): value is NonNullable<typeof value> =>
              Boolean(value),
            );

            for (const message of candidates) {
              const body = `${message.text ?? ""}\n${message.caption ?? ""}`;
              if (!containsCode(body, enrollment.code)) {
                continue;
              }
              if (enrollment.target === "users") {
                if (!message.from) {
                  continue;
                }
                const sender = message.from;
                const userId = String(sender.id);
                setDraft((current) => ({
                  ...current,
                  allowlist: {
                    ...current.allowlist,
                    users: addId(current.allowlist.users, userId),
                  },
                }));
                setUsers((current) => upsertUserCandidate(current, sender));
                setNotice({
                  kind: "success",
                  text: `Added user ${userId} after code match.`,
                });
                setEnrollment(null);
                return;
              }

              const chatId = String(message.chat.id);
              setDraft((current) => ({
                ...current,
                allowlist: {
                  ...current.allowlist,
                  chats: addId(current.allowlist.chats, chatId),
                },
              }));
              setChats((current) => upsertChatCandidate(current, message.chat));
              setNotice({
                kind: "success",
                text: `Added chat ${chatId} after code match.`,
              });
              setEnrollment(null);
              return;
            }
          }

          if (cancelled) {
            return;
          }
          setEnrollment((current) =>
            current
              ? {
                  ...current,
                  offset,
                }
              : current,
          );
        } catch (error) {
          if (!cancelled) {
            setNotice({
              kind: "error",
              text: error instanceof Error ? error.message : String(error),
            });
            setEnrollment(null);
          }
          return;
        }
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [draft.botToken, enrollment]);

  useInput(
    (input, key) => {
      if (key.ctrl && input.toLowerCase() === "c") {
        onExit();
        exit();
        return;
      }
      if (!key.escape || busyMessage) {
        return;
      }
      if (prompt) {
        prompt.onCancel?.();
        setPrompt(null);
        return;
      }
      if (screen.kind !== "home") {
        setScreen({ kind: "home" });
      }
    },
    { isActive: true },
  );

  const promptBotToken = useCallback(() => {
    setPrompt({
      title: "Update Bot token",
      label: "Bot token",
      note: "Value is stored in ~/.tgfmcp/config.json.",
      initialValue: draft.botToken,
      onSubmit: async (value) => {
        const next = value.trim();
        setDraft((current) => ({ ...current, botToken: next }));
        setUsers(null);
        setChats(null);
        setPrompt(null);
        setSuccess("Updated bot token.");
      },
    });
  }, [draft.botToken, setSuccess]);

  const loadAllowlistCandidates = useCallback(async () => {
    const token = draft.botToken.trim();
    if (!token) {
      throw new Error("Bot token is required before loading allowlist data.");
    }
    const discovered = await fetchAllowlistCandidates(token);
    setUsers(discovered.users);
    setChats(discovered.chats);
  }, [draft.botToken]);

  const openUsersEditor = useCallback(() => {
    void runTask("Loading Telegram users...", async () => {
      await loadAllowlistCandidates();
      setScreen({ kind: "edit-users" });
    });
  }, [loadAllowlistCandidates, runTask]);

  const openChatsEditor = useCallback(() => {
    void runTask("Loading Telegram chats...", async () => {
      await loadAllowlistCandidates();
      setScreen({ kind: "edit-chats" });
    });
  }, [loadAllowlistCandidates, runTask]);

  const startCodeEnrollment = useCallback(
    (target: EnrollmentTarget) => {
      void runTask("Preparing verification code...", async () => {
        const token = draft.botToken.trim();
        if (!token) {
          throw new Error(
            "Bot token is required before adding allowlist entries.",
          );
        }
        const [offset, discovered] = await Promise.all([
          fetchInitialOffset(token),
          fetchAllowlistCandidates(token),
        ]);
        setUsers(discovered.users);
        setChats(discovered.chats);
        const code = generateShortCode();
        setEnrollment({
          target,
          code,
          offset,
        });
        setNotice({
          kind: "info",
          text:
            target === "users"
              ? `Send "${code}" from the user you want to allow.`
              : `Send "${code}" in the chat you want to allow.`,
        });
      });
    },
    [draft.botToken, runTask],
  );

  const saveAndExit = useCallback(() => {
    void runTask("Saving configuration...", async () => {
      if (!draft.botToken.trim()) {
        throw new Error("Bot token is required.");
      }
      await onSave(draft);
      onExit();
      exit();
    });
  }, [draft, exit, onExit, onSave, runTask]);

  const summary = useMemo(
    () =>
      `users:${draft.allowlist.users.length} • chats:${draft.allowlist.chats.length}`,
    [draft],
  );

  const renderHome = () => {
    const items: MenuItem[] = [
      {
        label: `Bot token • ${maskPresence(draft.botToken)}`,
        value: promptBotToken,
      },
      {
        label: `Allowed users • ${draft.allowlist.users.length} selected`,
        value: openUsersEditor,
      },
      {
        label: `Allowed chats • ${draft.allowlist.chats.length} selected`,
        value: openChatsEditor,
      },
      {
        label: "Save and exit",
        value: saveAndExit,
      },
      {
        label: "Exit without saving",
        value: () => {
          onExit();
          exit();
        },
      },
    ];
    return (
      <HomeScreen
        rootPath={rootPath()}
        configPath={configPath()}
        items={items}
      />
    );
  };

  const renderUsersEditor = () => {
    const entries = users ?? [];
    const selected = new Set(draft.allowlist.users);
    const merged = new Map(entries.map((entry) => [entry.id, entry]));
    for (const id of selected) {
      if (!merged.has(id)) {
        merged.set(id, { id, label: id });
      }
    }
    const displayEntries = Array.from(merged.values()).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const activeCode = enrollment?.target === "users" ? enrollment.code : null;
    const items: MenuItem[] = [
      {
        key: "users:add-code",
        label: activeCode
          ? `Regenerate code (${activeCode})`
          : "Add user via code",
        value: () => {
          startCodeEnrollment("users");
        },
      },
      ...(activeCode
        ? [
            {
              key: "users:hint",
              label: `Waiting for message containing code: ${activeCode}`,
              value: () => undefined,
            } satisfies MenuItem,
          ]
        : []),
      ...displayEntries.map((user) => {
        const isSelected = selected.has(user.id);
        return {
          key: `user:${user.id}`,
          label: `${isSelected ? "[x]" : "[ ]"} ${user.label}`,
          value: () => {
            setDraft((current) => ({
              ...current,
              allowlist: {
                ...current.allowlist,
                users: toggleId(current.allowlist.users, user.id),
              },
            }));
          },
        };
      }),
      {
        key: "users:back",
        label: "Back",
        value: () => setScreen({ kind: "home" }),
      },
    ];
    return (
      <MenuScreen
        title="Allowed Users"
        description={
          activeCode
            ? `Send "${activeCode}" from the user to allow, then wait for capture.`
            : "Toggle users for inbound event allowlist."
        }
        items={items}
        footerHint="enter: toggle/select | esc: back | ctrl+c: exit"
      />
    );
  };

  const renderChatsEditor = () => {
    const entries = chats ?? [];
    const selected = new Set(draft.allowlist.chats);
    const merged = new Map(entries.map((entry) => [entry.id, entry]));
    for (const id of selected) {
      if (!merged.has(id)) {
        merged.set(id, { id, label: id });
      }
    }
    const displayEntries = Array.from(merged.values()).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const activeCode = enrollment?.target === "chats" ? enrollment.code : null;
    const items: MenuItem[] = [
      {
        key: "chats:add-code",
        label: activeCode
          ? `Regenerate code (${activeCode})`
          : "Add chat via code",
        value: () => {
          startCodeEnrollment("chats");
        },
      },
      ...(activeCode
        ? [
            {
              key: "chats:hint",
              label: `Waiting for message containing code: ${activeCode}`,
              value: () => undefined,
            } satisfies MenuItem,
          ]
        : []),
      ...displayEntries.map((chat) => {
        const isSelected = selected.has(chat.id);
        return {
          key: `chat:${chat.id}`,
          label: `${isSelected ? "[x]" : "[ ]"} ${chat.label}`,
          value: () => {
            setDraft((current) => ({
              ...current,
              allowlist: {
                ...current.allowlist,
                chats: toggleId(current.allowlist.chats, chat.id),
              },
            }));
          },
        };
      }),
      {
        key: "chats:back",
        label: "Back",
        value: () => setScreen({ kind: "home" }),
      },
    ];
    return (
      <MenuScreen
        title="Allowed Chats"
        description={
          activeCode
            ? `Send "${activeCode}" in the chat to allow, then wait for capture.`
            : "Toggle chats for inbound event allowlist."
        }
        items={items}
        footerHint="enter: toggle/select | esc: back | ctrl+c: exit"
      />
    );
  };

  const body = (() => {
    if (busyMessage) {
      return <BusyScreen message={busyMessage} />;
    }
    if (prompt) {
      return (
        <PromptForm
          prompt={prompt}
          onSubmit={async (value) => {
            try {
              await prompt.onSubmit(value);
            } catch (error) {
              setNotice({
                kind: "error",
                text: error instanceof Error ? error.message : String(error),
              });
            }
          }}
        />
      );
    }
    if (screen.kind === "edit-users") {
      return renderUsersEditor();
    }
    if (screen.kind === "edit-chats") {
      return renderChatsEditor();
    }
    return renderHome();
  })();

  return (
    <Box flexDirection="column" width="100%" paddingX={1}>
      {notice ? (
        <Box marginTop={1}>
          <Text color={noticeColor(notice.kind)}>{notice.text}</Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text color="gray">{summary}</Text>
      </Box>
      {body}
    </Box>
  );
}

function noticeColor(kind: Notice["kind"]): "green" | "yellow" | "red" {
  if (kind === "success") {
    return "green";
  }
  if (kind === "info") {
    return "yellow";
  }
  return "red";
}

function maskPresence(value: string): string {
  return value.trim() ? "[REDACTED]" : "empty";
}

function toggleId(list: ReadonlyArray<string>, id: string): string[] {
  const set = new Set(list);
  if (set.has(id)) {
    set.delete(id);
  } else {
    set.add(id);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function addId(list: ReadonlyArray<string>, id: string): string[] {
  return Array.from(new Set([...list, id])).sort((a, b) => a.localeCompare(b));
}

function generateShortCode(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let index = 0; index < 4; index += 1) {
    const position = Math.floor(Math.random() * alphabet.length);
    code += alphabet[position];
  }
  return code;
}

function containsCode(input: string, code: string): boolean {
  return input.toLowerCase().includes(code.toLowerCase());
}

function upsertUserCandidate(
  current: UserCandidate[] | null,
  user: {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  },
): UserCandidate[] {
  const mapping = new Map(
    (current ?? []).map((candidate) => [candidate.id, candidate]),
  );
  const id = String(user.id);
  mapping.set(id, {
    id,
    label: formatUserLabel(user),
  });
  return Array.from(mapping.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function upsertChatCandidate(
  current: ChatCandidate[] | null,
  chat: {
    id: number;
    type: string;
    title?: string;
    username?: string;
    first_name?: string;
    last_name?: string;
  },
): ChatCandidate[] {
  const mapping = new Map(
    (current ?? []).map((candidate) => [candidate.id, candidate]),
  );
  const id = String(chat.id);
  mapping.set(id, {
    id,
    label: formatChatLabel(chat),
  });
  return Array.from(mapping.values()).sort((a, b) => a.id.localeCompare(b.id));
}

async function fetchInitialOffset(token: string): Promise<number> {
  const bot = new Telegraf(token);
  const updates = updatesSchema.parse(
    await bot.telegram.callApi("getUpdates", {
      allowed_updates: [
        "message",
        "edited_message",
        "channel_post",
        "edited_channel_post",
      ],
      limit: 1,
      timeout: 0,
    }),
  );
  const latest = updates.reduce(
    (max, update) => Math.max(max, update.update_id),
    0,
  );
  return latest > 0 ? latest + 1 : 0;
}

async function fetchAllowlistCandidates(token: string): Promise<{
  users: UserCandidate[];
  chats: ChatCandidate[];
}> {
  const bot = new Telegraf(token);
  const updates = updatesSchema.parse(
    await bot.telegram.callApi("getUpdates", {
      allowed_updates: [
        "message",
        "edited_message",
        "channel_post",
        "edited_channel_post",
      ],
      limit: 100,
      timeout: 1,
    }),
  );

  const users = new Map<string, UserCandidate>();
  const chats = new Map<string, ChatCandidate>();

  for (const update of updates) {
    const candidates = [
      update.message,
      update.edited_message,
      update.channel_post,
      update.edited_channel_post,
    ].filter((value): value is NonNullable<typeof value> => Boolean(value));

    for (const candidate of candidates) {
      const chatId = String(candidate.chat.id);
      chats.set(chatId, {
        id: chatId,
        label: formatChatLabel(candidate.chat),
      });

      if (candidate.from) {
        const userId = String(candidate.from.id);
        users.set(userId, {
          id: userId,
          label: formatUserLabel(candidate.from),
        });
      }
    }
  }

  return {
    users: Array.from(users.values()).sort((a, b) => a.id.localeCompare(b.id)),
    chats: Array.from(chats.values()).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function formatUserLabel(user: {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}): string {
  const preferredName =
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    (user.username ? `@${user.username}` : undefined);
  if (!preferredName) {
    return String(user.id);
  }
  return `${preferredName} (${user.id})`;
}

function formatChatLabel(chat: {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}): string {
  const name =
    chat.title?.trim() ||
    [chat.first_name, chat.last_name].filter(Boolean).join(" ").trim() ||
    (chat.username ? `@${chat.username}` : undefined);
  if (!name) {
    return `${chat.type} (${chat.id})`;
  }
  return `${name} (${chat.id})`;
}
