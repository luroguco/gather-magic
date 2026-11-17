import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  readExpectedUntappedCapture,
  readLatestUntappedCapture,
  type UntappedCaptureHelperOptions
} from "./untappedCaptureHelper.js";

const createFixture = () => {
  const root = mkdtempSync(resolve(tmpdir(), "untapped-capture-helper-"));
  const downloadsPath = resolve(root, "Downloads");
  const capturePath = resolve(root, "latest-companion-collection.json");
  mkdirSync(downloadsPath);
  const options: UntappedCaptureHelperOptions = {
    configPath: resolve(root, "config.json"),
    downloadsPath,
    capturePath
  };
  return { root, capturePath, options };
};

const sha256 = (content: string) =>
  createHash("sha256").update(content).digest("hex");

describe("Untapped capture identity", () => {
  it("derives the returned capture id from the exact returned bytes", () => {
    const fixture = createFixture();
    try {
      writeFileSync(fixture.capturePath, '{"1001":2}\n');

      const result = readLatestUntappedCapture(fixture.options);

      expect(result.capture.id).toBe(sha256(result.content));
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects a capture replaced after preview instead of relabeling its bytes", () => {
    const fixture = createFixture();
    try {
      writeFileSync(fixture.capturePath, '{"1001":2}\n');
      const previewed = readLatestUntappedCapture(fixture.options);
      writeFileSync(fixture.capturePath, '{"1001":4}\n');

      expect(() =>
        readExpectedUntappedCapture(previewed.capture.id, fixture.options)
      ).toThrow(/capture changed/i);

      const current = readLatestUntappedCapture(fixture.options);
      expect(current.capture.id).toBe(sha256(current.content));
      expect(current.capture.id).not.toBe(previewed.capture.id);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
