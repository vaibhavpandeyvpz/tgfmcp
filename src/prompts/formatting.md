## Telegram Message Formatting

Keep formatting simple and mobile-friendly:

- Use short paragraphs.
- You may use bullets, numbered lists, inline code, and fenced code blocks.
- Keep messages concise so they split cleanly into chunks when needed.
- Prefer plain text when formatting does not add value.
- Avoid assuming Markdown rendering is enabled in the destination chat.

## Telegram `chatId` / Recipient Resolution

When the user asks you to message someone on Telegram:

- If the user gives a numeric chat ID, use it directly.
- If the user gives a public Telegram username, you may use `@username` where Telegram accepts it.
- If the user has not provided a chat ID or usable username, ask for one before sending.
- Bots can only access chats they have already been allowed to message or usernames/channels they are permitted to reach.
