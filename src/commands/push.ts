import { existsSync, readFileSync, writeFileSync } from "fs";
import { hostname } from "os";
import { CC_REPO, CC_CONFIG, CC_PENDING_PUSH, CLAUDE_HOME } from "../utils/claude-dirs";
import { GitTransport } from "../transport/git";
import { SessionSync } from "../sync/sessions";
import { ConfigSync } from "../sync/config";
import { SkillsSync } from "../sync/skills";
import { ManifestSync } from "../sync/manifest";
import { acquireLock, releaseLock } from "../utils/lock";
import { log, warn, error } from "../utils/logger";

interface PushOptions {
  quiet?: boolean;
  background?: boolean;
}

export async function pushCommand(options: PushOptions = {}): Promise<void> {
  if (options.background) {
    // Write a pending-push marker. The next pull (SessionStart) will process it.
    writeFileSync(CC_PENDING_PUSH, JSON.stringify({ timestamp: Date.now() }));
    return;
  }

  if (!acquireLock()) {
    warn("Another sync is in progress. Skipping push.");
    return;
  }

  try {
    if (!existsSync(CC_REPO)) {
      error("Not initialized. Run: claude-continuity init <repo-url>");
      return;
    }

    const git = new GitTransport(CC_REPO);
    const sessions = new SessionSync(CLAUDE_HOME, CC_REPO);
    const sessionResult = sessions.pushToRepo();
    const config = new ConfigSync(CLAUDE_HOME, CC_REPO);
    const configResult = config.pushToRepo();
    const skills = new SkillsSync(CLAUDE_HOME, CC_REPO);
    const skillsResult = skills.pushToRepo();
    const manifest = new ManifestSync(CLAUDE_HOME, CC_REPO);
    const manifestData = manifest.generate();
    manifest.saveToRepo(manifestData);

    const total = sessionResult.filesUpdated + configResult.filesUpdated + skillsResult.filesUpdated;
    if (total === 0) {
      log("Nothing to sync.");
      return;
    }

    const message = `sync from ${hostname()} at ${new Date().toISOString()}`;
    const pushResult = await git.commitAndPush(message);

    if (pushResult.success) {
      log(`⬆ Pushed: ${sessionResult.filesUpdated} sessions, ${configResult.filesUpdated} config, ${skillsResult.filesUpdated} skills`);
    } else {
      warn("Push failed (offline?). Changes will sync on next push.");
    }
  } finally {
    releaseLock();
  }
}
