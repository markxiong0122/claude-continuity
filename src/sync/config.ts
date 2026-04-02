import { existsSync, readFileSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";
import { diffPlugins, writePending, type PendingPlugins } from "./plugins";

const SYNC_FILES = ["settings.json", "keybindings.json"];
const NEVER_SYNC = ["credentials.json", ".credentials.json"];
const PLUGIN_KEYS = ["enabledPlugins", "extraKnownMarketplaces"];

export interface ConfigSyncResult {
  filesUpdated: number;
  filesSkipped: number;
  pendingPlugins?: PendingPlugins;
}

export class ConfigSync {
  constructor(
    private claudeDir: string,
    private repoDir: string,
  ) {}

  pushToRepo(): ConfigSyncResult {
    const result: ConfigSyncResult = { filesUpdated: 0, filesSkipped: 0 };
    for (const file of SYNC_FILES) {
      const src = join(this.claudeDir, file);
      const dst = join(this.repoDir, file);
      if (!existsSync(src)) { result.filesSkipped++; continue; }
      copyFileSync(src, dst);
      result.filesUpdated++;
    }
    return result;
  }

  pullFromRepo(): ConfigSyncResult {
    const result: ConfigSyncResult = { filesUpdated: 0, filesSkipped: 0 };
    for (const file of SYNC_FILES) {
      const src = join(this.repoDir, file);
      const dst = join(this.claudeDir, file);
      if (!existsSync(src)) { result.filesSkipped++; continue; }

      const remote = JSON.parse(readFileSync(src, "utf-8"));
      const local = existsSync(dst) ? JSON.parse(readFileSync(dst, "utf-8")) : {};

      if (file === "settings.json") {
        // Detect plugin changes before merging
        const pending = diffPlugins(remote, local);

        // Merge everything EXCEPT plugin keys — those are handled separately
        const remoteWithoutPlugins = { ...remote };
        for (const key of PLUGIN_KEYS) delete remoteWithoutPlugins[key];

        const merged = { ...local, ...remoteWithoutPlugins };
        writeFileSync(dst, JSON.stringify(merged, null, 2) + "\n");

        if (pending.newFromRemote.length > 0 || pending.deletedOnRemote.length > 0) {
          writePending(pending);
          result.pendingPlugins = pending;
        }
      } else {
        // Key-level merge for non-settings files
        const merged = { ...local, ...remote };
        writeFileSync(dst, JSON.stringify(merged, null, 2) + "\n");
      }

      result.filesUpdated++;
    }
    return result;
  }
}
