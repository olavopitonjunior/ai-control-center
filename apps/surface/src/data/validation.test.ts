import { describe, expect, it } from "vitest";
import { validateAddress, validateToken } from "./validation";

describe("validateToken", () => {
  it("accepts a well-formed generated token", () => {
    expect(validateToken("a".repeat(43))).toBeNull();
    expect(validateToken("Ab3xY7_qK-".padEnd(43, "z"))).toBeNull();
  });

  it("allows an empty token (loopback agents need none)", () => {
    expect(validateToken("")).toBeNull();
    expect(validateToken("   ")).toBeNull();
  });

  // Regression: the user pasted the command instead of running it.
  it("rejects a pasted shell command", () => {
    const issue = validateToken("cat ~/ai-control-center/.agent-pairing-token");
    expect(issue?.level).toBe("error");
    expect(issue?.message).toMatch(/space|command/i);
  });

  it("rejects paths and tildes", () => {
    expect(validateToken("~/token")?.level).toBe("error");
    expect(validateToken("/etc/token")?.level).toBe("error");
  });

  // Regression: selection in a terminal dropped the final character.
  it("warns when the length is off by one", () => {
    const issue = validateToken("a".repeat(42));
    expect(issue?.level).toBe("warning");
    expect(issue?.message).toMatch(/43 characters; this is 42/);
  });

  it("rejects characters a generated token never contains", () => {
    expect(validateToken("abc$%^&*".padEnd(43, "a"))?.level).toBe("error");
  });
});

describe("validateAddress", () => {
  it("accepts host:port and full URLs", () => {
    expect(validateAddress("192.168.0.165:47600")).toBeNull();
    expect(validateAddress("MacBook-Pro-de-Olavo-3.local:47600")).toBeNull();
    expect(validateAddress("https://host:8443")).toBeNull();
  });

  it("requires a value and rejects spaces", () => {
    expect(validateAddress("")?.level).toBe("error");
    expect(validateAddress("my machine:47600")?.level).toBe("error");
  });

  it("warns when the port is missing", () => {
    const issue = validateAddress("my-machine.local");
    expect(issue?.level).toBe("warning");
    expect(issue?.message).toMatch(/47600/);
  });

  it("rejects an invalid port", () => {
    expect(validateAddress("host:99999")?.level).toBe("error");
    expect(validateAddress("host:abc")?.level).toBe("error");
  });
});
