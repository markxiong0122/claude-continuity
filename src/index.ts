#!/usr/bin/env bun
import { Command } from "commander";
import { setQuiet } from "./utils/logger";

const program = new Command();

program
  .name("claude-continuity")
  .description("Sync Claude Code sessions and config across devices")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize sync with a git repo")
  .argument("<remote-url>", "Git remote URL (e.g., git@github.com:user/claude-sync-data.git)")
  .action(async (remoteUrl: string) => {
    const { initCommand } = await import("./commands/init");
    await initCommand(remoteUrl);
  });

program
  .command("push")
  .description("Push local state to sync repo")
  .option("-q, --quiet", "Suppress output")
  .option("-b, --background", "Write pending-push marker for next pull")
  .action(async (options) => {
    if (options.quiet) setQuiet(true);
    const { pushCommand } = await import("./commands/push");
    await pushCommand(options);
  });

program
  .command("pull")
  .description("Pull remote state to local")
  .option("-q, --quiet", "Suppress output")
  .action(async (options) => {
    if (options.quiet) setQuiet(true);
    const { pullCommand } = await import("./commands/pull");
    await pullCommand(options);
  });

program
  .command("status")
  .description("Show sync status")
  .action(async () => {
    const { statusCommand } = await import("./commands/status");
    await statusCommand();
  });

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

program
  .command("sync-plugins")
  .description("Accept or decline pending plugin changes from other devices")
  .option("--accept <ids...>", "Plugin IDs to accept/enable")
  .option("--decline <ids...>", "Plugin IDs to decline (won't ask again)")
  .option("--remove <ids...>", "Plugin IDs to remove locally (deleted on remote)")
  .option("--keep <ids...>", "Plugin IDs to keep locally (won't ask again)")
  .option("--all", "Accept all new plugins and remove all deleted ones")
  .option("--none", "Decline all new plugins and keep all deleted ones")
  .action(async (options) => {
    const { syncPluginsCommand } = await import("./commands/sync-plugins");
    await syncPluginsCommand(options);
  });

program.parse();
