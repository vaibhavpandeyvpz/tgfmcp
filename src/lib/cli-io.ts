import process from "node:process";
import type { Connection } from "./telegram/types.js";

export class CliIO {
  constructor(
    private readonly stdout: NodeJS.WriteStream = process.stdout,
    private readonly stderr: NodeJS.WriteStream = process.stderr,
  ) {}

  line(message: string): void {
    this.stdout.write(`${message}\n`);
  }

  error(message: string): void {
    this.stderr.write(`${message}\n`);
  }

  info(info: Connection): void {
    this.line(`Token env: ${info.profile.env}`);
    this.line(`Connection status: ${info.status}`);
    if (info.bot?.username) {
      this.line(`Bot username: @${info.bot.username}`);
    }
  }
}
