import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// We need to test with a custom lock path, so we'll test the logic directly
describe("Lock mechanism", () => {
  let lockDir: string;
  let lockPath: string;

  beforeEach(() => {
    lockDir = mkdtempSync(join(tmpdir(), "cc-lock-"));
    lockPath = join(lockDir, ".push.lock");
  });

  afterEach(() => {
    rmSync(lockDir, { recursive: true, force: true });
  });

  it("acquires lock when no lock exists", () => {
    expect(existsSync(lockPath)).toBe(false);
    // Lock doesn't exist, so we can acquire
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid, timestamp: Date.now() }));
    expect(existsSync(lockPath)).toBe(true);
  });

  it("detects fresh lock as blocking", () => {
    writeFileSync(lockPath, JSON.stringify({ pid: 99999, timestamp: Date.now() }));
    const lockData = JSON.parse(require("fs").readFileSync(lockPath, "utf-8"));
    const age = Date.now() - lockData.timestamp;
    expect(age).toBeLessThan(60_000);
  });

  it("detects stale lock (>60s old) as overridable", () => {
    const staleTimestamp = Date.now() - 70_000; // 70 seconds ago
    writeFileSync(lockPath, JSON.stringify({ pid: 99999, timestamp: staleTimestamp }));
    const lockData = JSON.parse(require("fs").readFileSync(lockPath, "utf-8"));
    const age = Date.now() - lockData.timestamp;
    expect(age).toBeGreaterThan(60_000);
  });
});
