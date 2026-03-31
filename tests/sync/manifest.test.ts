import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ManifestSync } from "../../src/sync/manifest";

describe("ManifestSync", () => {
  let claudeDir: string;
  let repoDir: string;
  let sync: ManifestSync;

  beforeEach(() => {
    claudeDir = mkdtempSync(join(tmpdir(), "cc-claude-"));
    repoDir = mkdtempSync(join(tmpdir(), "cc-repo-"));
    sync = new ManifestSync(claudeDir, repoDir);
  });

  afterEach(() => {
    rmSync(claudeDir, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });

  describe("generate()", () => {
    it("generates manifest from skill with inline YAML frontmatter requires", () => {
      mkdirSync(join(claudeDir, "skills"));
      writeFileSync(
        join(claudeDir, "skills", "my-skill.md"),
        "---\nrequires: { brew: [trivy] }\n---\n# My Skill\nContent here.",
      );

      const manifest = sync.generate();

      expect(manifest.skills["my-skill.md"]).toBeDefined();
      expect(manifest.skills["my-skill.md"].requires?.brew).toEqual(["trivy"]);
    });

    it("generates manifest from skill with multi-line YAML frontmatter requires", () => {
      mkdirSync(join(claudeDir, "skills"));
      writeFileSync(
        join(claudeDir, "skills", "scanner.md"),
        "---\nrequires:\n  brew:\n    - trivy\n    - nmap\n  npm:\n    - semgrep\n---\n# Scanner\n",
      );

      const manifest = sync.generate();

      expect(manifest.skills["scanner.md"].requires?.brew).toEqual(["trivy", "nmap"]);
      expect(manifest.skills["scanner.md"].requires?.npm).toEqual(["semgrep"]);
    });

    it("handles skills without frontmatter", () => {
      mkdirSync(join(claudeDir, "skills"));
      writeFileSync(
        join(claudeDir, "skills", "plain.md"),
        "# Just a plain skill\nNo frontmatter here.",
      );

      const manifest = sync.generate();

      expect(manifest.skills["plain.md"]).toBeDefined();
      expect(manifest.skills["plain.md"].requires).toBeUndefined();
    });

    it("returns empty skills when skills dir does not exist", () => {
      // No skills dir created
      const manifest = sync.generate();

      expect(manifest.skills).toEqual({});
    });

    it("ignores non-.md files in skills dir", () => {
      mkdirSync(join(claudeDir, "skills"));
      writeFileSync(join(claudeDir, "skills", "notes.txt"), "not a skill");
      writeFileSync(join(claudeDir, "skills", "skill.md"), "---\n---\n# Skill");

      const manifest = sync.generate();

      expect(Object.keys(manifest.skills)).toEqual(["skill.md"]);
    });

    it("includes device and timestamp in manifest", () => {
      const manifest = sync.generate();

      expect(typeof manifest.device).toBe("string");
      expect(manifest.device.length).toBeGreaterThan(0);
      expect(typeof manifest.timestamp).toBe("string");
      expect(new Date(manifest.timestamp).getTime()).not.toBeNaN();
    });
  });

  describe("saveToRepo() / loadFromRepo()", () => {
    it("round-trips manifest through JSON file", () => {
      mkdirSync(join(claudeDir, "skills"));
      writeFileSync(
        join(claudeDir, "skills", "tool.md"),
        "---\nrequires:\n  brew:\n    - jq\n---\n# Tool",
      );

      const original = sync.generate();
      sync.saveToRepo(original);
      const loaded = sync.loadFromRepo();

      expect(loaded).not.toBeNull();
      expect(loaded!.device).toBe(original.device);
      expect(loaded!.timestamp).toBe(original.timestamp);
      expect(loaded!.skills["tool.md"].requires?.brew).toEqual(["jq"]);
    });

    it("saves manifest.json to repoDir", () => {
      const manifest = sync.generate();
      sync.saveToRepo(manifest);

      expect(existsSync(join(repoDir, "manifest.json"))).toBe(true);
      const raw = readFileSync(join(repoDir, "manifest.json"), "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed.device).toBe(manifest.device);
    });

    it("returns null when manifest.json does not exist", () => {
      expect(sync.loadFromRepo()).toBeNull();
    });
  });

  describe("diff()", () => {
    it("finds new skills in remote not in local", () => {
      const remote = {
        device: "remote",
        timestamp: new Date().toISOString(),
        skills: {
          "new-skill.md": { requires: { brew: ["trivy"] } },
          "common.md": {},
        },
      };
      const local = {
        device: "local",
        timestamp: new Date().toISOString(),
        skills: {
          "common.md": {},
        },
      };

      const result = sync.diff(remote, local);

      expect(result.newSkills).toEqual(["new-skill.md"]);
      expect(result.removedSkills).toEqual([]);
    });

    it("aggregates missing deps from new skills", () => {
      const remote = {
        device: "remote",
        timestamp: new Date().toISOString(),
        skills: {
          "scanner.md": { requires: { brew: ["trivy", "nmap"], npm: ["semgrep"] } },
          "linter.md": { requires: { brew: ["shellcheck"] } },
        },
      };
      const local = {
        device: "local",
        timestamp: new Date().toISOString(),
        skills: {},
      };

      const result = sync.diff(remote, local);

      expect(result.newSkills).toContain("scanner.md");
      expect(result.newSkills).toContain("linter.md");
      expect(result.missingDeps.brew).toContain("trivy");
      expect(result.missingDeps.brew).toContain("nmap");
      expect(result.missingDeps.brew).toContain("shellcheck");
      expect(result.missingDeps.npm).toContain("semgrep");
    });

    it("deduplicates missing deps across new skills", () => {
      const remote = {
        device: "remote",
        timestamp: new Date().toISOString(),
        skills: {
          "skill-a.md": { requires: { brew: ["trivy"] } },
          "skill-b.md": { requires: { brew: ["trivy"] } },
        },
      };
      const local = {
        device: "local",
        timestamp: new Date().toISOString(),
        skills: {},
      };

      const result = sync.diff(remote, local);

      expect(result.missingDeps.brew).toEqual(["trivy"]);
    });

    it("finds removed skills in local not in remote", () => {
      const remote = {
        device: "remote",
        timestamp: new Date().toISOString(),
        skills: {
          "common.md": {},
        },
      };
      const local = {
        device: "local",
        timestamp: new Date().toISOString(),
        skills: {
          "common.md": {},
          "old-skill.md": {},
        },
      };

      const result = sync.diff(remote, local);

      expect(result.removedSkills).toEqual(["old-skill.md"]);
      expect(result.newSkills).toEqual([]);
    });

    it("returns no diff when manifests are identical", () => {
      const skills = {
        "skill-a.md": { requires: { brew: ["trivy"] } },
        "skill-b.md": {},
      };
      const remote = { device: "a", timestamp: new Date().toISOString(), skills };
      const local = { device: "b", timestamp: new Date().toISOString(), skills };

      const result = sync.diff(remote, local);

      expect(result.newSkills).toEqual([]);
      expect(result.removedSkills).toEqual([]);
      expect(result.missingDeps).toEqual({});
    });

    it("does not include deps for skills that already exist locally", () => {
      const remote = {
        device: "remote",
        timestamp: new Date().toISOString(),
        skills: {
          "existing.md": { requires: { brew: ["jq"] } },
          "new-one.md": { requires: { brew: ["trivy"] } },
        },
      };
      const local = {
        device: "local",
        timestamp: new Date().toISOString(),
        skills: {
          "existing.md": { requires: { brew: ["jq"] } },
        },
      };

      const result = sync.diff(remote, local);

      expect(result.missingDeps.brew).toEqual(["trivy"]);
      expect(result.missingDeps.brew).not.toContain("jq");
    });
  });
});
