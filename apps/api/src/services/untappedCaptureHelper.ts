import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, resolve } from "node:path";

import { workspaceRoot } from "../lib/paths.js";

type UntappedConfig = Record<string, unknown> & {
  showDevTools?: boolean;
};

export type UntappedCaptureHelperOptions = {
  configPath?: string;
  downloadsPath?: string;
};

export type UntappedCaptureFileInfo = {
  path: string;
  filename: string;
  size: number;
  modifiedAt: string;
};

export type UntappedCaptureStatus = {
  available: boolean;
  configPath: string;
  downloadsPath: string;
  showDevTools: boolean | null;
  latestCapture: UntappedCaptureFileInfo | null;
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
    downloadsPath: options?.downloadsPath ?? resolve(homeDirectory, "Downloads")
  };
};

const readUntappedConfig = (configPath: string): UntappedConfig | null => {
  if (!existsSync(configPath)) {
    return null;
  }

  return JSON.parse(readFileSync(configPath, "utf8")) as UntappedConfig;
};

export const findLatestUntappedCapture = (downloadsPath: string): UntappedCaptureFileInfo | null => {
  if (!existsSync(downloadsPath)) {
    return null;
  }

  const matches: UntappedCaptureFileInfo[] = [];

  for (const entry of readdirSync(downloadsPath, { withFileTypes: true })) {
    if (!entry.isFile() || !captureFilePattern.test(entry.name)) {
      continue;
    }

    const filePath = resolve(downloadsPath, entry.name);
    const stats = statSync(filePath);
    matches.push({
      path: filePath,
      filename: basename(filePath),
      size: stats.size,
      modifiedAt: stats.mtime.toISOString()
    });
  }

  matches.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
  return matches[0] ?? null;
};

export const getUntappedCaptureStatus = (
  options?: UntappedCaptureHelperOptions
): UntappedCaptureStatus => {
  const { configPath, downloadsPath } = resolveUntappedCapturePaths(options);
  const config = readUntappedConfig(configPath);
  const latestCapture = findLatestUntappedCapture(downloadsPath);

  return {
    available: existsSync(configPath) && existsSync(downloadsPath),
    configPath,
    downloadsPath,
    showDevTools: typeof config?.showDevTools === "boolean" ? config.showDevTools : null,
    latestCapture
  };
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
    if (!existsSync(backupPath)) {
      mkdirSync(dirname(backupPath), { recursive: true });
      writeFileSync(backupPath, JSON.stringify(config, null, 2));
    }

    config.showDevTools = enabled;
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  }

  return {
    changed,
    status: getUntappedCaptureStatus(options)
  };
};

export const readLatestUntappedCapture = (options?: UntappedCaptureHelperOptions) => {
  const { downloadsPath } = resolveUntappedCapturePaths(options);
  const latestCapture = findLatestUntappedCapture(downloadsPath);

  if (!latestCapture) {
    throw new Error(`No Untapped capture file was found in ${downloadsPath}`);
  }

  return {
    capture: latestCapture,
    content: readFileSync(latestCapture.path, "utf8")
  };
};
