import { existsSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import { CLAUDE_SETTINGS, CLAUDE_PLUGINS } from "../utils/claude-dirs";
import { CC_REPO } from "../utils/claude-dirs";
import { readPending, clearPending, applyPluginChoices } from "../sync/plugins";
import { log, warn, error } from "../utils/logger";

interface SyncPluginsOptions {
  accept?: string[];
  decline?: string[];
  remove?: string[];
  keep?: string[];
  all?: boolean;
  none?: boolean;
}

/**
 * Install a plugin using Claude Code's own plugin system.
 * 1. Add the marketplace if not already registered
 * 2. Install the plugin from that marketplace
 */
function installPlugin(pluginId: string, marketplace: { source: string; repo: string } | undefined): boolean {
  if (!marketplace) {
    warn(`No marketplace info for ${pluginId}, skipping install`);
    return false;
  }

  const [, marketplaceName] = pluginId.split("@");
  if (!marketplaceName) return false;

  // Add marketplace (idempotent — Claude Code skips if already added)
  if (marketplace.source === "github") {
    log(`  ${pluginId}: adding marketplace ${marketplace.repo}...`);
    const addResult = spawnSync("claude", ["plugin", "marketplace", "add", marketplace.repo], {
      timeout: 30000,
      stdio: "pipe",
    });
    if (addResult.status !== 0) {
      const stderr = addResult.stderr?.toString().trim();
      // "already exists" is fine
      if (!stderr.includes("already")) {
        warn(`  ${pluginId}: marketplace add failed — ${stderr}`);
        return false;
      }
    }
  }

  // Install the plugin
  log(`  ${pluginId}: installing...`);
  const installResult = spawnSync("claude", ["plugin", "install", pluginId], {
    timeout: 60000,
    stdio: "pipe",
  });

  if (installResult.status !== 0) {
    warn(`  ${pluginId}: install failed — ${installResult.stderr?.toString().trim()}`);
    return false;
  }

  log(`  ${pluginId}: installed`);
  return true;
}

/**
 * Uninstall a plugin using Claude Code's plugin system, then clean cache.
 */
function uninstallPlugin(pluginId: string): boolean {
  const [, marketplaceName] = pluginId.split("@");
  if (!marketplaceName) return false;

  log(`  ${pluginId}: uninstalling...`);
  const result = spawnSync("claude", ["plugin", "uninstall", pluginId], {
    timeout: 30000,
    stdio: "pipe",
  });

  if (result.status !== 0) {
    // If uninstall fails, fall back to manual cleanup
    const cacheDir = join(CLAUDE_PLUGINS, "cache", marketplaceName);
    if (existsSync(cacheDir)) {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  }

  log(`  ${pluginId}: removed`);
  return true;
}

export async function syncPluginsCommand(options: SyncPluginsOptions): Promise<void> {
  const pending = readPending();

  if (pending.newFromRemote.length === 0 && pending.deletedOnRemote.length === 0) {
    log("No pending plugin changes.");
    return;
  }

  let accept: string[] = [];
  let decline: string[] = [];
  let remove: string[] = [];
  let keep: string[] = [];

  if (options.all) {
    accept = pending.newFromRemote.map((p) => p.id);
    remove = pending.deletedOnRemote.map((p) => p.id);
  } else if (options.none) {
    decline = pending.newFromRemote.map((p) => p.id);
    keep = pending.deletedOnRemote.map((p) => p.id);
  } else {
    accept = options.accept ?? [];
    decline = options.decline ?? [];
    remove = options.remove ?? [];
    keep = options.keep ?? [];
  }

  // Build a lookup of pending plugin marketplace info
  const pendingLookup = new Map(pending.newFromRemote.map((p) => [p.id, p.marketplace]));

  // Load remote settings for marketplace info (used by applyPluginChoices for declined/kept decisions)
  const repoSettingsPath = join(CC_REPO, "settings.json");
  const remoteMarketplaces = existsSync(repoSettingsPath)
    ? (JSON.parse(readFileSync(repoSettingsPath, "utf-8")).extraKnownMarketplaces ?? {})
    : {};

  // Install accepted plugins via Claude Code's plugin system
  if (accept.length > 0) {
    log(`Installing ${accept.length} plugin(s):`);
    for (const id of accept) {
      installPlugin(id, pendingLookup.get(id));
    }
  }

  // Uninstall removed plugins via Claude Code's plugin system
  if (remove.length > 0) {
    log(`Removing ${remove.length} plugin(s):`);
    for (const id of remove) {
      uninstallPlugin(id);
    }
  }

  // Save decline/keep decisions (so we don't ask again)
  if (decline.length > 0 || keep.length > 0) {
    // applyPluginChoices saves decisions internally
    if (existsSync(CLAUDE_SETTINGS)) {
      const settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, "utf-8"));
      applyPluginChoices(settings, [], decline, [], keep, remoteMarketplaces);
    }
  }

  clearPending();

  if (decline.length > 0) log(`Declined ${decline.length} plugin(s): ${decline.join(", ")}`);
  if (keep.length > 0) log(`Kept ${keep.length} plugin(s): ${keep.join(", ")}`);

  if (accept.length > 0 || remove.length > 0) {
    console.log("Run /reload-plugins in Claude Code to apply changes.");
  }
}
