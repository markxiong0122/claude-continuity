import { existsSync, writeFileSync, unlinkSync, readFileSync } from "fs";
import { CC_LOCK } from "./claude-dirs";

export function acquireLock(): boolean {
  if (existsSync(CC_LOCK)) {
    try {
      const lockData = JSON.parse(readFileSync(CC_LOCK, "utf-8"));
      const age = Date.now() - lockData.timestamp;
      if (age < 60_000) return false;
    } catch {
      // Corrupt lock file, treat as stale
    }
  }
  writeFileSync(CC_LOCK, JSON.stringify({ pid: process.pid, timestamp: Date.now() }));
  return true;
}

export function releaseLock(): void {
  try { unlinkSync(CC_LOCK); } catch { }
}

export async function waitForLock(timeoutMs: number = 3000): Promise<void> {
  const start = Date.now();
  while (existsSync(CC_LOCK)) {
    try {
      const lockData = JSON.parse(readFileSync(CC_LOCK, "utf-8"));
      const age = Date.now() - lockData.timestamp;
      if (age > 60_000) { releaseLock(); return; }
    } catch { return; }
    if (Date.now() - start > timeoutMs) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}
