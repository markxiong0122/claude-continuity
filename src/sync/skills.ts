import { existsSync, mkdirSync, readdirSync, copyFileSync, lstatSync, readlinkSync, symlinkSync } from "fs";
import { join } from "path";

const SYNC_DIRS = ["skills", "agents", "hooks", "plugins"];

export interface SkillsSyncResult {
  filesUpdated: number;
  newItems: string[];
}

export class SkillsSync {
  constructor(private claudeDir: string, private repoDir: string) {}

  pushToRepo(): SkillsSyncResult {
    const result: SkillsSyncResult = { filesUpdated: 0, newItems: [] };
    for (const dir of SYNC_DIRS) {
      const srcDir = join(this.claudeDir, dir);
      if (!existsSync(srcDir)) continue;
      const dstDir = join(this.repoDir, dir);
      this.copyDirRecursive(srcDir, dstDir, result, dir);
    }
    return result;
  }

  pullFromRepo(): SkillsSyncResult {
    const result: SkillsSyncResult = { filesUpdated: 0, newItems: [] };
    for (const dir of SYNC_DIRS) {
      const srcDir = join(this.repoDir, dir);
      if (!existsSync(srcDir)) continue;
      const dstDir = join(this.claudeDir, dir);
      this.mergeDirAdditive(srcDir, dstDir, result, dir);
    }
    return result;
  }

  private copyDirRecursive(src: string, dst: string, result: SkillsSyncResult, prefix: string): void {
    mkdirSync(dst, { recursive: true });
    for (const entry of readdirSync(src, { withFileTypes: true })) {
      const srcPath = join(src, entry.name);
      const dstPath = join(dst, entry.name);
      const relPath = `${prefix}/${entry.name}`;
      const stat = lstatSync(srcPath);
      if (stat.isSymbolicLink()) {
        // Skip symlinks — they point to local plugin caches that won't exist on other machines
        continue;
      } else if (stat.isDirectory()) {
        this.copyDirRecursive(srcPath, dstPath, result, relPath);
      } else {
        copyFileSync(srcPath, dstPath);
        result.filesUpdated++;
      }
    }
  }

  private mergeDirAdditive(src: string, dst: string, result: SkillsSyncResult, prefix: string): void {
    mkdirSync(dst, { recursive: true });
    for (const entry of readdirSync(src, { withFileTypes: true })) {
      const srcPath = join(src, entry.name);
      const dstPath = join(dst, entry.name);
      const relPath = `${prefix}/${entry.name}`;
      const stat = lstatSync(srcPath);
      if (stat.isSymbolicLink()) {
        continue;
      } else if (stat.isDirectory()) {
        this.mergeDirAdditive(srcPath, dstPath, result, relPath);
      } else if (!existsSync(dstPath)) {
        copyFileSync(srcPath, dstPath);
        result.newItems.push(relPath);
        result.filesUpdated++;
      }
    }
  }
}
