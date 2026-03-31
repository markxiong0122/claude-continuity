import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ConfigSync } from "../../src/sync/config";

describe("ConfigSync", () => {
  let claudeDir: string;
  let repoDir: string;
  let sync: ConfigSync;

  beforeEach(() => {
    claudeDir = mkdtempSync(join(tmpdir(), "cc-claude-"));
    repoDir = mkdtempSync(join(tmpdir(), "cc-repo-"));
    sync = new ConfigSync(claudeDir, repoDir);
  });

  afterEach(() => {
    rmSync(claudeDir, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });

  describe("pushToRepo()", () => {
    it("copies settings.json to repo", () => {
      const settings = { theme: "dark", fontSize: 14 };
      writeFileSync(join(claudeDir, "settings.json"), JSON.stringify(settings));

      const result = sync.pushToRepo();

      expect(result.filesUpdated).toBe(1);
      expect(result.filesSkipped).toBe(1); // keybindings.json missing
      const copied = JSON.parse(readFileSync(join(repoDir, "settings.json"), "utf-8"));
      expect(copied).toEqual(settings);
    });

    it("copies keybindings.json to repo", () => {
      const keybindings = { "ctrl+s": "save", "ctrl+z": "undo" };
      writeFileSync(join(claudeDir, "keybindings.json"), JSON.stringify(keybindings));

      const result = sync.pushToRepo();

      expect(result.filesUpdated).toBe(1);
      expect(result.filesSkipped).toBe(1); // settings.json missing
      const copied = JSON.parse(readFileSync(join(repoDir, "keybindings.json"), "utf-8"));
      expect(copied).toEqual(keybindings);
    });

    it("copies both files when both exist", () => {
      writeFileSync(join(claudeDir, "settings.json"), JSON.stringify({ theme: "dark" }));
      writeFileSync(join(claudeDir, "keybindings.json"), JSON.stringify({ "ctrl+s": "save" }));

      const result = sync.pushToRepo();

      expect(result.filesUpdated).toBe(2);
      expect(result.filesSkipped).toBe(0);
    });

    it("skips gracefully when source files are missing", () => {
      const result = sync.pushToRepo();

      expect(result.filesUpdated).toBe(0);
      expect(result.filesSkipped).toBe(2);
      expect(existsSync(join(repoDir, "settings.json"))).toBe(false);
      expect(existsSync(join(repoDir, "keybindings.json"))).toBe(false);
    });

    it("never syncs credentials.json", () => {
      writeFileSync(join(claudeDir, "credentials.json"), JSON.stringify({ token: "secret" }));
      writeFileSync(join(claudeDir, ".credentials.json"), JSON.stringify({ apiKey: "secret" }));

      sync.pushToRepo();

      expect(existsSync(join(repoDir, "credentials.json"))).toBe(false);
      expect(existsSync(join(repoDir, ".credentials.json"))).toBe(false);
    });
  });

  describe("pullFromRepo()", () => {
    it("merges settings.json — adds new keys from remote", () => {
      const remote = { theme: "dark", fontSize: 14, newSetting: true };
      const local = { theme: "light" };
      writeFileSync(join(repoDir, "settings.json"), JSON.stringify(remote));
      writeFileSync(join(claudeDir, "settings.json"), JSON.stringify(local));

      sync.pullFromRepo();

      const merged = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
      expect(merged.newSetting).toBe(true);
    });

    it("merges settings.json — remote wins on shared keys", () => {
      const remote = { theme: "dark", fontSize: 14 };
      const local = { theme: "light", fontSize: 12 };
      writeFileSync(join(repoDir, "settings.json"), JSON.stringify(remote));
      writeFileSync(join(claudeDir, "settings.json"), JSON.stringify(local));

      sync.pullFromRepo();

      const merged = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
      expect(merged.theme).toBe("dark");
      expect(merged.fontSize).toBe(14);
    });

    it("merges settings.json — preserves local-only keys", () => {
      const remote = { theme: "dark" };
      const local = { theme: "light", localOnlyKey: "preserved" };
      writeFileSync(join(repoDir, "settings.json"), JSON.stringify(remote));
      writeFileSync(join(claudeDir, "settings.json"), JSON.stringify(local));

      sync.pullFromRepo();

      const merged = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
      expect(merged.localOnlyKey).toBe("preserved");
    });

    it("handles fresh device — no local settings.json yet", () => {
      const remote = { theme: "dark", fontSize: 14 };
      writeFileSync(join(repoDir, "settings.json"), JSON.stringify(remote));
      // No local settings.json

      const result = sync.pullFromRepo();

      expect(result.filesUpdated).toBe(1);
      const created = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
      expect(created).toEqual(remote);
    });

    it("skips gracefully when remote file is missing", () => {
      const result = sync.pullFromRepo();

      expect(result.filesUpdated).toBe(0);
      expect(result.filesSkipped).toBe(2);
    });

    it("writes output with trailing newline", () => {
      writeFileSync(join(repoDir, "settings.json"), JSON.stringify({ theme: "dark" }));

      sync.pullFromRepo();

      const raw = readFileSync(join(claudeDir, "settings.json"), "utf-8");
      expect(raw.endsWith("\n")).toBe(true);
    });

    it("never syncs credentials.json even if present in repo", () => {
      writeFileSync(join(repoDir, "credentials.json"), JSON.stringify({ token: "leaked" }));

      sync.pullFromRepo();

      expect(existsSync(join(claudeDir, "credentials.json"))).toBe(false);
    });
  });
});
