import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const APP_FOLDER = ".tgfmcp";

export function appRoot(): string {
  const local = join(process.cwd(), APP_FOLDER);
  if (existsSync(local)) {
    return local;
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
