import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const APP_FOLDER = ".tgmcp";

export function appRoot(): string {
  return join(homedir(), APP_FOLDER);
}

export function attachmentsRoot(): string {
  return join(appRoot(), "attachments");
}

export async function deleteAppData(): Promise<void> {
  await rm(appRoot(), { recursive: true, force: true });
}
