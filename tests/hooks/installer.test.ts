import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { HookInstaller } from "../../src/hooks/installer";

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

    it("adds SessionStart hook with pull command", () => {
      installer.install();

      const settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
      const sessionStart = settings.hooks?.SessionStart ?? [];
      const pullHook = sessionStart.find((h: { command: string }) =>
        h.command.includes("claude-continuity pull"),
      );
      expect(pullHook).toBeDefined();
      expect(pullHook.command).toBe("claude-continuity pull --quiet");
      expect(pullHook.timeout).toBe(10000);
    });

    it("adds Stop hook with push command", () => {
      installer.install();

      const settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
      const stop = settings.hooks?.Stop ?? [];
      const pushHook = stop.find((h: { command: string }) =>
        h.command.includes("claude-continuity push"),
      );
      expect(pushHook).toBeDefined();
      expect(pushHook.command).toBe("claude-continuity push --quiet --background");
      expect(pushHook.timeout).toBe(5000);
    });

    it("preserves existing settings when installing", () => {
      const existing = {
        theme: "dark",
        fontSize: 14,
        hooks: {
          SessionStart: [{ command: "some-other-tool start" }],
        },
      };
      writeFileSync(join(claudeDir, "settings.json"), JSON.stringify(existing));

      installer.install();

      const settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
      expect(settings.theme).toBe("dark");
      expect(settings.fontSize).toBe(14);
      const sessionStart = settings.hooks?.SessionStart ?? [];
      const otherHook = sessionStart.find((h: { command: string }) =>
        h.command === "some-other-tool start",
      );
      expect(otherHook).toBeDefined();
    });

    it("preserves existing Stop hooks from other tools", () => {
      const existing = {
        hooks: {
          Stop: [{ command: "some-other-tool stop" }],
        },
      };
      writeFileSync(join(claudeDir, "settings.json"), JSON.stringify(existing));

      installer.install();

      const settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
      const stop = settings.hooks?.Stop ?? [];
      const otherHook = stop.find((h: { command: string }) =>
        h.command === "some-other-tool stop",
      );
      expect(otherHook).toBeDefined();
    });

    it("does not add duplicate hooks on re-install", () => {
      installer.install();
      installer.install();

      const settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
      const sessionStart = settings.hooks?.SessionStart ?? [];
      const stop = settings.hooks?.Stop ?? [];
      const pullHooks = sessionStart.filter((h: { command: string }) =>
        h.command.includes("claude-continuity"),
      );
      const pushHooks = stop.filter((h: { command: string }) =>
        h.command.includes("claude-continuity"),
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
      const ccSessionHooks = sessionStart.filter((h: { command: string }) =>
        h.command.includes("claude-continuity"),
      );
      const ccStopHooks = stop.filter((h: { command: string }) =>
        h.command.includes("claude-continuity"),
      );
      expect(ccSessionHooks).toHaveLength(0);
      expect(ccStopHooks).toHaveLength(0);
    });

    it("preserves other hooks when uninstalling", () => {
      const existing = {
        hooks: {
          SessionStart: [{ command: "some-other-tool start" }],
          Stop: [{ command: "some-other-tool stop" }],
        },
      };
      writeFileSync(join(claudeDir, "settings.json"), JSON.stringify(existing));

      installer.install();
      installer.uninstall();

      const settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
      const sessionStart = settings.hooks?.SessionStart ?? [];
      const stop = settings.hooks?.Stop ?? [];
      const otherStart = sessionStart.find((h: { command: string }) =>
        h.command === "some-other-tool start",
      );
      const otherStop = stop.find((h: { command: string }) =>
        h.command === "some-other-tool stop",
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
          SessionStart: [{ command: "some-other-tool start" }],
        },
      };
      writeFileSync(join(claudeDir, "settings.json"), JSON.stringify(settings));
      expect(installer.isInstalled()).toBe(false);
    });
  });
});
