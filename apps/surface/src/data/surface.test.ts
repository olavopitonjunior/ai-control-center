import { describe, expect, it } from "vitest";
import { baseUrl } from "./protocolClient";
import { deriveConnection } from "./connection";

describe("baseUrl", () => {
  it("prefixes http:// for bare host:port and trims trailing slashes", () => {
    expect(baseUrl("192.168.0.228:47600")).toBe("http://192.168.0.228:47600");
    expect(baseUrl("http://127.0.0.1:47600/")).toBe("http://127.0.0.1:47600");
    expect(baseUrl("https://host:8443")).toBe("https://host:8443");
  });
});

describe("deriveConnection", () => {
  const base = { offlineAfterMs: 15000, previous: "PAIRING" as const };

  it("is ONLINE on success, DEGRADED when the agent says so", () => {
    expect(
      deriveConnection({
        ...base,
        success: true,
        everSucceeded: true,
        msSinceLastSuccess: 0,
        snapshotStatus: "ONLINE",
      }),
    ).toBe("ONLINE");
    expect(
      deriveConnection({
        ...base,
        success: true,
        everSucceeded: true,
        msSinceLastSuccess: 0,
        snapshotStatus: "DEGRADED",
      }),
    ).toBe("DEGRADED");
  });

  it("goes OFFLINE if never succeeded or past the timeout", () => {
    expect(
      deriveConnection({
        ...base,
        success: false,
        everSucceeded: false,
        msSinceLastSuccess: Infinity,
      }),
    ).toBe("OFFLINE");
    expect(
      deriveConnection({
        ...base,
        success: false,
        everSucceeded: true,
        msSinceLastSuccess: 20000,
      }),
    ).toBe("OFFLINE");
  });

  it("keeps the previous state during a brief blip", () => {
    expect(
      deriveConnection({
        success: false,
        everSucceeded: true,
        msSinceLastSuccess: 5000,
        offlineAfterMs: 15000,
        previous: "ONLINE",
      }),
    ).toBe("ONLINE");
  });
});
