import {
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, resolve } from "node:path";

import { dataDirectory, workspaceRoot } from "../lib/paths.js";

type UntappedConfig = Record<string, unknown> & {
  showDevTools?: boolean;
};

export type UntappedCaptureHelperOptions = {
  configPath?: string;
  downloadsPath?: string;
  capturePath?: string;
};

export type UntappedCaptureFileInfo = {
  id: string;
  path: string;
  filename: string;
  size: number;
  modifiedAt: string;
  source: "automated" | "download";
};

export type UntappedCaptureStatus = {
  available: boolean;
  configPath: string;
  downloadsPath: string;
  showDevTools: boolean | null;
  latestCapture: UntappedCaptureFileInfo | null;
};

type UntappedCaptureSnapshot = {
  capture: UntappedCaptureFileInfo;
  content: Buffer;
};

export const UNTAPPED_CAPTURE_SNIPPET = `(async () => {
  const collection = await window.electron.ipcRenderer.invoke("mtga.collection.invoke");
  const total = Object.values(collection ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
  console.log("mtga.collection entries:", Object.keys(collection ?? {}).length);
  console.log("mtga.collection total quantity:", total);
  const blob = new Blob([JSON.stringify(collection, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "untapped-mtga-collection.json";
  a.click();
  URL.revokeObjectURL(url);
})();`;

const captureFilePattern = /^untapped-mtga-collection(?:[._ -].*)?\.json$/i;

const resolveHomeDirectory = () => resolve(process.env.HOME ?? workspaceRoot);

export const resolveUntappedCapturePaths = (options?: UntappedCaptureHelperOptions) => {
  const homeDirectory = resolveHomeDirectory();

  return {
    configPath:
      options?.configPath ??
      resolve(homeDirectory, "Library/Application Support/untapped-companion/config.json"),
    downloadsPath: options?.downloadsPath ?? resolve(homeDirectory, "Downloads"),
    capturePath:
      options?.capturePath ??
      resolve(dataDirectory, "untapped/latest-companion-collection.json")
  };
};

const readUntappedConfig = (configPath: string): UntappedConfig | null => {
  if (!existsSync(configPath)) {
    return null;
  }

  return JSON.parse(readFileSync(configPath, "utf8")) as UntappedConfig;
};

const readCaptureSnapshot = (
  filePath: string,
  source: UntappedCaptureFileInfo["source"]
): UntappedCaptureSnapshot | null => {
  if (!existsSync(filePath)) {
    return null;
  }

  let fileDescriptor: number;
  try {
    fileDescriptor = openSync(filePath, "r");
  } catch {
    return null;
  }

  try {
    const stats = fstatSync(fileDescriptor);
    if (!stats.isFile()) {
      return null;
    }

    const content = readFileSync(fileDescriptor);
    return {
      capture: {
        id: createHash("sha256").update(content).digest("hex"),
        path: filePath,
        filename: basename(filePath),
        size: content.byteLength,
        modifiedAt: stats.mtime.toISOString(),
        source
      },
      content
    };
  } finally {
    closeSync(fileDescriptor);
  }
};

const findLatestUntappedCaptureSnapshot = (
  downloadsPath: string
): UntappedCaptureSnapshot | null => {
  if (!existsSync(downloadsPath)) {
    return null;
  }

  const matches: UntappedCaptureSnapshot[] = [];

  for (const entry of readdirSync(downloadsPath, { withFileTypes: true })) {
    if (!entry.isFile() || !captureFilePattern.test(entry.name)) {
      continue;
    }

    const filePath = resolve(downloadsPath, entry.name);
    const snapshot = readCaptureSnapshot(filePath, "download");
    if (snapshot) {
      matches.push(snapshot);
    }
  }

  matches.sort(
    (left, right) =>
      right.capture.modifiedAt.localeCompare(left.capture.modifiedAt) ||
      left.capture.filename.localeCompare(right.capture.filename)
  );
  return matches[0] ?? null;
};

export const findLatestUntappedCapture = (
  downloadsPath: string
): UntappedCaptureFileInfo | null =>
  findLatestUntappedCaptureSnapshot(downloadsPath)?.capture ?? null;

const findLatestCaptureSnapshot = (
  options?: UntappedCaptureHelperOptions
): UntappedCaptureSnapshot | null => {
  const { downloadsPath, capturePath } = resolveUntappedCapturePaths(options);
  const captures = [
    readCaptureSnapshot(capturePath, "automated"),
    findLatestUntappedCaptureSnapshot(downloadsPath)
  ].filter((capture): capture is UntappedCaptureSnapshot => Boolean(capture));
  captures.sort(
    (left, right) =>
      right.capture.modifiedAt.localeCompare(left.capture.modifiedAt) ||
      left.capture.filename.localeCompare(right.capture.filename)
  );
  return captures[0] ?? null;
};

export const getUntappedCaptureStatus = (
  options?: UntappedCaptureHelperOptions
): UntappedCaptureStatus => {
  const { configPath, downloadsPath } = resolveUntappedCapturePaths(options);
  const config = readUntappedConfig(configPath);
  const latestCapture = findLatestCaptureSnapshot(options)?.capture ?? null;

  return {
    available: existsSync(configPath) && existsSync(downloadsPath),
    configPath,
    downloadsPath,
    showDevTools: typeof config?.showDevTools === "boolean" ? config.showDevTools : null,
    latestCapture
  };
};

const writeFileAtomically = (filePath: string, content: string | Buffer, mode: number) => {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const fileDescriptor = openSync(temporaryPath, "w", mode);
  try {
    writeFileSync(fileDescriptor, content);
    fsyncSync(fileDescriptor);
  } finally {
    closeSync(fileDescriptor);
  }

  try {
    renameSync(temporaryPath, filePath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
};

export const setUntappedDevToolsEnabled = (
  enabled: boolean,
  options?: UntappedCaptureHelperOptions
) => {
  const { configPath } = resolveUntappedCapturePaths(options);
  const config = readUntappedConfig(configPath);

  if (!config) {
    throw new Error(`Untapped config not found at ${configPath}`);
  }

  const changed = config.showDevTools !== enabled;

  if (changed) {
    const backupPath = `${configPath}.bak`;
    const originalContent = readFileSync(configPath);
    const fileMode = statSync(configPath).mode & 0o777;
    if (!existsSync(backupPath)) {
      writeFileAtomically(backupPath, originalContent, fileMode);
    }

    config.showDevTools = enabled;
    writeFileAtomically(configPath, `${JSON.stringify(config, null, 2)}\n`, fileMode);
  }

  return {
    changed,
    status: getUntappedCaptureStatus(options)
  };
};

export const readLatestUntappedCapture = (options?: UntappedCaptureHelperOptions) => {
  const latest = findLatestCaptureSnapshot(options);

  if (!latest) {
    throw new Error("No Untapped capture is available. Sync from Arena first.");
  }

  return {
    capture: latest.capture,
    content: latest.content.toString("utf8")
  };
};

export const readExpectedUntappedCapture = (
  expectedCaptureId: string,
  options?: UntappedCaptureHelperOptions
) => {
  const latest = readLatestUntappedCapture(options);
  if (latest.capture.id !== expectedCaptureId) {
    const error = new Error(
      "The Companion capture changed after you reviewed it. Sync again and review the new changes."
    ) as Error & { code: string; statusCode: number };
    error.code = "CAPTURE_CHANGED";
    error.statusCode = 409;
    throw error;
  }
  return latest;
};

export const writeAutomatedUntappedCapture = (
  collection: Record<string, number>,
  options?: UntappedCaptureHelperOptions
) => {
  const { capturePath } = resolveUntappedCapturePaths(options);
  writeFileAtomically(capturePath, `${JSON.stringify(collection, null, 2)}\n`, 0o600);
  const snapshot = readCaptureSnapshot(capturePath, "automated");
  if (!snapshot) {
    throw new Error("Companion capture completed without producing a readable file.");
  }
  return {
    capture: snapshot.capture,
    content: snapshot.content.toString("utf8")
  };
};
