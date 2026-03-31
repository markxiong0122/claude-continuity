import { spawn } from "child_process";

export interface GitResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

export class GitTransport {
  constructor(private repoDir: string) {}

  private async exec(args: string[]): Promise<GitResult> {
    return new Promise((resolve) => {
      const proc = spawn("git", args, { cwd: this.repoDir, timeout: 15_000 });
      let stdout = "";
      let stderr = "";
      proc.stdout?.on("data", (d) => (stdout += d.toString()));
      proc.stderr?.on("data", (d) => (stderr += d.toString()));
      proc.on("close", (code) => resolve({ success: code === 0, stdout, stderr }));
      proc.on("error", (err) => resolve({ success: false, stdout, stderr: err.message }));
    });
  }

  async clone(remoteUrl: string): Promise<GitResult> {
    return this.exec(["clone", "--depth", "1", remoteUrl, "."]);
  }

  async init(): Promise<GitResult> {
    return this.exec(["init"]);
  }

  async addRemote(name: string, url: string): Promise<GitResult> {
    return this.exec(["remote", "add", name, url]);
  }

  async pull(): Promise<GitResult> {
    const result = await this.exec(["pull", "--ff-only"]);
    if (!result.success && result.stderr.includes("diverged")) {
      await this.exec(["stash"]);
      const rebaseResult = await this.exec(["pull", "--rebase"]);
      await this.exec(["stash", "pop"]);
      return rebaseResult;
    }
    return result;
  }

  async commitAndPush(message: string): Promise<GitResult> {
    await this.exec(["add", "-A"]);
    const status = await this.exec(["status", "--porcelain"]);
    if (!status.stdout.trim()) {
      return { success: true, stdout: "Nothing to commit", stderr: "" };
    }
    const commitResult = await this.exec(["commit", "-m", message]);
    if (!commitResult.success) return commitResult;
    return this.exec(["push"]);
  }

  async status(): Promise<GitResult> {
    return this.exec(["status", "--porcelain"]);
  }

  async log(count: number = 10): Promise<GitResult> {
    return this.exec(["log", "--oneline", `-${count}`]);
  }

  async isRepo(): Promise<boolean> {
    const result = await this.exec(["rev-parse", "--is-inside-work-tree"]);
    return result.success;
  }
}
