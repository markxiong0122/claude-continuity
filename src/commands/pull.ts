import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";
import { CC_REPO, CC_PENDING_PUSH, CLAUDE_HOME } from "../utils/claude-dirs";
import { GitTransport } from "../transport/git";
import { SessionSync } from "../sync/sessions";
import { ConfigSync } from "../sync/config";
import { SkillsSync } from "../sync/skills";
import { ManifestSync } from "../sync/manifest";
import { waitForLock } from "../utils/lock";
import { log, warn, error } from "../utils/logger";
import { pushCommand } from "./push";

interface PullOptions {
  quiet?: boolean;
}

export async function pullCommand(options: PullOptions = {}): Promise<void> {
  if (!existsSync(CC_REPO)) {
    if (!options.quiet) error("Not initialized. Run: claude-continuity init <repo-url>");
    return;
  }

  // Process pending push from previous session
  if (existsSync(CC_PENDING_PUSH)) {
    try { unlinkSync(CC_PENDING_PUSH); } catch {}
    await pushCommand({ quiet: true });
  }

  await waitForLock(3000);

  const git = new GitTransport(CC_REPO);
  const pullResult = await git.pull();
  if (!pullResult.success) {
    if (!options.quiet) warn("Pull failed (offline?). Using local state.");
    return;
  }

  const manifest = new ManifestSync(CLAUDE_HOME, CC_REPO);
  const localManifest = manifest.generate();
  const remoteManifest = manifest.loadFromRepo();

  const sessions = new SessionSync(CLAUDE_HOME, CC_REPO);
  const sessionResult = sessions.pullFromRepo();
  const config = new ConfigSync(CLAUDE_HOME, CC_REPO);
  const configResult = config.pullFromRepo();

  // Plugin sync notifications (always output, even in quiet mode, so Claude sees it)
  if (configResult.pendingPlugins) {
    const { newFromRemote, deletedOnRemote } = configResult.pendingPlugins;
    const parts: string[] = [];
    if (newFromRemote.length > 0) {
      parts.push(`${newFromRemote.length} new plugin(s) from other device: ${newFromRemote.map((p) => p.id).join(", ")}`);
    }
    if (deletedOnRemote.length > 0) {
      parts.push(`${deletedOnRemote.length} plugin(s) deleted on other device: ${deletedOnRemote.map((p) => p.id).join(", ")}`);
    }
    // Use console.log directly — this must be visible even in quiet mode
    // so Claude Code can see the hook output and ask the user
    console.log(`⚠ Plugin sync: ${parts.join(". ")}. Ask the user which plugins to sync, then run: claude-continuity sync-plugins --accept <ids> --decline <ids> --remove <ids> --keep <ids>`);
  }
  const skills = new SkillsSync(CLAUDE_HOME, CC_REPO);
  const skillsResult = skills.pullFromRepo();

  // Dependency notifications
  if (remoteManifest) {
    const diff = manifest.diff(remoteManifest, localManifest);

    if (diff.newSkills.length > 0) {
      log(`\n⚠ ${diff.newSkills.length} new skill(s) synced from ${remoteManifest.device}:`);
      for (const skill of diff.newSkills) log(`  + ${skill}`);
    }

    if (diff.removedSkills.length > 0) {
      log(`\n⚠ ${diff.removedSkills.length} skill(s) removed on ${remoteManifest.device}:`);
      for (const skill of diff.removedSkills) log(`  - ${skill}`);
    }

    const hasMissing = Object.values(diff.missingDeps).some((d) => d && d.length > 0);
    if (hasMissing) {
      log("\n⚠ Missing dependencies:");
      if (diff.missingDeps.brew?.length) log(`  brew install ${diff.missingDeps.brew.join(" ")}`);
      if (diff.missingDeps.npm?.length) log(`  npm install -g ${diff.missingDeps.npm.join(" ")}`);
      if (diff.missingDeps.apt?.length) log(`  apt install ${diff.missingDeps.apt.join(" ")}`);
      if (diff.missingDeps.mcp?.length) log(`  MCP servers to configure: ${diff.missingDeps.mcp.join(", ")}`);
    }
  }

  if (sessionResult.filesUpdated > 0 && !options.quiet) {
    log(`\n⬇ Synced: ${sessionResult.filesUpdated} sessions`);
    printHandoffSummary();
  }
}

function printHandoffSummary(): void {
  try {
    const projectsDir = join(CLAUDE_HOME, "projects");
    if (!existsSync(projectsDir)) return;

    // Find the newest JSONL file across all projects
    let newestFile = "";
    let newestMtime = 0;

    for (const dir of readdirSync(projectsDir, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const projDir = join(projectsDir, dir.name);
      for (const file of readdirSync(projDir)) {
        if (!file.endsWith(".jsonl")) continue;
        const filePath = join(projDir, file);
        const stat = statSync(filePath);
        if (stat.mtimeMs > newestMtime) {
          newestMtime = stat.mtimeMs;
          newestFile = filePath;
        }
      }
    }

    if (!newestFile) return;

    // Read last assistant message
    const content = readFileSync(newestFile, "utf-8");
    const lines = content.trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const obj = JSON.parse(lines[i]);
        if (obj.type === "assistant" && obj.message?.content) {
          const text = typeof obj.message.content === "string"
            ? obj.message.content
            : JSON.stringify(obj.message.content);
          const truncated = text.length > 120 ? "..." + text.slice(-117) : text;
          log(`↩ Resuming: '${truncated}'`);
          return;
        }
      } catch { continue; }
    }
  } catch { /* ignore handoff errors */ }
}
