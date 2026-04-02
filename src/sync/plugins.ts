import { existsSync, readFileSync, writeFileSync } from "fs";
import { CC_PENDING_PLUGINS, CC_PLUGIN_DECISIONS } from "../utils/claude-dirs";

export interface PluginEntry {
  id: string;
  marketplace?: { source: string; repo: string };
}

export interface PendingPlugins {
  newFromRemote: PluginEntry[];
  deletedOnRemote: PluginEntry[];
}

export interface PluginDecisions {
  declined: string[];
  kept: string[];
}

export function readDecisions(): PluginDecisions {
  if (!existsSync(CC_PLUGIN_DECISIONS)) return { declined: [], kept: [] };
  return JSON.parse(readFileSync(CC_PLUGIN_DECISIONS, "utf-8"));
}

export function writeDecisions(decisions: PluginDecisions): void {
  writeFileSync(CC_PLUGIN_DECISIONS, JSON.stringify(decisions, null, 2) + "\n");
}

export function readPending(): PendingPlugins {
  if (!existsSync(CC_PENDING_PLUGINS)) return { newFromRemote: [], deletedOnRemote: [] };
  return JSON.parse(readFileSync(CC_PENDING_PLUGINS, "utf-8"));
}

export function writePending(pending: PendingPlugins): void {
  writeFileSync(CC_PENDING_PLUGINS, JSON.stringify(pending, null, 2) + "\n");
}

export function clearPending(): void {
  if (existsSync(CC_PENDING_PLUGINS)) {
    writeFileSync(CC_PENDING_PLUGINS, JSON.stringify({ newFromRemote: [], deletedOnRemote: [] }, null, 2) + "\n");
  }
}

/**
 * Diff remote vs local settings to find new and deleted plugins.
 * Respects prior decisions (declined/kept).
 */
export function diffPlugins(
  remoteSettings: Record<string, unknown>,
  localSettings: Record<string, unknown>,
): PendingPlugins {
  const remoteEnabled = (remoteSettings.enabledPlugins ?? {}) as Record<string, boolean>;
  const localEnabled = (localSettings.enabledPlugins ?? {}) as Record<string, boolean>;
  const remoteMarketplaces = (remoteSettings.extraKnownMarketplaces ?? {}) as Record<string, { source: Record<string, string> }>;

  const decisions = readDecisions();

  const newFromRemote: PluginEntry[] = [];
  for (const pluginId of Object.keys(remoteEnabled)) {
    if (!(pluginId in localEnabled) && !decisions.declined.includes(pluginId)) {
      const [, marketplaceName] = pluginId.split("@");
      const marketplace = remoteMarketplaces[marketplaceName]?.source;
      newFromRemote.push({
        id: pluginId,
        marketplace: marketplace ? { source: marketplace.source, repo: marketplace.repo } : undefined,
      });
    }
  }

  const deletedOnRemote: PluginEntry[] = [];
  for (const pluginId of Object.keys(localEnabled)) {
    if (!(pluginId in remoteEnabled) && !decisions.kept.includes(pluginId)) {
      deletedOnRemote.push({ id: pluginId });
    }
  }

  return { newFromRemote, deletedOnRemote };
}

/**
 * Apply plugin decisions to settings: enable accepted plugins, remove deleted ones.
 */
export function applyPluginChoices(
  settings: Record<string, unknown>,
  accept: string[],
  decline: string[],
  remove: string[],
  keep: string[],
  remoteMarketplaces: Record<string, unknown>,
): Record<string, unknown> {
  const enabled = { ...((settings.enabledPlugins ?? {}) as Record<string, boolean>) };
  const marketplaces = { ...((settings.extraKnownMarketplaces ?? {}) as Record<string, unknown>) };

  // Enable accepted plugins
  for (const id of accept) {
    enabled[id] = true;
    const [, marketplaceName] = id.split("@");
    if (marketplaceName && remoteMarketplaces[marketplaceName]) {
      marketplaces[marketplaceName] = remoteMarketplaces[marketplaceName];
    }
  }

  // Remove deleted plugins
  for (const id of remove) {
    delete enabled[id];
    const [, marketplaceName] = id.split("@");
    // Only remove marketplace if no other plugin uses it
    const othersUsingMarketplace = Object.keys(enabled).some(
      (pid) => pid.endsWith(`@${marketplaceName}`) && pid !== id,
    );
    if (!othersUsingMarketplace && marketplaceName) {
      delete marketplaces[marketplaceName];
    }
  }

  // Save decisions
  const decisions = readDecisions();
  decisions.declined = [...new Set([...decisions.declined, ...decline])];
  decisions.kept = [...new Set([...decisions.kept, ...keep])];
  writeDecisions(decisions);

  return { ...settings, enabledPlugins: enabled, extraKnownMarketplaces: marketplaces };
}
