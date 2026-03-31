import { readdirSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join } from "path";
import { normalize, expand } from "../paths/remapper";

export interface SyncResult {
  filesUpdated: number;
  filesSkipped: number;
  projects: string[];
}

export class SessionSync {
  private claudeProjectsDir: string;
  private repoProjectsDir: string;

  constructor(claudeDir: string, repoDir: string) {
    this.claudeProjectsDir = join(claudeDir, "projects");
    this.repoProjectsDir = join(repoDir, "projects");
  }

  pushToRepo(): SyncResult {
    const result: SyncResult = { filesUpdated: 0, filesSkipped: 0, projects: [] };
    if (!existsSync(this.claudeProjectsDir)) return result;

    const projectDirs = readdirSync(this.claudeProjectsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    for (const dir of projectDirs) {
      const localDir = join(this.claudeProjectsDir, dir.name);
      const normalizedName = normalize(dir.name);
      const repoDir = join(this.repoProjectsDir, normalizedName);
      mkdirSync(repoDir, { recursive: true });

      const files = readdirSync(localDir).filter((f) => f.endsWith(".jsonl"));
      for (const file of files) {
        const localPath = join(localDir, file);
        const repoPath = join(repoDir, file);

        if (existsSync(repoPath)) {
          const localStat = statSync(localPath);
          const repoStat = statSync(repoPath);
          if (localStat.size === repoStat.size && localStat.mtimeMs <= repoStat.mtimeMs) {
            result.filesSkipped++;
            continue;
          }
        }

        const content = readFileSync(localPath, "utf-8");
        const normalized = this.normalizeJsonl(content);
        writeFileSync(repoPath, normalized);
        result.filesUpdated++;
      }
      if (files.length > 0) result.projects.push(normalizedName);
    }
    return result;
  }

  pullFromRepo(): SyncResult {
    const result: SyncResult = { filesUpdated: 0, filesSkipped: 0, projects: [] };
    if (!existsSync(this.repoProjectsDir)) return result;

    const projectDirs = readdirSync(this.repoProjectsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    for (const dir of projectDirs) {
      const repoDir = join(this.repoProjectsDir, dir.name);
      const expandedName = expand(dir.name);
      const localDir = join(this.claudeProjectsDir, expandedName);
      mkdirSync(localDir, { recursive: true });

      const files = readdirSync(repoDir).filter((f) => f.endsWith(".jsonl"));
      for (const file of files) {
        const repoPath = join(repoDir, file);
        const localPath = join(localDir, file);

        if (existsSync(localPath)) {
          const repoStat = statSync(repoPath);
          const localStat = statSync(localPath);
          if (localStat.size >= repoStat.size) {
            result.filesSkipped++;
            continue;
          }
        }

        const content = readFileSync(repoPath, "utf-8");
        const expanded = this.expandJsonl(content);
        writeFileSync(localPath, expanded);
        result.filesUpdated++;
      }
      if (files.length > 0) result.projects.push(expandedName);
    }
    return result;
  }

  private normalizeJsonl(content: string): string {
    return content.split("\n").map((line) => {
      if (!line.trim() || !line.includes('"cwd"')) return line;
      try {
        const obj = JSON.parse(line);
        if (obj.cwd) obj.cwd = normalize(obj.cwd);
        return JSON.stringify(obj);
      } catch { return line; }
    }).join("\n");
  }

  private expandJsonl(content: string): string {
    return content.split("\n").map((line) => {
      if (!line.trim() || !line.includes('"cwd"')) return line;
      try {
        const obj = JSON.parse(line);
        if (obj.cwd) obj.cwd = expand(obj.cwd);
        return JSON.stringify(obj);
      } catch { return line; }
    }).join("\n");
  }
}
