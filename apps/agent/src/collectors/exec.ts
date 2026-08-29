import { spawn } from "node:child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * Run a command with a hard timeout. Never rejects on non-zero exit — returns the
 * captured output and code so callers decide. Rejects only if the process cannot be
 * spawned (e.g. binary missing) or times out.
 */
export function execWithTimeout(
  command: string,
  args: string[],
  timeoutMs: number,
  options: { shell?: boolean } = {},
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      // Default: use a shell on Windows so npx/npx.cmd resolves. Callers invoking a
      // real .exe directly (e.g. powershell.exe) pass shell:false to avoid cmd quoting.
      shell: options.shell ?? process.platform === "win32",
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`command timed out after ${timeoutMs}ms: ${command}`));
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}

/**
 * Time-based cache so we don't re-spawn an expensive CLI on every poll. Keyed by an
 * arbitrary string; entries expire after ttlMs. The clock is injected for testability.
 */
export class TtlCache<T> {
  private store = new Map<string, { value: T; expires: number }>();
  constructor(
    private ttlMs: number,
    private now: () => number = () => Date.now(),
  ) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expires: this.now() + this.ttlMs });
  }
}
