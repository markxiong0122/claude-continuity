import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { HookInstaller } from "../../src/hooks/installer";

// Helper to find a claude-continuity hook entry in the new format
function findCCHook(entries: Array<{ matcher: string; hooks: Array<{ type: string; command: string; timeout?: number }> }>, needle: string) {
  return entries.find((e) => e.hooks?.some((h) => h.command.includes(needle)));
}

function findCCCommand(entries: Array<{ matcher: string; hooks: Array<{ type: string; command: string; timeout?: number }> }>, needle: string) {
  const entry = findCCHook(entries, needle);
  return entry?.hooks?.find((h) => h.command.includes(needle));
}

describe("HookInstaller", () => {
  let claudeDir: string;
  let installer: HookInstaller;

  beforeEach(() => {
    claudeDir = mkdtempSync(join(tmpdir(), "cc-hooks-"));
    installer = new HookInstaller(claudeDir);
  });

  afterEach(() => {
    rmSync(claudeDir, { recursive: true, force: true });
  });

  describe("install()", () => {
    it("creates settings.json if it does not exist", () => {
      expect(existsSync(join(claudeDir, "settings.json"))).toBe(false);

      installer.install();

      expect(existsSync(join(claudeDir, "settings.json"))).toBe(true);
    });

    it("adds SessionStart hook with pull command in correct format", () => {
      installer.install();

      const settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
      const sessionStart = settings.hooks?.SessionStart ?? [];
      const entry = findCCHook(sessionStart, "claude-continuity pull");
      expect(entry).toBeDefined();
      expect(entry!.matcher).toBe("");
      const cmd = findCCCommand(sessionStart, "claude-continuity pull");
      expect(cmd).toBeDefined();
      expect(cmd!.type).toBe("command");
      expect(cmd!.command).toBe("claude-continuity pull --quiet");
      expect(cmd!.timeout).toBe(10000);
    });

    it("adds Stop hook with push command in correct format", () => {
      installer.install();

      const settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
      const stop = settings.hooks?.Stop ?? [];
      const entry = findCCHook(stop, "claude-continuity push");
      expect(entry).toBeDefined();
      expect(entry!.matcher).toBe("");
      const cmd = findCCCommand(stop, "claude-continuity push");
      expect(cmd).toBeDefined();
      expect(cmd!.type).toBe("command");
      expect(cmd!.command).toBe("claude-continuity push --quiet --background");
      expect(cmd!.timeout).toBe(5000);
    });

    it("preserves existing settings when installing", () => {
      const existing = {
        theme: "dark",
        fontSize: 14,
        hooks: {
          SessionStart: [{ matcher: "Bash", hooks: [{ type: "command", command: "some-other-tool start" }] }],
        },
      };
      writeFileSync(join(claudeDir, "settings.json"), JSON.stringify(existing));

      installer.install();

      const settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
      expect(settings.theme).toBe("dark");
      expect(settings.fontSize).toBe(14);
      const sessionStart = settings.hooks?.SessionStart ?? [];
      const otherHook = sessionStart.find((h: any) =>
        h.hooks?.some((c: any) => c.command === "some-other-tool start"),
      );
      expect(otherHook).toBeDefined();
    });

    it("preserves existing Stop hooks from other tools", () => {
      const existing = {
        hooks: {
          Stop: [{ matcher: "", hooks: [{ type: "command", command: "some-other-tool stop" }] }],
        },
      };
      writeFileSync(join(claudeDir, "settings.json"), JSON.stringify(existing));

      installer.install();

      const settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
      const stop = settings.hooks?.Stop ?? [];
      const otherHook = stop.find((h: any) =>
        h.hooks?.some((c: any) => c.command === "some-other-tool stop"),
      );
      expect(otherHook).toBeDefined();
    });

    it("does not add duplicate hooks on re-install", () => {
      installer.install();
      installer.install();

      const settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
      const sessionStart = settings.hooks?.SessionStart ?? [];
      const stop = settings.hooks?.Stop ?? [];
      const pullHooks = sessionStart.filter((h: any) =>
        h.hooks?.some((c: any) => c.command.includes("claude-continuity")),
      );
      const pushHooks = stop.filter((h: any) =>
        h.hooks?.some((c: any) => c.command.includes("claude-continuity")),
      );
      expect(pullHooks).toHaveLength(1);
      expect(pushHooks).toHaveLength(1);
    });

    it("writes output with trailing newline", () => {
      installer.install();

      const raw = readFileSync(join(claudeDir, "settings.json"), "utf-8");
      expect(raw.endsWith("\n")).toBe(true);
    });
  });

  describe("uninstall()", () => {
    it("removes claude-continuity hooks from settings.json", () => {
      installer.install();
      installer.uninstall();

      const settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
      const sessionStart = settings.hooks?.SessionStart ?? [];
      const stop = settings.hooks?.Stop ?? [];
      const ccSessionHooks = sessionStart.filter((h: any) =>
        h.hooks?.some((c: any) => c.command.includes("claude-continuity")),
      );
      const ccStopHooks = stop.filter((h: any) =>
        h.hooks?.some((c: any) => c.command.includes("claude-continuity")),
      );
      expect(ccSessionHooks).toHaveLength(0);
      expect(ccStopHooks).toHaveLength(0);
    });

    it("preserves other hooks when uninstalling", () => {
      const existing = {
        hooks: {
          SessionStart: [{ matcher: "", hooks: [{ type: "command", command: "some-other-tool start" }] }],
          Stop: [{ matcher: "", hooks: [{ type: "command", command: "some-other-tool stop" }] }],
        },
      };
      writeFileSync(join(claudeDir, "settings.json"), JSON.stringify(existing));

      installer.install();
      installer.uninstall();

      const settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
      const sessionStart = settings.hooks?.SessionStart ?? [];
      const stop = settings.hooks?.Stop ?? [];
      const otherStart = sessionStart.find((h: any) =>
        h.hooks?.some((c: any) => c.command === "some-other-tool start"),
      );
      const otherStop = stop.find((h: any) =>
        h.hooks?.some((c: any) => c.command === "some-other-tool stop"),
      );
      expect(otherStart).toBeDefined();
      expect(otherStop).toBeDefined();
    });

    it("does not throw when settings.json does not exist", () => {
      expect(() => installer.uninstall()).not.toThrow();
    });

    it("preserves other top-level settings when uninstalling", () => {
      const existing = { theme: "dark", customKey: 42 };
      writeFileSync(join(claudeDir, "settings.json"), JSON.stringify(existing));

      installer.install();
      installer.uninstall();

      const settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
      expect(settings.theme).toBe("dark");
      expect(settings.customKey).toBe(42);
    });
  });

  describe("isInstalled()", () => {
    it("returns false before install", () => {
      expect(installer.isInstalled()).toBe(false);
    });

    it("returns false when settings.json does not exist", () => {
      expect(existsSync(join(claudeDir, "settings.json"))).toBe(false);
      expect(installer.isInstalled()).toBe(false);
    });

    it("returns true after install", () => {
      installer.install();
      expect(installer.isInstalled()).toBe(true);
    });

    it("returns false after uninstall", () => {
      installer.install();
      installer.uninstall();
      expect(installer.isInstalled()).toBe(false);
    });

    it("returns false when hooks section is missing", () => {
      writeFileSync(join(claudeDir, "settings.json"), JSON.stringify({ theme: "dark" }));
      expect(installer.isInstalled()).toBe(false);
    });

    it("returns false when only unrelated hooks are present", () => {
      const settings = {
        hooks: {
          SessionStart: [{ matcher: "", hooks: [{ type: "command", command: "some-other-tool start" }] }],
        },
      };
      writeFileSync(join(claudeDir, "settings.json"), JSON.stringify(settings));
      expect(installer.isInstalled()).toBe(false);
    });
  });
});
