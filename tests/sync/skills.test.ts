import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { SkillsSync } from "../../src/sync/skills";

describe("SkillsSync", () => {
  let claudeDir: string;
  let repoDir: string;
  let sync: SkillsSync;

  beforeEach(() => {
    claudeDir = mkdtempSync(join(tmpdir(), "cc-claude-"));
    repoDir = mkdtempSync(join(tmpdir(), "cc-repo-"));
    sync = new SkillsSync(claudeDir, repoDir);
  });

  afterEach(() => {
    rmSync(claudeDir, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });

  describe("pushToRepo()", () => {
    it("copies skills directory to repo", () => {
      mkdirSync(join(claudeDir, "skills"));
      writeFileSync(join(claudeDir, "skills", "my-skill.md"), "# My Skill");

      const result = sync.pushToRepo();

      expect(existsSync(join(repoDir, "skills", "my-skill.md"))).toBe(true);
      expect(readFileSync(join(repoDir, "skills", "my-skill.md"), "utf8")).toBe("# My Skill");
      expect(result.filesUpdated).toBe(1);
    });

    it("copies agents, hooks, and plugins directories", () => {
      mkdirSync(join(claudeDir, "agents"));
      mkdirSync(join(claudeDir, "hooks"));
      mkdirSync(join(claudeDir, "plugins"));
      writeFileSync(join(claudeDir, "agents", "agent1.md"), "agent content");
      writeFileSync(join(claudeDir, "hooks", "pre-commit.sh"), "#!/bin/bash");
      writeFileSync(join(claudeDir, "plugins", "plugin.js"), "// plugin");

      const result = sync.pushToRepo();

      expect(existsSync(join(repoDir, "agents", "agent1.md"))).toBe(true);
      expect(existsSync(join(repoDir, "hooks", "pre-commit.sh"))).toBe(true);
      expect(existsSync(join(repoDir, "plugins", "plugin.js"))).toBe(true);
      expect(result.filesUpdated).toBe(3);
    });

    it("overwrites existing files in repo on push", () => {
      mkdirSync(join(claudeDir, "skills"));
      mkdirSync(join(repoDir, "skills"));
      writeFileSync(join(claudeDir, "skills", "skill.md"), "new content");
      writeFileSync(join(repoDir, "skills", "skill.md"), "old content");

      sync.pushToRepo();

      expect(readFileSync(join(repoDir, "skills", "skill.md"), "utf8")).toBe("new content");
    });

    it("handles nested subdirectories recursively", () => {
      mkdirSync(join(claudeDir, "skills", "category", "subcategory"), { recursive: true });
      writeFileSync(join(claudeDir, "skills", "top.md"), "top");
      writeFileSync(join(claudeDir, "skills", "category", "mid.md"), "mid");
      writeFileSync(join(claudeDir, "skills", "category", "subcategory", "deep.md"), "deep");

      const result = sync.pushToRepo();

      expect(existsSync(join(repoDir, "skills", "top.md"))).toBe(true);
      expect(existsSync(join(repoDir, "skills", "category", "mid.md"))).toBe(true);
      expect(existsSync(join(repoDir, "skills", "category", "subcategory", "deep.md"))).toBe(true);
      expect(result.filesUpdated).toBe(3);
    });

    it("gracefully skips missing source directories", () => {
      // No skills/agents/hooks/plugins directories exist in claudeDir
      const result = sync.pushToRepo();

      expect(result.filesUpdated).toBe(0);
      expect(result.newItems).toHaveLength(0);
    });

    it("creates destination directory if it does not exist", () => {
      mkdirSync(join(claudeDir, "skills"));
      writeFileSync(join(claudeDir, "skills", "skill.md"), "content");

      sync.pushToRepo();

      expect(existsSync(join(repoDir, "skills"))).toBe(true);
    });
  });

  describe("pullFromRepo()", () => {
    it("adds new skills from repo to local (additive merge)", () => {
      mkdirSync(join(repoDir, "skills"));
      writeFileSync(join(repoDir, "skills", "new-skill.md"), "# New Skill");

      const result = sync.pullFromRepo();

      expect(existsSync(join(claudeDir, "skills", "new-skill.md"))).toBe(true);
      expect(readFileSync(join(claudeDir, "skills", "new-skill.md"), "utf8")).toBe("# New Skill");
      expect(result.filesUpdated).toBe(1);
    });

    it("does NOT overwrite existing local files (local wins)", () => {
      mkdirSync(join(repoDir, "skills"));
      mkdirSync(join(claudeDir, "skills"));
      writeFileSync(join(repoDir, "skills", "skill.md"), "repo version");
      writeFileSync(join(claudeDir, "skills", "skill.md"), "local version");

      const result = sync.pullFromRepo();

      expect(readFileSync(join(claudeDir, "skills", "skill.md"), "utf8")).toBe("local version");
      expect(result.filesUpdated).toBe(0);
      expect(result.newItems).toHaveLength(0);
    });

    it("returns list of newly added items", () => {
      mkdirSync(join(repoDir, "skills"));
      mkdirSync(join(repoDir, "agents"));
      writeFileSync(join(repoDir, "skills", "skill-a.md"), "a");
      writeFileSync(join(repoDir, "skills", "skill-b.md"), "b");
      writeFileSync(join(repoDir, "agents", "agent.md"), "agent");

      const result = sync.pullFromRepo();

      expect(result.newItems).toContain("skills/skill-a.md");
      expect(result.newItems).toContain("skills/skill-b.md");
      expect(result.newItems).toContain("agents/agent.md");
      expect(result.newItems).toHaveLength(3);
      expect(result.filesUpdated).toBe(3);
    });

    it("handles nested subdirectories recursively on pull", () => {
      mkdirSync(join(repoDir, "skills", "category", "sub"), { recursive: true });
      writeFileSync(join(repoDir, "skills", "root.md"), "root");
      writeFileSync(join(repoDir, "skills", "category", "cat.md"), "cat");
      writeFileSync(join(repoDir, "skills", "category", "sub", "deep.md"), "deep");

      const result = sync.pullFromRepo();

      expect(existsSync(join(claudeDir, "skills", "root.md"))).toBe(true);
      expect(existsSync(join(claudeDir, "skills", "category", "cat.md"))).toBe(true);
      expect(existsSync(join(claudeDir, "skills", "category", "sub", "deep.md"))).toBe(true);
      expect(result.newItems).toContain("skills/root.md");
      expect(result.newItems).toContain("skills/category/cat.md");
      expect(result.newItems).toContain("skills/category/sub/deep.md");
      expect(result.filesUpdated).toBe(3);
    });

    it("gracefully skips missing source directories in repo", () => {
      // No skills/agents/hooks/plugins in repoDir
      const result = sync.pullFromRepo();

      expect(result.filesUpdated).toBe(0);
      expect(result.newItems).toHaveLength(0);
    });

    it("mixed pull: adds new files, preserves existing local files", () => {
      mkdirSync(join(repoDir, "skills"));
      mkdirSync(join(claudeDir, "skills"));
      writeFileSync(join(repoDir, "skills", "existing.md"), "repo version");
      writeFileSync(join(repoDir, "skills", "new-from-repo.md"), "brand new");
      writeFileSync(join(claudeDir, "skills", "existing.md"), "local version");

      const result = sync.pullFromRepo();

      expect(readFileSync(join(claudeDir, "skills", "existing.md"), "utf8")).toBe("local version");
      expect(readFileSync(join(claudeDir, "skills", "new-from-repo.md"), "utf8")).toBe("brand new");
      expect(result.newItems).toEqual(["skills/new-from-repo.md"]);
      expect(result.filesUpdated).toBe(1);
    });
  });
});
