import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { Telegram } from "telegraf";
import { attachmentsRoot } from "./paths.js";

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\]/g, "_").slice(0, 200) || "file";
}

function extensionForMimeType(mimeType?: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "video/mp4":
      return ".mp4";
    case "audio/mpeg":
      return ".mp3";
    case "audio/ogg":
      return ".ogg";
    case "application/pdf":
      return ".pdf";
    default:
      return "";
  }
}

export async function saveTelegramFile(
  telegram: Telegram,
  fileId: string,
  filename?: string,
  mimeType?: string,
): Promise<string | undefined> {
  try {
    const url = await telegram.getFileLink(fileId);
    const response = await fetch(url);
    if (!response.ok) {
      return undefined;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const safeName =
      filename && extname(filename)
        ? sanitizeFilename(filename)
        : sanitizeFilename(filename ?? `attachment-${Date.now()}`) +
          extensionForMimeType(mimeType);

    const root = attachmentsRoot();
    await mkdir(root, { recursive: true });
    const localPath = join(root, `${randomUUID()}-${safeName}`);
    await writeFile(localPath, buffer);
    return localPath;
  } catch {
    return undefined;
  }
}
