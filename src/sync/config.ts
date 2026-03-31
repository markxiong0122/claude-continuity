import { existsSync, readFileSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";

const SYNC_FILES = ["settings.json", "keybindings.json"];
const NEVER_SYNC = ["credentials.json", ".credentials.json"];

export interface ConfigSyncResult {
  filesUpdated: number;
  filesSkipped: number;
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

      // Key-level merge: add new keys, update shared keys, preserve local-only keys
      const remote = JSON.parse(readFileSync(src, "utf-8"));
      const local = existsSync(dst) ? JSON.parse(readFileSync(dst, "utf-8")) : {};
      const merged = { ...local, ...remote };
      writeFileSync(dst, JSON.stringify(merged, null, 2) + "\n");
      result.filesUpdated++;
    }
    return result;
  }
}
