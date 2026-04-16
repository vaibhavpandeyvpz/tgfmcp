import type { CliCommand } from "../types.js";
import { McpCommand } from "./mcp.js";

export const commands: ReadonlyArray<CliCommand> = [new McpCommand()];
