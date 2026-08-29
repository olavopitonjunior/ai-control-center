import { describe, expect, it } from "vitest";
import { mapStatus, resultText } from "./tasks";

describe("Task Scheduler status mapping", () => {
  it("treats SCHED_S_* informational codes as non-errors", () => {
    expect(mapStatus("Ready", true, 0)).toBe("SCHEDULED");
    expect(mapStatus("Ready", true, 267011)).toBe("SCHEDULED"); // has-not-run
    expect(mapStatus("Ready", true, 267008)).toBe("SCHEDULED");
  });

  it("flags genuine failure HRESULTs as ERROR", () => {
    expect(mapStatus("Ready", true, 0x800710e0)).toBe("ERROR"); // 0x800710E0
  });

  it("maps running and disabled states", () => {
    expect(mapStatus("Running", true, 267009)).toBe("RUNNING");
    expect(mapStatus("Disabled", false, 0)).toBe("DISABLED");
    expect(mapStatus("Ready", false, 0)).toBe("DISABLED");
  });

  it("renders result codes into readable text", () => {
    expect(resultText(0)).toBe("success");
    expect(resultText(267011)).toBe("not yet run");
    expect(resultText(0x800710e0)).toBe("0x800710E0");
    expect(resultText(null)).toBeNull();
  });
});
