import { existsSync, readFileSync } from "fs";
import { CC_REPO, CC_CONFIG, CLAUDE_HOME } from "../utils/claude-dirs";
import { GitTransport } from "../transport/git";
import { HookInstaller } from "../hooks/installer";
import { log } from "../utils/logger";

export async function statusCommand(): Promise<void> {
  log("claude-continuity status\n");

  if (existsSync(CC_CONFIG)) {
    const config = JSON.parse(readFileSync(CC_CONFIG, "utf-8"));
    log(`Remote: ${config.remote}`);
  } else {
    log("Not initialized. Run: claude-continuity init <repo-url>");
    return;
  }

  if (existsSync(CC_REPO)) {
    const git = new GitTransport(CC_REPO);
    const status = await git.status();
    const pending = status.stdout.trim().split("\n").filter(Boolean).length;
    log(`Repo: ${CC_REPO}`);
    log(`Pending changes: ${pending}`);

    const lastLog = await git.log(1);
    if (lastLog.stdout.trim()) {
      log(`Last sync: ${lastLog.stdout.trim()}`);
    }
  }

  const installer = new HookInstaller(CLAUDE_HOME);
  log(`Hooks: ${installer.isInstalled() ? "installed" : "not installed"}`);
}
