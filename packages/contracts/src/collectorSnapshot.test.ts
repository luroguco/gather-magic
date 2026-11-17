import { describe, expect, it } from "vitest";

import { collectorSnapshotV1Schema } from "./collectorSnapshot.js";

const validSnapshot = {
  snapshotVersion: 1,
  status: "complete",
  capturedAt: "2026-07-23T12:00:00.000Z",
  platform: "darwin",
  collectorVersion: "test-reader/1.0.0",
  mtgaPid: 1234,
  entryCount: 2,
  totalQuantity: 5,
  collection: {
    "1001": 2,
    "1002": 3
  },
  diagnostics: {
    source: "test",
    warnings: []
  }
} as const;

describe("collector snapshot v1", () => {
  it("accepts a complete internally consistent snapshot", () => {
    expect(collectorSnapshotV1Schema.parse(validSnapshot)).toEqual(validSnapshot);
  });

  it("rejects unsupported versions", () => {
    expect(() =>
      collectorSnapshotV1Schema.parse({
        ...validSnapshot,
        snapshotVersion: 2
      })
    ).toThrow();
  });

  it("rejects incomplete or internally inconsistent snapshots", () => {
    expect(() =>
      collectorSnapshotV1Schema.parse({
        ...validSnapshot,
        status: "partial"
      })
    ).toThrow();

    expect(() =>
      collectorSnapshotV1Schema.parse({
        ...validSnapshot,
        totalQuantity: 4
      })
    ).toThrow();
  });

  it("rejects capture timestamps far in the future", () => {
    expect(() =>
      collectorSnapshotV1Schema.parse({
        ...validSnapshot,
        capturedAt: "2999-01-01T00:00:00.000Z"
      })
    ).toThrow("capturedAt");
  });
});
