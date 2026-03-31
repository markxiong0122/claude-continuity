# claude-continuity

Sync Claude Code sessions, config, and skills across devices. Zero commands -- it just works.

## Setup

1. Create a **private** git repo (e.g., `gh repo create claude-sync-data --private`)
2. Initialize:

```bash
claude-continuity init git@github.com:YOUR_USER/claude-sync-data.git
```

This clones the repo and installs Claude Code hooks so sync happens automatically.

## How It Works

- **On session end:** Writes a pending-push marker; next session start pushes changes
- **On session start:** Pushes any pending changes, then pulls latest from the repo
- **Path remapping:** Normalizes home directory paths so sync works across macOS and Linux
- **Dependency notifications:** If a new skill was installed on another device, shows what's missing

## Commands

| Command | Description |
|---------|-------------|
| `cc init <url>` | Set up sync with a git repo |
| `cc push` | Manually push current state |
| `cc pull` | Manually pull latest state |
| `cc status` | Show sync status |
| `cc deps` | Show missing dependencies from synced skills |
| `cc restore` | Show sync history for rollback |

## What Gets Synced

- `~/.claude/projects/` -- session conversations (JSONL)
- `~/.claude/settings.json` -- user preferences (key-level merge)
- `~/.claude/keybindings.json` -- keyboard shortcuts
- `~/.claude/skills/` -- custom skills
- `~/.claude/agents/` -- custom agents
- `~/.claude/hooks/` -- automation hooks
- `~/.claude/plugins/` -- installed plugins

## What Does NOT Get Synced

- `credentials.json` -- auth tokens (machine-specific)
- Project-level `CLAUDE.md` -- checked into project repos

## Cross-Platform

Paths are normalized using `$HOME` so sync works between macOS (`/Users/mark/`) and Linux (`/home/mark/`). Only metadata fields (`cwd`) are remapped -- conversation content is never modified.

## Conflict Resolution

- **Sessions:** Longer file wins (more conversation history)
- **Config:** Key-level merge (new keys added, shared keys updated, local-only keys preserved)
- **Skills:** Additive merge (new skills added, existing not overwritten)

## Development

```bash
bun install
bun test
```
