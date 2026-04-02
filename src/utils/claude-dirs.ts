import { homedir } from "os";
import { join } from "path";

export const CLAUDE_HOME = join(homedir(), ".claude");
export const CLAUDE_PROJECTS = join(CLAUDE_HOME, "projects");
export const CLAUDE_SKILLS = join(CLAUDE_HOME, "skills");
export const CLAUDE_AGENTS = join(CLAUDE_HOME, "agents");
export const CLAUDE_HOOKS = join(CLAUDE_HOME, "hooks");
export const CLAUDE_PLUGINS = join(CLAUDE_HOME, "plugins");
export const CLAUDE_SETTINGS = join(CLAUDE_HOME, "settings.json");
export const CLAUDE_KEYBINDINGS = join(CLAUDE_HOME, "keybindings.json");
export const CLAUDE_HISTORY = join(CLAUDE_HOME, "history.jsonl");

export const CC_HOME = join(homedir(), ".claude-continuity");
export const CC_REPO = join(CC_HOME, "repo");
export const CC_LOCK = join(CC_HOME, ".push.lock");
export const CC_CONFIG = join(CC_HOME, "config.json");
export const CC_PENDING_PUSH = join(CC_HOME, ".pending-push");
export const CC_PENDING_PLUGINS = join(CC_HOME, "pending-plugins.json");
export const CC_PLUGIN_DECISIONS = join(CC_HOME, "plugin-decisions.json");
