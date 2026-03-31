import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const PULL_COMMAND = "claude-continuity pull --quiet";
const PUSH_COMMAND = "claude-continuity push --quiet --background";

interface Hook {
  command: string;
  timeout?: number;
}

interface Settings {
  hooks?: {
    SessionStart?: Hook[];
    Stop?: Hook[];
    [key: string]: Hook[] | undefined;
  };
  [key: string]: unknown;
}

export class HookInstaller {
  private settingsPath: string;

  constructor(claudeDir: string) {
    this.settingsPath = join(claudeDir, "settings.json");
  }

  install(): void {
    const settings = this.readSettings();
    if (!settings.hooks) settings.hooks = {};
    if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
    if (!settings.hooks.Stop) settings.hooks.Stop = [];

    // Remove existing claude-continuity hooks (prevent duplicates)
    settings.hooks.SessionStart = settings.hooks.SessionStart.filter(
      (h) => !h.command.includes("claude-continuity"),
    );
    settings.hooks.Stop = settings.hooks.Stop.filter(
      (h) => !h.command.includes("claude-continuity"),
    );

    settings.hooks.SessionStart.push({ command: PULL_COMMAND, timeout: 10000 });
    settings.hooks.Stop.push({ command: PUSH_COMMAND, timeout: 5000 });
    this.writeSettings(settings);
  }

  uninstall(): void {
    const settings = this.readSettings();
    if (settings.hooks?.SessionStart) {
      settings.hooks.SessionStart = settings.hooks.SessionStart.filter(
        (h) => !h.command.includes("claude-continuity"),
      );
    }
    if (settings.hooks?.Stop) {
      settings.hooks.Stop = settings.hooks.Stop.filter(
        (h) => !h.command.includes("claude-continuity"),
      );
    }
    this.writeSettings(settings);
  }

  isInstalled(): boolean {
    const settings = this.readSettings();
    return (settings.hooks?.SessionStart ?? []).some((h) =>
      h.command.includes("claude-continuity"),
    );
  }

  private readSettings(): Settings {
    if (!existsSync(this.settingsPath)) return {};
    return JSON.parse(readFileSync(this.settingsPath, "utf-8"));
  }

  private writeSettings(settings: Settings): void {
    writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2) + "\n");
  }
}
