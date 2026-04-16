# tgmcp

[![npm version](https://img.shields.io/npm/v/tgmcp)](https://www.npmjs.com/package/tgmcp)
[![Publish to NPM](https://github.com/vaibhavpandeyvpz/tgmcp/actions/workflows/publish-npm.yml/badge.svg)](https://github.com/vaibhavpandeyvpz/tgmcp/actions/workflows/publish-npm.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

`tgmcp` is an open-source Telegram stdio MCP server built on top of [`telegraf`](https://github.com/telegraf/telegraf), `commander`, and `@modelcontextprotocol/sdk`.

It lets MCP-compatible clients interact with the Telegram Bot API through Telegraf and optionally subscribe to incoming Telegram events through an MCP notification channel.

## Highlights

- Exposes Telegram as an MCP server over stdio.
- Uses `telegraf` directly for polling and Bot API operations.
- Connects using `TELEGRAM_BOT_TOKEN` from the environment.
- Provides direct Bot API tools for bot identity and chat lookups.
- Includes mutating tools for sending, replying, reacting, editing, deleting, forwarding, and typing.
- Can emit incoming message events over an optional MCP notification channel.
- Stores downloaded incoming media attachments under `~/.tgmcp/attachments/`.

## Requirements

- Node.js `24+`
- A Telegram bot token exported as `TELEGRAM_BOT_TOKEN`

## Installation

Use it without installing globally:

```bash
npx tgmcp mcp
```

Or with Bun:

```bash
bunx tgmcp mcp
```

If you prefer a global install:

```bash
npm install -g tgmcp
```

For local development:

```bash
npm install
npm run build
npm run dev -- mcp
```

## Quick Start

1. Export your Telegram bot token:

```bash
export TELEGRAM_BOT_TOKEN="123456:telegram-bot-token"
```

2. Start the MCP server:

```bash
npx tgmcp mcp
```

3. If your MCP host supports notifications and you want incoming Telegram events, provide a channel name:

```bash
npx tgmcp mcp --channel claude/channel
```

The server uses stdio, so it is meant to be launched by an MCP client or wrapper rather than browsed directly in a terminal.

## CLI Usage

### MCP Server

```bash
npx tgmcp mcp
bunx tgmcp mcp
```

Starts the stdio MCP server for the configured Telegram bot.

## MCP Tools

The server currently exposes these tools:

- `telegram_get_me`
- `telegram_get_status`
- `telegram_get_chat`
- `telegram_get_chat_administrators`
- `telegram_lookup_chat`
- `telegram_send_message`
- `telegram_send_media_from_base64`
- `telegram_send_media_from_path`
- `telegram_reply_to_message`
- `telegram_react_to_message`
- `telegram_edit_message`
- `telegram_delete_message`
- `telegram_forward_message`
- `telegram_send_typing`

## Push Channel

When started with `--channel <name>`, the server:

- advertises the experimental MCP capability `<name>`
- emits `notifications/<name>` for incoming Telegram message events

The event payload includes:

- `source`
- `self`
- `message`
- `text`

If an incoming message contains downloadable media, the file is downloaded and included as a local attachment path in the event payload. Files are stored under `~/.tgmcp/attachments/`.

## Local Data

`tgmcp` stores local state under `~/.tgmcp/`:

- `attachments/` for downloaded incoming media attachments

## Notes

- Telegram bots cannot access arbitrary private chats; they can only interact where the bot has been added, contacted, or is otherwise permitted.
- Message mutation tools that target an existing message require explicit `chatId` and `messageId` inputs.
- The CLI intentionally exposes only `tgmcp mcp`.

## License

MIT. See [LICENSE](LICENSE).
