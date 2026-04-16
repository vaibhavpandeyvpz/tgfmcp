import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const source = resolve(projectRoot, "src", "prompts");
const destination = resolve(projectRoot, "dist", "prompts");

await mkdir(dirname(destination), { recursive: true });
await cp(source, destination, { recursive: true });
