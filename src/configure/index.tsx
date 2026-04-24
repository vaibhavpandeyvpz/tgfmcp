import React from "react";
import { render } from "ink";
import {
  loadTelegramConfig,
  saveTelegramConfig,
} from "../lib/telegram/config.js";
import { ConfigureApp } from "./app.js";

export async function configure(): Promise<void> {
  const initial = await loadTelegramConfig();
  let done = false;
  const { waitUntilExit, unmount } = render(
    <ConfigureApp
      initial={initial}
      onSave={async (config) => {
        await saveTelegramConfig(config);
      }}
      onExit={() => {
        done = true;
      }}
    />,
    { exitOnCtrlC: false },
  );

  try {
    await waitUntilExit();
  } finally {
    if (!done) {
      unmount();
    }
  }
}
