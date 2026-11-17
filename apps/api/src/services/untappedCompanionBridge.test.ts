import { describe, expect, it } from "vitest";

import {
  UntappedBridgeError,
  validateUntappedCollectionMap
} from "./untappedCompanionBridge.js";

describe("validateUntappedCollectionMap", () => {
  it("accepts a numeric Arena collection and removes zero quantities", () => {
    expect(
      validateUntappedCollectionMap({
        1001: 2,
        1002: 0,
        1003: 4
      })
    ).toEqual({
      1001: 2,
      1003: 4
    });
  });

  it.each([
    null,
    {},
    [],
    { card: 1 },
    { 1001: -1 },
    { 1001: 1.5 },
    { 1001: "2" }
  ])("rejects malformed or empty collection payloads", (payload) => {
    expect(() => validateUntappedCollectionMap(payload)).toThrow(
      UntappedBridgeError
    );
  });
});
