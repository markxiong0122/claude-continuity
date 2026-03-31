import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { hostname } from "os";
import { parse as parseYaml } from "yaml";

export interface SkillDeps {
  requires?: {
    brew?: string[];
    npm?: string[];
    mcp?: string[];
    apt?: string[];
  };
}

export interface Manifest {
  device: string;
  timestamp: string;
  skills: Record<string, SkillDeps>;
}

export interface DependencyDiff {
  newSkills: string[];
  removedSkills: string[];
  missingDeps: {
    brew?: string[];
    npm?: string[];
    mcp?: string[];
    apt?: string[];
  };
}

export class ManifestSync {
  constructor(private claudeDir: string, private repoDir: string) {}

  generate(): Manifest {
    const skills: Record<string, SkillDeps> = {};
    const skillsDir = join(this.claudeDir, "skills");
    if (existsSync(skillsDir)) {
      for (const file of readdirSync(skillsDir)) {
        if (!file.endsWith(".md")) continue;
        const content = readFileSync(join(skillsDir, file), "utf-8");
        const deps = this.parseFrontmatter(content);
        skills[file] = deps;
      }
    }
    return { device: hostname(), timestamp: new Date().toISOString(), skills };
  }

  saveToRepo(manifest: Manifest): void {
    writeFileSync(join(this.repoDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  }

  loadFromRepo(): Manifest | null {
    const path = join(this.repoDir, "manifest.json");
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8"));
  }

  diff(remote: Manifest, local: Manifest): DependencyDiff {
    const newSkills: string[] = [];
    const removedSkills: string[] = [];
    const missingDeps: DependencyDiff["missingDeps"] = {};

    // New skills: in remote but not local
    for (const [skillName, remoteDeps] of Object.entries(remote.skills)) {
      if (!(skillName in local.skills)) {
        newSkills.push(skillName);
        if (remoteDeps.requires) {
          for (const [type, deps] of Object.entries(remoteDeps.requires)) {
            const key = type as keyof typeof missingDeps;
            if (deps && deps.length > 0) {
              missingDeps[key] = [...(missingDeps[key] ?? []), ...deps];
            }
          }
        }
      }
    }

    // Removed skills: in local but not remote
    for (const skillName of Object.keys(local.skills)) {
      if (!(skillName in remote.skills)) {
        removedSkills.push(skillName);
      }
    }

    // Deduplicate
    for (const key of Object.keys(missingDeps) as (keyof typeof missingDeps)[]) {
      if (missingDeps[key]) missingDeps[key] = [...new Set(missingDeps[key])];
    }

    return { newSkills, removedSkills, missingDeps };
  }

  private parseFrontmatter(content: string): SkillDeps {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    try {
      const parsed = parseYaml(match[1]);
      if (parsed?.requires) {
        return { requires: parsed.requires };
      }
      return {};
    } catch {
      return {};
    }
  }
}
