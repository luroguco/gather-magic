import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { parseCollectorSnapshotV1 } from "@mtga/contracts";
import { dataDirectory, workspaceRoot } from "../lib/paths.js";

export type CollectorCaptureHelperOptions = {
  snapshotPath?: string;
  scryAddonPath?: string;
  distScriptPath?: string;
  sourceScriptPath?: string;
  processStatusDistPath?: string;
  processStatusSourcePath?: string;
  tsxBinPath?: string;
  nodePath?: string;
  processStatusRunner?: () => number | null;
  captureRunner?: (snapshotPath: string) => Promise<void> | void;
  captureTimeoutMs?: number;
  codesignAvailable?: boolean;
  mtgaPid?: number | null;
};

export type CollectorCaptureFileInfo = {
  id: string;
  path: string;
  filename: string;
  size: number;
  modifiedAt: string;
};

export type CollectorCaptureStatus = {
  available: boolean;
  readyToCapture: boolean;
  snapshotPath: string;
  addonPath: string;
  addonAvailable: boolean;
  codesignAvailable: boolean;
  scriptAvailable: boolean;
  mtgaRunning: boolean;
  mtgaPid: number | null;
  latestCapture: CollectorCaptureFileInfo | null;
  lastFailure: {
    code: CollectorCaptureErrorCode;
    message: string;
    occurredAt: string;
  } | null;
};

export type CollectorCaptureErrorCode =
  | "CAPTURE_ALREADY_RUNNING"
  | "CAPTURE_CHANGED"
  | "CAPTURE_NOT_FOUND"
  | "CAPTURE_NOT_FRESH"
  | "CAPTURE_PROCESS_MISMATCH"
  | "CAPTURE_TIMED_OUT"
  | "COLLECTOR_ADDON_MISSING"
  | "COLLECTOR_CODESIGN_MISSING"
  | "COLLECTOR_RUNTIME_MISSING"
  | "MTGA_NOT_RUNNING"
  | "MTGA_CAPTURE_FAILED";

export class CollectorCaptureError extends Error {
  readonly statusCode: number;
  readonly code: CollectorCaptureErrorCode;

  constructor(code: CollectorCaptureErrorCode, message: string, statusCode = 409) {
    super(message);
    this.name = "CollectorCaptureError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const activeCapturePaths = new Set<string>();
const lastCaptureFailures = new Map<
  string,
  NonNullable<CollectorCaptureStatus["lastFailure"]>
>();
const MAX_CAPTURE_OUTPUT_LENGTH = 64 * 1024;
const DEFAULT_CAPTURE_TIMEOUT_MS = 30_000;

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
    id: createHash("sha256").update(readFileSync(filePath)).digest("hex"),
    path: filePath,
    filename: basename(filePath),
    size: stats.size,
    modifiedAt: stats.mtime.toISOString()
  };
};

export const resolveCollectorCapturePaths = (options?: CollectorCaptureHelperOptions) => ({
  snapshotPath: options?.snapshotPath ?? resolve(dataDirectory, "collector/latest-collector-snapshot.json"),
  addonPath: options?.scryAddonPath ?? defaultScryAddonPath,
  distScriptPath:
    options?.distScriptPath ??
    resolve(workspaceRoot, "apps/collector/dist/capture/collectMtgaCollectionSnapshot.js"),
  sourceScriptPath:
    options?.sourceScriptPath ??
    resolve(workspaceRoot, "apps/collector/src/capture/collectMtgaCollectionSnapshot.ts"),
  processStatusDistPath:
    options?.processStatusDistPath ??
    resolve(workspaceRoot, "apps/collector/dist/capture/processStatus.js"),
  processStatusSourcePath:
    options?.processStatusSourcePath ??
    resolve(workspaceRoot, "apps/collector/src/capture/processStatus.ts"),
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

  if (options?.processStatusRunner) {
    return options.processStatusRunner();
  }

  const paths = resolveCollectorCapturePaths(options);
  const execution = existsSync(paths.processStatusDistPath)
    ? {
        command: paths.nodePath,
        args: [paths.processStatusDistPath]
      }
    : existsSync(paths.processStatusSourcePath) && existsSync(paths.tsxBinPath)
      ? {
          command: paths.tsxBinPath,
          args: [paths.processStatusSourcePath]
        }
      : null;
  if (!execution) {
    return null;
  }

  const result = spawnSync(execution.command, execution.args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (result.error || result.status !== 0) {
    return null;
  }

  try {
    const payload = JSON.parse(result.stdout) as { selectedPid?: unknown };
    return typeof payload.selectedPid === "number" && payload.selectedPid > 0
      ? payload.selectedPid
      : null;
  } catch {
    return null;
  }
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

const runCommand = async (command: string, args: string[], timeoutMs: number) =>
  new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const appendBounded = (current: string, chunk: unknown) =>
      `${current}${String(chunk)}`.slice(-MAX_CAPTURE_OUTPUT_LENGTH);
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendBounded(stderr, chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(
          new CollectorCaptureError(
            "CAPTURE_TIMED_OUT",
            "Reading the Arena collection took too long. Keep Arena open and try again.",
            504
          )
        );
        return;
      }
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
    return "The local reader could not attach to MTG Arena. Restart Arena and try again; if it still fails, use Arena CSV or Untapped under Other import methods.";
  }

  if (trimmed.includes("untapped-scry.node") || trimmed.includes(status.addonPath)) {
    return `Untapped Companion is required for live capture. Expected addon at ${status.addonPath}.`;
  }

  if (trimmed.includes("codesign failed") || trimmed.includes("codesign:")) {
    return "codesign failed while preparing the local collector host. Make sure Command Line Tools are installed and try again.";
  }

  return "The local reader could not attach to MTG Arena. Restart Arena and try again; if it still fails, use Arena CSV or Untapped under Other import methods.";
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
    readyToCapture:
      addonAvailable &&
      codesignAvailable &&
      Boolean(execution) &&
      typeof mtgaPid === "number" &&
      mtgaPid > 0,
    snapshotPath: paths.snapshotPath,
    addonPath: paths.addonPath,
    addonAvailable,
    codesignAvailable,
    scriptAvailable: Boolean(execution),
    mtgaRunning: typeof mtgaPid === "number" && mtgaPid > 0,
    mtgaPid: typeof mtgaPid === "number" && mtgaPid > 0 ? mtgaPid : null,
    latestCapture,
    lastFailure: lastCaptureFailures.get(paths.snapshotPath) ?? null
  };
};

export const readLatestCollectorSnapshot = (options?: CollectorCaptureHelperOptions) => {
  const status = getCollectorCaptureStatus(options);
  if (!status.latestCapture) {
    throw new CollectorCaptureError(
      "CAPTURE_NOT_FOUND",
      "No saved Arena capture is available. Read the collection from Arena first.",
      404
    );
  }
  return {
    capture: status.latestCapture,
    content: readFileSync(status.latestCapture.path, "utf8")
  };
};

export const readExpectedCollectorSnapshot = (
  expectedCaptureId: string,
  options?: CollectorCaptureHelperOptions
) => {
  const latest = readLatestCollectorSnapshot(options);
  if (latest.capture.id !== expectedCaptureId) {
    throw new CollectorCaptureError(
      "CAPTURE_CHANGED",
      "The saved Arena capture changed after you reviewed it. Read the collection again and review the new changes.",
      409
    );
  }

  return latest;
};

export const captureCollectorSnapshot = async (options?: CollectorCaptureHelperOptions) => {
  const status = getCollectorCaptureStatus(options);
  if (activeCapturePaths.has(status.snapshotPath)) {
    throw new CollectorCaptureError(
      "CAPTURE_ALREADY_RUNNING",
      "Arena collection capture is already running. Wait for it to finish before trying again."
    );
  }

  if (!status.mtgaRunning) {
    throw new CollectorCaptureError(
      "MTGA_NOT_RUNNING",
      "MTG Arena is not running. Open Arena and try again."
    );
  }

  if (!status.addonAvailable) {
    throw new CollectorCaptureError(
      "COLLECTOR_ADDON_MISSING",
      "The local Arena reader is missing. Install or update Untapped Companion, then check again."
    );
  }

  if (!status.codesignAvailable) {
    throw new CollectorCaptureError(
      "COLLECTOR_CODESIGN_MISSING",
      "The macOS signing tool is unavailable. Install Xcode Command Line Tools and try again."
    );
  }

  const execution = resolveCollectorExecution(options);
  if (!execution) {
    throw new CollectorCaptureError(
      "COLLECTOR_RUNTIME_MISSING",
      "The local Arena reader is not built. Rebuild the app and try again."
    );
  }

  mkdirSync(dirname(status.snapshotPath), { recursive: true });
  const captureStartedAt = Date.now();
  const previousCaptureId = status.latestCapture?.id ?? null;
  activeCapturePaths.add(status.snapshotPath);

  try {
    if (options?.captureRunner) {
      await options.captureRunner(status.snapshotPath);
    } else {
      const pidArgs = status.mtgaPid ? ["--pid", String(status.mtgaPid)] : [];
      const result = await runCommand(
        execution.command,
        [
          ...execution.args,
          ...pidArgs,
          "--scry-addon",
          status.addonPath,
          "--out",
          status.snapshotPath
        ],
        options?.captureTimeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS
      );
      if (result.code !== 0) {
        throw new CollectorCaptureError(
          "MTGA_CAPTURE_FAILED",
          buildCollectorFailureMessage(`${result.stderr}\n${result.stdout}`, status),
          422
        );
      }
    }

    const capture = resolveCollectorFileInfo(status.snapshotPath);
    if (!capture || capture.id === previousCaptureId) {
      throw new CollectorCaptureError(
        "CAPTURE_NOT_FRESH",
        "Arena capture finished without producing a fresh collection. Keep Arena open and try again.",
        422
      );
    }

    const content = readFileSync(capture.path, "utf8");
    const snapshot = parseCollectorSnapshotV1(JSON.parse(content) as unknown);
    const capturedAt = Date.parse(snapshot.capturedAt);
    if (capturedAt < captureStartedAt - 5_000) {
      throw new CollectorCaptureError(
        "CAPTURE_NOT_FRESH",
        "The collector returned an older Arena snapshot. Read the collection again before importing.",
        422
      );
    }
    if (status.mtgaPid && snapshot.mtgaPid !== status.mtgaPid) {
      throw new CollectorCaptureError(
        "CAPTURE_PROCESS_MISMATCH",
        "Arena restarted while the collection was being read. Check Arena again and retry.",
        409
      );
    }

    lastCaptureFailures.delete(status.snapshotPath);
    return {
      capture,
      content
    };
  } catch (error) {
    if (error instanceof CollectorCaptureError) {
      lastCaptureFailures.set(status.snapshotPath, {
        code: error.code,
        message: error.message,
        occurredAt: new Date().toISOString()
      });
    }
    throw error;
  } finally {
    activeCapturePaths.delete(status.snapshotPath);
  }
};
