import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, statSync, utimesSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { SessionSync } from "../../src/sync/sessions";
import { homedir } from "os";

let tmpDir: string;
let claudeDir: string;
let repoDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "session-sync-test-"));
  claudeDir = join(tmpDir, "claude");
  repoDir = join(tmpDir, "repo");
  mkdirSync(join(claudeDir, "projects"), { recursive: true });
  mkdirSync(join(repoDir, "projects"), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeJsonlWithCwd(cwd: string): string {
  const meta = JSON.stringify({ type: "meta", cwd, sessionId: "abc123" });
  const msg = JSON.stringify({ type: "message", text: "hello" });
  return `${meta}\n${msg}\n`;
}

describe("SessionSync.pushToRepo()", () => {
  it("copies JSONL files from claude to repo", () => {
    const projectDir = join(claudeDir, "projects", "my-project");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "session1.jsonl"), makeJsonlWithCwd("/usr/local/bin"));

    const sync = new SessionSync(claudeDir, repoDir);
    const result = sync.pushToRepo();

    expect(result.filesUpdated).toBe(1);
    expect(result.filesSkipped).toBe(0);
  });

  it("normalizes cwd field on push", () => {
    const home = homedir();
    const projectDir = join(claudeDir, "projects", "test-project");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "session.jsonl"), makeJsonlWithCwd(`${home}/projects/mapier`));

    const sync = new SessionSync(claudeDir, repoDir);
    sync.pushToRepo();

    // The project directory name itself should be normalized
    const repoProjDirs = require("fs").readdirSync(join(repoDir, "projects"));
    // Find the repo file — project name is normalized too
    const repoProjectDir = join(repoDir, "projects", repoProjDirs[0]);
    const content = readFileSync(join(repoProjectDir, "session.jsonl"), "utf-8");
    const firstLine = content.split("\n")[0];
    const obj = JSON.parse(firstLine);
    expect(obj.cwd).toBe("$HOME/projects/mapier");
    expect(obj.cwd).not.toContain(home);
  });

  it("normalizes project directory name on push", () => {
    const home = homedir();
    const parts = home.split("/").filter(Boolean);
    const encodedHome = parts.join("-");
    const projectName = `-${encodedHome}-projects-mapier`;
    const projectDir = join(claudeDir, "projects", projectName);
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "session.jsonl"), makeJsonlWithCwd("/tmp/test"));

    const sync = new SessionSync(claudeDir, repoDir);
    sync.pushToRepo();

    const repoProjDirs = require("fs").readdirSync(join(repoDir, "projects"));
    expect(repoProjDirs[0]).toContain("$HOME");
    expect(repoProjDirs[0]).not.toContain(encodedHome);
  });

  it("skips unchanged files (same size + older mtime)", () => {
    const projectDir = join(claudeDir, "projects", "my-project");
    mkdirSync(projectDir, { recursive: true });
    const content = makeJsonlWithCwd("/tmp/test");
    const localPath = join(projectDir, "session.jsonl");
    writeFileSync(localPath, content);

    // Pre-create the repo file with same content
    const repoProjectDir = join(repoDir, "projects", "my-project");
    mkdirSync(repoProjectDir, { recursive: true });
    const repoPath = join(repoProjectDir, "session.jsonl");
    writeFileSync(repoPath, content);

    // Make local mtime older than repo mtime so it's considered unchanged
    const localStat = statSync(localPath);
    const repoStat = statSync(repoPath);
    // Set local mtime to be earlier than repo
    utimesSync(localPath, localStat.atime, new Date(repoStat.mtimeMs - 1000));

    const sync = new SessionSync(claudeDir, repoDir);
    const result = sync.pushToRepo();

    expect(result.filesSkipped).toBe(1);
    expect(result.filesUpdated).toBe(0);
  });

  it("updates files when local is newer", () => {
    const projectDir = join(claudeDir, "projects", "my-project");
    mkdirSync(projectDir, { recursive: true });
    const content = makeJsonlWithCwd("/tmp/test");
    const localPath = join(projectDir, "session.jsonl");
    writeFileSync(localPath, content);

    const repoProjectDir = join(repoDir, "projects", "my-project");
    mkdirSync(repoProjectDir, { recursive: true });
    const repoPath = join(repoProjectDir, "session.jsonl");
    // Write shorter content to repo so size differs
    writeFileSync(repoPath, "{}");

    const sync = new SessionSync(claudeDir, repoDir);
    const result = sync.pushToRepo();

    expect(result.filesUpdated).toBe(1);
    expect(result.filesSkipped).toBe(0);
  });

  it("ignores non-JSONL files", () => {
    const projectDir = join(claudeDir, "projects", "my-project");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "session.jsonl"), makeJsonlWithCwd("/tmp"));
    writeFileSync(join(projectDir, "notes.txt"), "ignore me");
    writeFileSync(join(projectDir, "data.json"), '{"ignore": true}');

    const sync = new SessionSync(claudeDir, repoDir);
    const result = sync.pushToRepo();

    expect(result.filesUpdated).toBe(1); // only the .jsonl
    const repoProjectDir = join(repoDir, "projects", "my-project");
    const repoFiles = require("fs").readdirSync(repoProjectDir);
    expect(repoFiles).toContain("session.jsonl");
    expect(repoFiles).not.toContain("notes.txt");
    expect(repoFiles).not.toContain("data.json");
  });

  it("returns empty result when claude projects dir does not exist", () => {
    const emptyClaudeDir = join(tmpDir, "nonexistent");
    const sync = new SessionSync(emptyClaudeDir, repoDir);
    const result = sync.pushToRepo();

    expect(result.filesUpdated).toBe(0);
    expect(result.filesSkipped).toBe(0);
    expect(result.projects).toHaveLength(0);
  });

  it("does not crash on empty projects directory", () => {
    const sync = new SessionSync(claudeDir, repoDir);
    const result = sync.pushToRepo();

    expect(result.filesUpdated).toBe(0);
    expect(result.filesSkipped).toBe(0);
    expect(result.projects).toHaveLength(0);
  });

  it("passes through lines without cwd unchanged", () => {
    const projectDir = join(claudeDir, "projects", "my-project");
    mkdirSync(projectDir, { recursive: true });
    const lines = [
      JSON.stringify({ type: "message", text: "no cwd here" }),
      JSON.stringify({ type: "meta", cwd: "/tmp/test" }),
      JSON.stringify({ type: "tool", result: "done" }),
    ].join("\n") + "\n";
    writeFileSync(join(projectDir, "session.jsonl"), lines);

    const sync = new SessionSync(claudeDir, repoDir);
    sync.pushToRepo();

    const repoProjectDir = join(repoDir, "projects", "my-project");
    const content = readFileSync(join(repoProjectDir, "session.jsonl"), "utf-8");
    const outputLines = content.split("\n").filter((l) => l.trim());
    const firstObj = JSON.parse(outputLines[0]);
    const thirdObj = JSON.parse(outputLines[2]);

    // Lines without cwd are unchanged
    expect(firstObj.text).toBe("no cwd here");
    expect(thirdObj.result).toBe("done");
  });

  it("tracks projects in result", () => {
    mkdirSync(join(claudeDir, "projects", "proj-a"), { recursive: true });
    mkdirSync(join(claudeDir, "projects", "proj-b"), { recursive: true });
    writeFileSync(join(claudeDir, "projects", "proj-a", "s1.jsonl"), makeJsonlWithCwd("/tmp"));
    writeFileSync(join(claudeDir, "projects", "proj-b", "s2.jsonl"), makeJsonlWithCwd("/tmp"));

    const sync = new SessionSync(claudeDir, repoDir);
    const result = sync.pushToRepo();

    expect(result.filesUpdated).toBe(2);
    expect(result.projects).toHaveLength(2);
  });
});

describe("SessionSync.pullFromRepo()", () => {
  it("copies JSONL files from repo to local", () => {
    const repoProjectDir = join(repoDir, "projects", "my-project");
    mkdirSync(repoProjectDir, { recursive: true });
    writeFileSync(join(repoProjectDir, "session.jsonl"), makeJsonlWithCwd("/tmp/test"));

    const sync = new SessionSync(claudeDir, repoDir);
    const result = sync.pullFromRepo();

    expect(result.filesUpdated).toBe(1);
    expect(result.filesSkipped).toBe(0);
  });

  it("expands cwd field on pull", () => {
    const home = homedir();
    const repoProjectDir = join(repoDir, "projects", "my-project");
    mkdirSync(repoProjectDir, { recursive: true });
    writeFileSync(join(repoProjectDir, "session.jsonl"), makeJsonlWithCwd("$HOME/projects/mapier"));

    const sync = new SessionSync(claudeDir, repoDir);
    sync.pullFromRepo();

    const localFiles = require("fs").readdirSync(join(claudeDir, "projects"));
    const localProjectDir = join(claudeDir, "projects", localFiles[0]);
    const content = readFileSync(join(localProjectDir, "session.jsonl"), "utf-8");
    const obj = JSON.parse(content.split("\n")[0]);

    expect(obj.cwd).toBe(`${home}/projects/mapier`);
    expect(obj.cwd).not.toContain("$HOME");
  });

  it("expands project directory name on pull", () => {
    const home = homedir();
    const parts = home.split("/").filter(Boolean);
    const encodedHome = parts.join("-");
    const normalizedProjectName = `-$HOME-projects-mapier`;
    const repoProjectDir = join(repoDir, "projects", normalizedProjectName);
    mkdirSync(repoProjectDir, { recursive: true });
    writeFileSync(join(repoProjectDir, "session.jsonl"), makeJsonlWithCwd("/tmp"));

    const sync = new SessionSync(claudeDir, repoDir);
    sync.pullFromRepo();

    const localProjectDirs = require("fs").readdirSync(join(claudeDir, "projects"));
    expect(localProjectDirs[0]).toContain(encodedHome);
    expect(localProjectDirs[0]).not.toContain("$HOME");
  });

  it("conflict resolution: local longer file wins (skip when local >= repo size)", () => {
    const repoProjectDir = join(repoDir, "projects", "my-project");
    mkdirSync(repoProjectDir, { recursive: true });
    writeFileSync(join(repoProjectDir, "session.jsonl"), "{}");

    const localProjectDir = join(claudeDir, "projects", "my-project");
    mkdirSync(localProjectDir, { recursive: true });
    // Local has more content
    const longerContent = makeJsonlWithCwd("/tmp") + makeJsonlWithCwd("/tmp/extra");
    writeFileSync(join(localProjectDir, "session.jsonl"), longerContent);

    const sync = new SessionSync(claudeDir, repoDir);
    const result = sync.pullFromRepo();

    expect(result.filesSkipped).toBe(1);
    expect(result.filesUpdated).toBe(0);

    // Local file should be unchanged
    const localContent = readFileSync(join(localProjectDir, "session.jsonl"), "utf-8");
    expect(localContent).toBe(longerContent);
  });

  it("overwrites local with repo when repo file is longer", () => {
    const repoProjectDir = join(repoDir, "projects", "my-project");
    mkdirSync(repoProjectDir, { recursive: true });
    const longerContent = makeJsonlWithCwd("/tmp") + makeJsonlWithCwd("/tmp/extra");
    writeFileSync(join(repoProjectDir, "session.jsonl"), longerContent);

    const localProjectDir = join(claudeDir, "projects", "my-project");
    mkdirSync(localProjectDir, { recursive: true });
    writeFileSync(join(localProjectDir, "session.jsonl"), "{}");

    const sync = new SessionSync(claudeDir, repoDir);
    const result = sync.pullFromRepo();

    expect(result.filesUpdated).toBe(1);
    expect(result.filesSkipped).toBe(0);
  });

  it("ignores non-JSONL files in repo", () => {
    const repoProjectDir = join(repoDir, "projects", "my-project");
    mkdirSync(repoProjectDir, { recursive: true });
    writeFileSync(join(repoProjectDir, "session.jsonl"), makeJsonlWithCwd("/tmp"));
    writeFileSync(join(repoProjectDir, "notes.txt"), "ignore me");

    const sync = new SessionSync(claudeDir, repoDir);
    const result = sync.pullFromRepo();

    expect(result.filesUpdated).toBe(1);
    const localFiles = require("fs").readdirSync(
      join(claudeDir, "projects", require("fs").readdirSync(join(claudeDir, "projects"))[0])
    );
    expect(localFiles).toContain("session.jsonl");
    expect(localFiles).not.toContain("notes.txt");
  });

  it("returns empty result when repo projects dir does not exist", () => {
    const emptyRepoDir = join(tmpDir, "nonexistent");
    const sync = new SessionSync(claudeDir, emptyRepoDir);
    const result = sync.pullFromRepo();

    expect(result.filesUpdated).toBe(0);
    expect(result.filesSkipped).toBe(0);
    expect(result.projects).toHaveLength(0);
  });

  it("does not crash on empty repo projects directory", () => {
    const sync = new SessionSync(claudeDir, repoDir);
    const result = sync.pullFromRepo();

    expect(result.filesUpdated).toBe(0);
    expect(result.filesSkipped).toBe(0);
    expect(result.projects).toHaveLength(0);
  });

  it("passes through lines without cwd unchanged on pull", () => {
    const repoProjectDir = join(repoDir, "projects", "my-project");
    mkdirSync(repoProjectDir, { recursive: true });
    const lines = [
      JSON.stringify({ type: "message", text: "no cwd here" }),
      JSON.stringify({ type: "meta", cwd: "$HOME/projects" }),
      JSON.stringify({ type: "tool", result: "done" }),
    ].join("\n") + "\n";
    writeFileSync(join(repoProjectDir, "session.jsonl"), lines);

    const sync = new SessionSync(claudeDir, repoDir);
    sync.pullFromRepo();

    const localProjDir = join(claudeDir, "projects", require("fs").readdirSync(join(claudeDir, "projects"))[0]);
    const content = readFileSync(join(localProjDir, "session.jsonl"), "utf-8");
    const outputLines = content.split("\n").filter((l) => l.trim());
    const firstObj = JSON.parse(outputLines[0]);
    const thirdObj = JSON.parse(outputLines[2]);

    expect(firstObj.text).toBe("no cwd here");
    expect(thirdObj.result).toBe("done");
  });

  it("tracks projects in result", () => {
    mkdirSync(join(repoDir, "projects", "proj-a"), { recursive: true });
    mkdirSync(join(repoDir, "projects", "proj-b"), { recursive: true });
    writeFileSync(join(repoDir, "projects", "proj-a", "s1.jsonl"), makeJsonlWithCwd("/tmp"));
    writeFileSync(join(repoDir, "projects", "proj-b", "s2.jsonl"), makeJsonlWithCwd("/tmp"));

    const sync = new SessionSync(claudeDir, repoDir);
    const result = sync.pullFromRepo();

    expect(result.filesUpdated).toBe(2);
    expect(result.projects).toHaveLength(2);
  });
});
