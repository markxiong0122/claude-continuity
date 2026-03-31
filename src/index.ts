import { Command } from "commander";

const program = new Command();

program
  .name("claude-continuity")
  .description("Sync Claude Code sessions and config across devices")
  .version("0.1.0");

// Commands will be added in subsequent tasks

program.parse();
