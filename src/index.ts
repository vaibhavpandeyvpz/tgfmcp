#!/usr/bin/env node

import { Command } from "commander";
import { commands } from "./cli/index.js";
import { packageMetadata } from "./lib/package-metadata.js";

const program = new Command();

program
  .name(packageMetadata.name)
  .description(packageMetadata.description)
  .version(packageMetadata.version)
  .showHelpAfterError();

commands.forEach((command) => {
  command.register(program);
});

await program.parseAsync();
