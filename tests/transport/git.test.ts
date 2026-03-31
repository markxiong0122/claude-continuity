import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { GitTransport } from "../../src/transport/git";

describe("GitTransport", () => {
  let tmpDir: string;
  let remoteDir: string;
  let git: GitTransport;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "cc-test-"));
    remoteDir = mkdtempSync(join(tmpdir(), "cc-remote-"));
    Bun.spawnSync(["git", "init", "--bare", remoteDir]);
    git = new GitTransport(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(remoteDir, { recursive: true, force: true });
  });

  it("clones a remote repo", async () => {
    await git.clone(remoteDir);
    expect(Bun.spawnSync(["git", "status"], { cwd: tmpDir }).exitCode).toBe(0);
  });

  it("commits and pushes files", async () => {
    await git.clone(remoteDir);
    Bun.write(join(tmpDir, "test.txt"), "hello");
    await git.commitAndPush("test commit");
    const log = Bun.spawnSync(["git", "log", "--oneline"], { cwd: remoteDir });
    expect(log.stdout.toString()).toContain("test commit");
  });

  it("reports nothing to commit when clean", async () => {
    await git.clone(remoteDir);
    Bun.write(join(tmpDir, "test.txt"), "hello");
    await git.commitAndPush("initial");
    const result = await git.commitAndPush("should be empty");
    expect(result.stdout).toContain("Nothing to commit");
  });

  it("pulls changes from remote", async () => {
    await git.clone(remoteDir);
    Bun.write(join(tmpDir, "test.txt"), "hello");
    await git.commitAndPush("initial");

    const otherDir = mkdtempSync(join(tmpdir(), "cc-other-"));
    Bun.spawnSync(["git", "clone", remoteDir, otherDir]);
    Bun.write(join(otherDir, "other.txt"), "from other device");
    Bun.spawnSync(["git", "add", "."], { cwd: otherDir });
    Bun.spawnSync(["git", "commit", "-m", "other device"], { cwd: otherDir });
    Bun.spawnSync(["git", "push"], { cwd: otherDir });

    const result = await git.pull();
    expect(result.success).toBe(true);
    expect(Bun.file(join(tmpDir, "other.txt")).size).toBeGreaterThan(0);
    rmSync(otherDir, { recursive: true, force: true });
  });

  it("handles pull when offline gracefully", async () => {
    await git.clone(remoteDir);
    Bun.spawnSync(["git", "remote", "set-url", "origin", "git@nonexistent:repo.git"], { cwd: tmpDir });
    const result = await git.pull();
    expect(result.success).toBe(false);
  });

  it("initializes an empty repo", async () => {
    await git.init();
    expect(await git.isRepo()).toBe(true);
  });
});
