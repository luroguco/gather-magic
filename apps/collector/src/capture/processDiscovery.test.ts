import { describe, expect, it } from "vitest";

import {
  defaultProcessPatterns,
  shouldIgnoreProcessMatch
} from "./processDiscovery.js";

describe("collector process discovery", () => {
  it("keeps MTGA-specific default patterns", () => {
    expect(defaultProcessPatterns).toContain("MTGA");
    expect(defaultProcessPatterns).toContain("Magic The Gathering Arena");
  });

  it("does not mistake the signed reader host for MTG Arena", () => {
    expect(
      shouldIgnoreProcessMatch({
        pid: 42,
        label: "/workspace/apps/collector/out/node-probe/mtga_probe_node",
        sourcePattern: "MTGA"
      })
    ).toBe(true);
  });
});
