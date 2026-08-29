import { describe, expect, it } from "vitest";
import { classifyInterface, preferredConnectionType } from "./netiface";

describe("classifyInterface", () => {
  it("detects USB4 / Thunderbolt", () => {
    expect(classifyInterface("USB4 Adapter")).toBe("usb4");
    expect(classifyInterface("Thunderbolt Bridge")).toBe("usb4");
  });
  it("detects Wi-Fi", () => {
    expect(classifyInterface("Wi-Fi")).toBe("wifi");
    expect(classifyInterface("wlan0")).toBe("wifi");
    expect(classifyInterface("en0")).toBe("wifi"); // typical macOS Wi-Fi
  });
  it("detects Ethernet", () => {
    expect(classifyInterface("Ethernet")).toBe("ethernet");
    expect(classifyInterface("eth0")).toBe("ethernet");
    expect(classifyInterface("Realtek Gigabit Ethernet")).toBe("ethernet");
  });
  it("falls back to unknown", () => {
    expect(classifyInterface("Loopback Pseudo-Interface 1")).toBe("unknown");
    expect(classifyInterface("Topaz Loopback")).toBe("unknown");
  });
});

describe("preferredConnectionType", () => {
  it("prefers USB4 > Ethernet > Wi-Fi", () => {
    expect(preferredConnectionType(["wifi", "ethernet", "usb4"])).toBe("usb4");
    expect(preferredConnectionType(["wifi", "ethernet"])).toBe("ethernet");
    expect(preferredConnectionType(["wifi"])).toBe("wifi");
    expect(preferredConnectionType(["unknown"])).toBe("unknown");
    expect(preferredConnectionType([])).toBe("unknown");
  });
});
