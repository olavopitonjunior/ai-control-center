import { describe, expect, it } from "vitest";
import path from "node:path";
import { resolveToken, TOKEN_FILENAME } from "./config";

/** Build fake fs helpers over a virtual map of path -> contents. */
function fakeFs(files: Record<string, string>) {
  const norm = (p: string) => path.normalize(p);
  const map = new Map(Object.entries(files).map(([k, v]) => [norm(k), v]));
  return {
    exists: (p: string) => map.has(norm(p)),
    read: (p: string) => {
      const v = map.get(norm(p));
      if (v === undefined) throw new Error("ENOENT");
      return v;
    },
  };
}

describe("resolveToken", () => {
  it("prefers an explicit ACC_AGENT_TOKEN", () => {
    const fs = fakeFs({ [path.join("C:", "repo", TOKEN_FILENAME)]: "from-file" });
    expect(resolveToken({ ACC_AGENT_TOKEN: "inline" }, "C:\\repo", fs.read, fs.exists)).toBe(
      "inline",
    );
  });

  it("reads ACC_AGENT_TOKEN_FILE when no inline token is set", () => {
    const p = path.join("C:", "secrets", "tok");
    const fs = fakeFs({ [p]: "  file-token\n" });
    expect(resolveToken({ ACC_AGENT_TOKEN_FILE: p }, "C:\\repo", fs.read, fs.exists)).toBe(
      "file-token",
    );
  });

  it("finds the token file in a PARENT directory (agent runs from apps/agent)", () => {
    const repo = path.join("C:", "repo");
    const cwd = path.join(repo, "apps", "agent");
    const fs = fakeFs({ [path.join(repo, TOKEN_FILENAME)]: "walked-up-token" });
    expect(resolveToken({}, cwd, fs.read, fs.exists)).toBe("walked-up-token");
  });

  // A trailing newline is the classic cause of a silent 401.
  it("trims surrounding whitespace", () => {
    const repo = path.join("C:", "repo");
    const fs = fakeFs({ [path.join(repo, TOKEN_FILENAME)]: "tok-with-newline\r\n" });
    expect(resolveToken({}, repo, fs.read, fs.exists)).toBe("tok-with-newline");
  });

  it("returns null when nothing is configured", () => {
    const fs = fakeFs({});
    expect(resolveToken({}, path.join("C:", "nowhere"), fs.read, fs.exists)).toBeNull();
  });

  it("returns null for an empty token file rather than an empty string", () => {
    const repo = path.join("C:", "repo");
    const fs = fakeFs({ [path.join(repo, TOKEN_FILENAME)]: "   \n" });
    expect(resolveToken({}, repo, fs.read, fs.exists)).toBeNull();
  });
});
