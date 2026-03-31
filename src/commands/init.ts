import { existsSync, mkdirSync, writeFileSync } from "fs";
import { CC_HOME, CC_REPO, CC_CONFIG, CLAUDE_HOME } from "../utils/claude-dirs";
import { GitTransport } from "../transport/git";
import { HookInstaller } from "../hooks/installer";
import { log, error } from "../utils/logger";

export async function initCommand(remoteUrl: string): Promise<void> {
  log("Initializing claude-continuity...");
  mkdirSync(CC_HOME, { recursive: true });
  writeFileSync(CC_CONFIG, JSON.stringify({ remote: remoteUrl }, null, 2));

  if (!existsSync(CC_REPO)) mkdirSync(CC_REPO, { recursive: true });

  const git = new GitTransport(CC_REPO);

  if (await git.isRepo()) {
    log("Sync repo already exists. Pulling latest...");
    await git.pull();
  } else {
    log(`Cloning sync repo from ${remoteUrl}...`);
    const result = await git.clone(remoteUrl);
    if (!result.success) {
      await git.init();
      await git.addRemote("origin", remoteUrl);
      log("Initialized new sync repo.");
    }
  }

  const installer = new HookInstaller(CLAUDE_HOME);
  installer.install();
  log("Installed Claude Code hooks (SessionStart → pull, Stop → push)");

  log("\n✓ claude-continuity initialized!");
  log("  Sync repo: " + CC_REPO);
  log("  Remote: " + remoteUrl);
  log("  Hooks: installed");
  log("\nYour sessions will now sync automatically.");
}
