import { describe, expect, it } from "vitest";

import { parseProbeRequest } from "./ipcValidation.js";

describe("collector IPC validation", () => {
  it("accepts only an optional positive PID", () => {
    expect(parseProbeRequest({})).toEqual({});
    expect(parseProbeRequest({ pid: 1234 })).toEqual({ pid: 1234 });
  });

  it("rejects path and runtime overrides", () => {
    expect(() =>
      parseProbeRequest({
        pid: 1234,
        scryAddonPath: "/tmp/untrusted.node"
      })
    ).toThrow("unsupported fields");
  });

  it("rejects invalid PIDs", () => {
    expect(() => parseProbeRequest({ pid: -1 })).toThrow("positive integer");
    expect(() => parseProbeRequest({ pid: "1234" })).toThrow("positive integer");
  });
});
