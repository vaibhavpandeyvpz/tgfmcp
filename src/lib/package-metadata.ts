import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type PackageMetadata = {
  name: string;
  version: string;
  description: string;
};

export const packageMetadata = JSON.parse(
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../package.json"),
    "utf8",
  ),
) as PackageMetadata;
