import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { SessionSync } from "../../src/sync/sessions";
import { ConfigSync } from "../../src/sync/config";
import { SkillsSync } from "../../src/sync/skills";
import { ManifestSync } from "../../src/sync/manifest";

describe("Full round-trip sync", () => {
  let deviceA_claude: string;
  let deviceB_claude: string;
  let syncRepo: string;

  beforeEach(() => {
    deviceA_claude = mkdtempSync(join(tmpdir(), "cc-deviceA-"));
    deviceB_claude = mkdtempSync(join(tmpdir(), "cc-deviceB-"));
    syncRepo = mkdtempSync(join(tmpdir(), "cc-sync-"));
  });

  afterEach(() => {
    rmSync(deviceA_claude, { recursive: true, force: true });
    rmSync(deviceB_claude, { recursive: true, force: true });
    rmSync(syncRepo, { recursive: true, force: true });
  });

  // Test 1: Session sync A → repo → B
  it("syncs a session from device A to device B", () => {
    const projectDir = join(deviceA_claude, "projects", "-test-project");
    mkdirSync(projectDir, { recursive: true });
    const session = [
      JSON.stringify({ type: "summary", cwd: "/test/project", sessionId: "sess-1" }),
      JSON.stringify({ type: "human", message: { content: "Hello" }, cwd: "/test/project" }),
      JSON.stringify({ type: "assistant", message: { content: "Hi there!" }, cwd: "/test/project" }),
    ].join("\n") + "\n";
    writeFileSync(join(projectDir, "sess-1.jsonl"), session);

    const sessionSyncA = new SessionSync(deviceA_claude, syncRepo);
    const pushResult = sessionSyncA.pushToRepo();
    expect(pushResult.filesUpdated).toBe(1);

    const sessionSyncB = new SessionSync(deviceB_claude, syncRepo);
    const pullResult = sessionSyncB.pullFromRepo();
    expect(pullResult.filesUpdated).toBe(1);

    const deviceBProject = join(deviceB_claude, "projects", "-test-project");
    expect(existsSync(join(deviceBProject, "sess-1.jsonl"))).toBe(true);
    const content = readFileSync(join(deviceBProject, "sess-1.jsonl"), "utf-8");
    expect(content).toContain("Hi there!");
  });

  // Test 2: Dependency notification on new skill
  it("notifies about new skills with missing dependencies", () => {
    const skillsA = join(deviceA_claude, "skills");
    mkdirSync(skillsA, { recursive: true });
    writeFileSync(join(skillsA, "security.md"), `---
name: security
requires:
  brew:
    - trivy
  npm:
    - semgrep
---
# Security Skill
`);

    const skillsSyncA = new SkillsSync(deviceA_claude, syncRepo);
    skillsSyncA.pushToRepo();
    const manifestA = new ManifestSync(deviceA_claude, syncRepo);
    manifestA.saveToRepo(manifestA.generate());

    const manifestB = new ManifestSync(deviceB_claude, syncRepo);
    const localManifest = manifestB.generate();
    const remoteManifest = manifestB.loadFromRepo();

    expect(remoteManifest).not.toBeNull();
    const diff = manifestB.diff(remoteManifest!, localManifest);
    expect(diff.newSkills).toContain("security.md");
    expect(diff.missingDeps.brew).toContain("trivy");
    expect(diff.missingDeps.npm).toContain("semgrep");
  });

  // Test 3: Config key-level merge
  it("config sync merges by key, preserving local-only keys", () => {
    // Device A has settings
    writeFileSync(join(deviceA_claude, "settings.json"), JSON.stringify({
      effortLevel: "high",
      sharedSetting: "from-A"
    }));

    const configA = new ConfigSync(deviceA_claude, syncRepo);
    configA.pushToRepo();

    // Device B has different settings including a local-only key
    writeFileSync(join(deviceB_claude, "settings.json"), JSON.stringify({
      effortLevel: "low",
      localOnlyKey: "should-survive"
    }));

    const configB = new ConfigSync(deviceB_claude, syncRepo);
    configB.pullFromRepo();

    const result = JSON.parse(readFileSync(join(deviceB_claude, "settings.json"), "utf-8"));
    expect(result.effortLevel).toBe("high"); // Remote wins on shared key
    expect(result.sharedSetting).toBe("from-A"); // New key added
    expect(result.localOnlyKey).toBe("should-survive"); // Local-only key preserved
  });

  // Test 4: Skill deletion tracking
  it("detects removed skills in manifest diff", () => {
    const remote: any = {
      device: "home-mac",
      timestamp: new Date().toISOString(),
      skills: { "remaining.md": {} },
    };
    const local: any = {
      device: "macbook",
      timestamp: new Date().toISOString(),
      skills: { "remaining.md": {}, "deleted.md": {} },
    };

    const manifestB = new ManifestSync(deviceB_claude, syncRepo);
    const diff = manifestB.diff(remote, local);
    expect(diff.removedSkills).toContain("deleted.md");
  });

  // Test 5: Skills additive merge preserves local
  it("skills sync adds new skills without overwriting existing", () => {
    // Device A has skill-a and skill-b
    const skillsA = join(deviceA_claude, "skills");
    mkdirSync(skillsA, { recursive: true });
    writeFileSync(join(skillsA, "skill-a.md"), "# Skill A from device A");
    writeFileSync(join(skillsA, "skill-b.md"), "# Skill B (new)");

    const skillsSyncA = new SkillsSync(deviceA_claude, syncRepo);
    skillsSyncA.pushToRepo();

    // Device B has skill-a (different content)
    const skillsB = join(deviceB_claude, "skills");
    mkdirSync(skillsB, { recursive: true });
    writeFileSync(join(skillsB, "skill-a.md"), "# Skill A from device B (local)");

    const skillsSyncB = new SkillsSync(deviceB_claude, syncRepo);
    const pullResult = skillsSyncB.pullFromRepo();

    // skill-a: local wins (not overwritten)
    expect(readFileSync(join(skillsB, "skill-a.md"), "utf-8")).toBe("# Skill A from device B (local)");
    // skill-b: new, added from repo
    expect(existsSync(join(skillsB, "skill-b.md"))).toBe(true);
    expect(pullResult.newItems).toContain("skills/skill-b.md");
  });

  // Test 6: Session conflict — longer file wins
  it("on session conflict, longer file wins (more conversation history)", () => {
    // Repo has short session
    const repoProject = join(syncRepo, "projects", "-test-project");
    mkdirSync(repoProject, { recursive: true });
    writeFileSync(join(repoProject, "sess.jsonl"), '{"type":"summary"}\n');

    // Local has longer session (more messages)
    const localProject = join(deviceB_claude, "projects", "-test-project");
    mkdirSync(localProject, { recursive: true });
    writeFileSync(join(localProject, "sess.jsonl"), '{"type":"summary"}\n{"type":"human"}\n{"type":"assistant"}\n');

    const sync = new SessionSync(deviceB_claude, syncRepo);
    const result = sync.pullFromRepo();

    // Local is longer, should NOT be overwritten
    const content = readFileSync(join(localProject, "sess.jsonl"), "utf-8");
    expect(content.split("\n").filter(Boolean).length).toBe(3);
  });
});
