import { existsSync } from "fs";
import { CC_REPO, CLAUDE_HOME } from "../utils/claude-dirs";
import { ManifestSync } from "../sync/manifest";
import { log, error } from "../utils/logger";

export async function depsCommand(): Promise<void> {
  if (!existsSync(CC_REPO)) {
    error("Not initialized. Run: claude-continuity init <repo-url>");
    return;
  }

  const manifest = new ManifestSync(CLAUDE_HOME, CC_REPO);
  const localManifest = manifest.generate();
  const remoteManifest = manifest.loadFromRepo();

  if (!remoteManifest) {
    log("No remote manifest found. Run a push first.");
    return;
  }

  const diff = manifest.diff(remoteManifest, localManifest);

  if (diff.newSkills.length === 0 && !Object.values(diff.missingDeps).some(d => d && d.length > 0)) {
    log("✓ All dependencies are satisfied. Nothing missing.");
    return;
  }

  if (diff.newSkills.length > 0) {
    log(`New skills from ${remoteManifest.device}:`);
    for (const skill of diff.newSkills) log(`  + ${skill}`);
  }

  log("\nMissing dependencies:");
  if (diff.missingDeps.brew?.length) log(`  brew install ${diff.missingDeps.brew.join(" ")}`);
  if (diff.missingDeps.npm?.length) log(`  npm install -g ${diff.missingDeps.npm.join(" ")}`);
  if (diff.missingDeps.apt?.length) log(`  apt install ${diff.missingDeps.apt.join(" ")}`);
  if (diff.missingDeps.mcp?.length) log(`  MCP servers to configure: ${diff.missingDeps.mcp.join(", ")}`);
}
