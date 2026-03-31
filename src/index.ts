import { Command } from "commander";

const program = new Command();

program
  .name("claude-continuity")
  .description("Sync Claude Code sessions and config across devices")
  .version("0.1.0");

// Commands will be added in subsequent tasks

program
  .command("deps")
  .description("Show missing dependencies from synced skills")
  .action(async () => {
    const { depsCommand } = await import("./commands/deps");
    await depsCommand();
  });

program
  .command("restore")
  .description("Show sync history for rollback")
  .action(async () => {
    const { restoreCommand } = await import("./commands/restore");
    await restoreCommand();
  });

program.parse();
