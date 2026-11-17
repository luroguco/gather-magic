import { describe, expect, it } from "vitest";

import { resolveDirectCaptureEnabled } from "../lib/directCaptureConfig.js";

describe("direct capture configuration", () => {
  it("enables direct capture by default only for loopback servers", () => {
    expect(resolveDirectCaptureEnabled("127.0.0.1", undefined)).toBe(true);
    expect(resolveDirectCaptureEnabled("localhost", undefined)).toBe(true);
    expect(resolveDirectCaptureEnabled("::1", undefined)).toBe(true);
    expect(resolveDirectCaptureEnabled("0.0.0.0", undefined)).toBe(false);
  });

  it("supports explicit enable and disable overrides", () => {
    expect(resolveDirectCaptureEnabled("127.0.0.1", "0")).toBe(false);
    expect(resolveDirectCaptureEnabled("0.0.0.0", "1")).toBe(true);
  });
});
