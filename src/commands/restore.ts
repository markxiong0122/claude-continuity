import { existsSync } from "fs";
import { CC_REPO } from "../utils/claude-dirs";
import { GitTransport } from "../transport/git";
import { log, error } from "../utils/logger";

export async function restoreCommand(): Promise<void> {
  if (!existsSync(CC_REPO)) {
    error("Not initialized. Run: claude-continuity init <repo-url>");
    return;
  }

  const git = new GitTransport(CC_REPO);
  const logResult = await git.log(10);

  if (!logResult.stdout.trim()) {
    log("No sync history found.");
    return;
  }

  log("Recent sync history:\n");
  const commits = logResult.stdout.trim().split("\n");
  commits.forEach((line, i) => log(`  ${i + 1}. ${line}`));

  log("\nTo restore to a specific point:");
  log("  cd ~/.claude-continuity/repo");
  log("  git checkout <commit-hash> -- .");
  log("  claude-continuity pull");
  log("\nOr use: git reflog for full history");
}
