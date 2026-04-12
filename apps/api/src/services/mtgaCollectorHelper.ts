import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { dataDirectory, packageRoot, workspaceRoot } from "../lib/paths.js";
import { defaultProcessPatterns, findMtgaProcess } from "../scripts/probeMtgaRuntime.js";

export type CollectorCaptureHelperOptions = {
  snapshotPath?: string;
  scryAddonPath?: string;
  distScriptPath?: string;
  sourceScriptPath?: string;
  tsxBinPath?: string;
  nodePath?: string;
  processPatterns?: string[];
  captureRunner?: (snapshotPath: string) => Promise<void> | void;
  codesignAvailable?: boolean;
  mtgaPid?: number | null;
};

export type CollectorCaptureFileInfo = {
  path: string;
  filename: string;
  size: number;
  modifiedAt: string;
};

export type CollectorCaptureStatus = {
  available: boolean;
  snapshotPath: string;
  addonPath: string;
  addonAvailable: boolean;
  codesignAvailable: boolean;
  scriptAvailable: boolean;
  mtgaRunning: boolean;
  mtgaPid: number | null;
  latestCapture: CollectorCaptureFileInfo | null;
};

const defaultScryAddonPath =
  "/Applications/Untapped.gg Companion.app/Contents/Resources/app.asar.unpacked/node_modules/untapped-scry/lib/binding/napi-v5/untapped-scry.node";

const resolveCollectorFileInfo = (filePath: string): CollectorCaptureFileInfo | null => {
  if (!existsSync(filePath)) {
    return null;
  }

  const stats = statSync(filePath);
  if (!stats.isFile()) {
    return null;
  }

  return {
    path: filePath,
    filename: basename(filePath),
    size: stats.size,
    modifiedAt: stats.mtime.toISOString()
  };
};

export const resolveCollectorCapturePaths = (options?: CollectorCaptureHelperOptions) => ({
  snapshotPath: options?.snapshotPath ?? resolve(dataDirectory, "collector/latest-collector-snapshot.json"),
  addonPath: options?.scryAddonPath ?? defaultScryAddonPath,
  distScriptPath: options?.distScriptPath ?? resolve(packageRoot, "dist/scripts/collectMtgaCollectionSnapshot.js"),
  sourceScriptPath: options?.sourceScriptPath ?? resolve(packageRoot, "src/scripts/collectMtgaCollectionSnapshot.ts"),
  tsxBinPath: options?.tsxBinPath ?? resolve(workspaceRoot, "node_modules/.bin/tsx"),
  nodePath: options?.nodePath ?? process.execPath
});

const resolveMtgaPid = (options?: CollectorCaptureHelperOptions) => {
  if (typeof options?.mtgaPid === "number") {
    return options.mtgaPid;
  }

  if (options?.mtgaPid === null) {
    return null;
  }

  return findMtgaProcess(options?.processPatterns ?? defaultProcessPatterns).selectedPid;
};

const checkCodesignAvailable = (options?: CollectorCaptureHelperOptions) => {
  if (typeof options?.codesignAvailable === "boolean") {
    return options.codesignAvailable;
  }

  const result = spawnSync("which", ["codesign"], {
    encoding: "utf8",
    stdio: "ignore"
  });

  return !result.error && result.status === 0;
};

const resolveCollectorExecution = (
  options?: CollectorCaptureHelperOptions
):
  | {
      command: string;
      args: string[];
    }
  | null => {
  if (options?.captureRunner) {
    return {
      command: "<custom-runner>",
      args: []
    };
  }

  const paths = resolveCollectorCapturePaths(options);
  if (existsSync(paths.distScriptPath)) {
    return {
      command: paths.nodePath,
      args: [paths.distScriptPath]
    };
  }

  if (existsSync(paths.sourceScriptPath) && existsSync(paths.tsxBinPath)) {
    return {
      command: paths.tsxBinPath,
      args: [paths.sourceScriptPath]
    };
  }

  return null;
};

const runCommand = async (command: string, args: string[]) =>
  new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr
      });
    });
  });

const buildCollectorFailureMessage = (
  output: string,
  status: CollectorCaptureStatus
) => {
  const trimmed = output.trim();

  if (!status.mtgaRunning) {
    return "MTGA is not running. Open MTG Arena and try again.";
  }

  if (!status.addonAvailable) {
    return `Untapped Companion is required for live capture. Expected addon at ${status.addonPath}.`;
  }

  if (!status.codesignAvailable) {
    return "codesign is not available. Install Xcode Command Line Tools and try again.";
  }

  if (trimmed.includes("Could not find an MTGA process")) {
    return "MTGA is not running. Open MTG Arena and try again.";
  }

  if (trimmed.includes("Failed to connect to process")) {
    return "Could not attach to the live MTGA process. Restart MTGA and try again.";
  }

  if (trimmed.includes("untapped-scry.node") || trimmed.includes(status.addonPath)) {
    return `Untapped Companion is required for live capture. Expected addon at ${status.addonPath}.`;
  }

  if (trimmed.includes("codesign failed") || trimmed.includes("codesign:")) {
    return "codesign failed while preparing the local collector host. Make sure Command Line Tools are installed and try again.";
  }

  return trimmed || "Local MTGA capture failed.";
};

export const getCollectorCaptureStatus = (
  options?: CollectorCaptureHelperOptions
): CollectorCaptureStatus => {
  const paths = resolveCollectorCapturePaths(options);
  const latestCapture = resolveCollectorFileInfo(paths.snapshotPath);
  const addonAvailable = existsSync(paths.addonPath);
  const codesignAvailable = checkCodesignAvailable(options);
  const execution = resolveCollectorExecution(options);
  const mtgaPid = resolveMtgaPid(options);

  return {
    available: addonAvailable && codesignAvailable && Boolean(execution),
    snapshotPath: paths.snapshotPath,
    addonPath: paths.addonPath,
    addonAvailable,
    codesignAvailable,
    scriptAvailable: Boolean(execution),
    mtgaRunning: typeof mtgaPid === "number" && mtgaPid > 0,
    mtgaPid: typeof mtgaPid === "number" && mtgaPid > 0 ? mtgaPid : null,
    latestCapture
  };
};

export const readLatestCollectorSnapshot = (options?: CollectorCaptureHelperOptions) => {
  const status = getCollectorCaptureStatus(options);
  if (!status.latestCapture) {
    throw new Error(`No collector snapshot file was found at ${status.snapshotPath}`);
  }

  return {
    capture: status.latestCapture,
    content: readFileSync(status.latestCapture.path, "utf8")
  };
};

export const captureCollectorSnapshot = async (options?: CollectorCaptureHelperOptions) => {
  const status = getCollectorCaptureStatus(options);

  if (!status.mtgaRunning) {
    throw new Error("MTGA is not running. Open MTG Arena and try again.");
  }

  if (!status.addonAvailable) {
    throw new Error(`Untapped Companion is required for live capture. Expected addon at ${status.addonPath}.`);
  }

  if (!status.codesignAvailable) {
    throw new Error("codesign is not available. Install Xcode Command Line Tools and try again.");
  }

  const execution = resolveCollectorExecution(options);
  if (!execution) {
    throw new Error("The local collector runtime script is not available.");
  }

  mkdirSync(dirname(status.snapshotPath), { recursive: true });

  if (options?.captureRunner) {
    await options.captureRunner(status.snapshotPath);
  } else {
    const result = await runCommand(execution.command, [...execution.args, "--out", status.snapshotPath]);
    if (result.code !== 0) {
      throw new Error(buildCollectorFailureMessage(`${result.stderr}\n${result.stdout}`, status));
    }
  }

  const capture = resolveCollectorFileInfo(status.snapshotPath);
  if (!capture) {
    throw new Error("The local collector finished without producing a snapshot file.");
  }

  return {
    capture,
    content: readFileSync(capture.path, "utf8")
  };
};
