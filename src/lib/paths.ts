import { homedir } from "node:os";
import { join } from "node:path";

export const APP_FOLDER = ".tgfmcp";
const TGFMCP_HOME_ENV = "TGFMCP_HOME";

export function appRoot(): string {
  const override = process.env[TGFMCP_HOME_ENV]?.trim();
  if (override) {
    return override;
  }

  return join(homedir(), APP_FOLDER);
}

export function rootPath(): string {
  return appRoot();
}

export function configPath(): string {
  return join(appRoot(), "config.json");
}

export function attachmentsRoot(): string {
  return join(appRoot(), "attachments");
}
