import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

import {
  writeAutomatedUntappedCapture,
  type UntappedCaptureHelperOptions
} from "./untappedCaptureHelper.js";

export type UntappedAutomationState =
  | "not-installed"
  | "not-running"
  | "restart-required"
  | "connecting"
  | "ready"
  | "unavailable";

export type UntappedCompanionBridgeStatus = {
  companionInstalled: boolean;
  companionRunning: boolean;
  companionPid: number | null;
  automationState: UntappedAutomationState;
  readyToCapture: boolean;
  restartRequired: boolean;
  message: string;
  devToolsPort?: number;
};

type UntappedProcessInfo = {
  pid: number;
  command: string;
  automationEnabled: boolean;
};

type CdpTarget = {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
};

export type UntappedCompanionBridgeOptions = {
  executablePath?: string;
  userDataPath?: string;
  launchTimeoutMs?: number;
  statusRunner?: () => Promise<UntappedCompanionBridgeStatus>;
  captureRunner?: () => Promise<unknown>;
  restartRunner?: () => Promise<void>;
};

export type UntappedBridgeErrorCode =
  | "UNTAPPED_NOT_INSTALLED"
  | "UNTAPPED_RESTART_REQUIRED"
  | "UNTAPPED_BRIDGE_UNAVAILABLE"
  | "UNTAPPED_COLLECTION_NOT_READY"
  | "UNTAPPED_RESTART_FAILED"
  | "UNTAPPED_CAPTURE_INVALID";

export class UntappedBridgeError extends Error {
  readonly code: UntappedBridgeErrorCode;
  readonly statusCode: number;

  constructor(code: UntappedBridgeErrorCode, message: string, statusCode = 409) {
    super(message);
    this.name = "UntappedBridgeError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const defaultExecutablePath =
  "/Applications/Untapped.gg Companion.app/Contents/MacOS/Untapped.gg Companion";
const defaultUserDataPath = resolve(
  process.env.HOME ?? "",
  "Library/Application Support/untapped-companion"
);
const defaultLaunchTimeoutMs = 12_000;
const cdpRequestTimeoutMs = 4_000;
const collectionRetryCount = 4;
const maximumCollectionEntries = 50_000;
const maximumCollectionBytes = 5 * 1024 * 1024;

const collectionProbeExpression =
  'typeof window.electron?.ipcRenderer?.invoke === "function"';
const collectionCaptureExpression =
  'window.electron.ipcRenderer.invoke("mtga.collection.invoke")';

const delay = (milliseconds: number) =>
  new Promise<void>((resolveDelay) => setTimeout(resolveDelay, milliseconds));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const resolveBridgePaths = (options?: UntappedCompanionBridgeOptions) => {
  const userDataPath = options?.userDataPath ?? defaultUserDataPath;
  return {
    executablePath: options?.executablePath ?? defaultExecutablePath,
    userDataPath,
    activePortPath: resolve(userDataPath, "DevToolsActivePort")
  };
};

const findUntappedProcess = (
  executablePath: string
): UntappedProcessInfo | null => {
  const result = spawnSync("ps", ["-axo", "pid=,command="], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (result.error || result.status !== 0) {
    return null;
  }

  for (const line of result.stdout.split("\n")) {
    const trimmed = line.trim();
    const match = /^(\d+)\s+(.+)$/.exec(trimmed);
    if (!match) {
      continue;
    }
    const pid = Number.parseInt(match[1] ?? "", 10);
    const command = match[2] ?? "";
    if (
      !Number.isInteger(pid) ||
      pid <= 0 ||
      !(command === executablePath || command.startsWith(`${executablePath} `))
    ) {
      continue;
    }
    return {
      pid,
      command,
      automationEnabled: /--remote-debugging-port(?:=|\s)/.test(command)
    };
  }
  return null;
};

const readActivePort = (activePortPath: string): number | null => {
  if (!existsSync(activePortPath)) {
    return null;
  }
  const firstLine = readFileSync(activePortPath, "utf8").split(/\r?\n/, 1)[0];
  const port = Number.parseInt(firstLine ?? "", 10);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : null;
};

const isLoopbackHost = (hostname: string) =>
  hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";

const assertLoopbackWebSocket = (value: string, expectedPort: number) => {
  const url = new URL(value);
  if (
    url.protocol !== "ws:" ||
    !isLoopbackHost(url.hostname) ||
    Number.parseInt(url.port, 10) !== expectedPort
  ) {
    throw new UntappedBridgeError(
      "UNTAPPED_BRIDGE_UNAVAILABLE",
      "Companion exposed an unexpected debugging endpoint.",
      502
    );
  }
};

const fetchCdpTargets = async (port: number): Promise<CdpTarget[]> => {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
    signal: AbortSignal.timeout(1_500)
  });
  if (!response.ok) {
    throw new Error(`Companion target discovery returned ${response.status}.`);
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("Companion target discovery returned an invalid payload.");
  }

  return payload.flatMap((entry): CdpTarget[] => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      typeof entry.type !== "string" ||
      typeof entry.title !== "string" ||
      typeof entry.url !== "string" ||
      typeof entry.webSocketDebuggerUrl !== "string"
    ) {
      return [];
    }
    assertLoopbackWebSocket(entry.webSocketDebuggerUrl, port);
    return [
      {
        id: entry.id,
        type: entry.type,
        title: entry.title,
        url: entry.url,
        webSocketDebuggerUrl: entry.webSocketDebuggerUrl
      }
    ];
  });
};

const decodeWebSocketPayload = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value).toString("utf8");
  }
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("utf8");
  }
  return String(value);
};

const evaluateCdpExpression = (
  target: CdpTarget,
  expression: string
): Promise<unknown> =>
  new Promise((resolveEvaluation, rejectEvaluation) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    const requestId = 1;
    let settled = false;
    const finish = (error?: Error, value?: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      socket.close();
      if (error) {
        rejectEvaluation(error);
      } else {
        resolveEvaluation(value);
      }
    };
    const timeout = setTimeout(() => {
      finish(new Error("Companion did not answer the collection request in time."));
    }, cdpRequestTimeoutMs);

    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          id: requestId,
          method: "Runtime.evaluate",
          params: {
            expression,
            awaitPromise: true,
            returnByValue: true
          }
        })
      );
    });
    socket.addEventListener("message", (event) => {
      let payload: unknown;
      try {
        payload = JSON.parse(decodeWebSocketPayload(event.data)) as unknown;
      } catch {
        return;
      }
      if (!isRecord(payload) || payload.id !== requestId) {
        return;
      }
      if (isRecord(payload.error)) {
        finish(
          new Error(
            typeof payload.error.message === "string"
              ? payload.error.message
              : "Companion rejected the collection request."
          )
        );
        return;
      }
      if (!isRecord(payload.result)) {
        finish(new Error("Companion returned an invalid debugging response."));
        return;
      }
      if (payload.result.exceptionDetails) {
        finish(new Error("Companion could not evaluate its collection bridge."));
        return;
      }
      const remoteResult = payload.result.result;
      if (!isRecord(remoteResult)) {
        finish(new Error("Companion returned an invalid collection result."));
        return;
      }
      finish(undefined, remoteResult.value);
    });
    socket.addEventListener("error", () => {
      finish(new Error("Could not connect to the Companion collection bridge."));
    });
  });

const findCollectionTarget = async (port: number): Promise<CdpTarget> => {
  const targets = await fetchCdpTargets(port);
  const orderedTargets = [...targets].sort((left, right) => {
    const leftPriority = left.url.includes("/dist/renderer/index.html") ? 0 : 1;
    const rightPriority = right.url.includes("/dist/renderer/index.html") ? 0 : 1;
    return leftPriority - rightPriority;
  });

  for (const target of orderedTargets) {
    try {
      const supported = await evaluateCdpExpression(target, collectionProbeExpression);
      if (supported === true) {
        return target;
      }
    } catch {
      // Other Companion targets, including DevTools itself, do not expose the preload bridge.
    }
  }

  throw new UntappedBridgeError(
    "UNTAPPED_BRIDGE_UNAVAILABLE",
    "The running Companion version does not expose its local Arena collection bridge.",
    422
  );
};

const captureCollectionFromCdp = async (port: number) => {
  const target = await findCollectionTarget(port);
  for (let attempt = 0; attempt < collectionRetryCount; attempt += 1) {
    const collection = await evaluateCdpExpression(
      target,
      collectionCaptureExpression
    );
    if (collection != null) {
      return collection;
    }
    await delay(750);
  }
  throw new UntappedBridgeError(
    "UNTAPPED_COLLECTION_NOT_READY",
    "Companion has not received the Arena collection yet. Open Collection or Decks in Arena, wait a moment, and try again.",
    422
  );
};

export const validateUntappedCollectionMap = (
  value: unknown
): Record<string, number> => {
  if (!isRecord(value)) {
    throw new UntappedBridgeError(
      "UNTAPPED_CAPTURE_INVALID",
      "Companion returned an invalid collection.",
      422
    );
  }

  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > maximumCollectionEntries) {
    throw new UntappedBridgeError(
      "UNTAPPED_CAPTURE_INVALID",
      "Companion returned an empty or unexpectedly large collection.",
      422
    );
  }

  const collection: Record<string, number> = {};
  for (const [grpId, quantity] of entries) {
    if (
      !/^\d+$/.test(grpId) ||
      Number.parseInt(grpId, 10) <= 0 ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 0 ||
      quantity > 1_000
    ) {
      throw new UntappedBridgeError(
        "UNTAPPED_CAPTURE_INVALID",
        "Companion returned malformed Arena collection entries.",
        422
      );
    }
    if (quantity > 0) {
      collection[grpId] = quantity;
    }
  }

  if (
    Object.keys(collection).length === 0 ||
    Buffer.byteLength(JSON.stringify(collection), "utf8") > maximumCollectionBytes
  ) {
    throw new UntappedBridgeError(
      "UNTAPPED_CAPTURE_INVALID",
      "Companion returned an empty or unexpectedly large collection.",
      422
    );
  }
  return collection;
};

const buildStatus = (
  processInfo: UntappedProcessInfo | null,
  state: UntappedAutomationState,
  message: string,
  installed: boolean,
  devToolsPort?: number
): UntappedCompanionBridgeStatus => ({
  companionInstalled: installed,
  companionRunning: Boolean(processInfo),
  companionPid: processInfo?.pid ?? null,
  automationState: state,
  readyToCapture: state === "ready" || state === "not-running",
  restartRequired: state === "restart-required",
  message,
  ...(typeof devToolsPort === "number" ? { devToolsPort } : {})
});

export const getUntappedCompanionBridgeStatus = async (
  options?: UntappedCompanionBridgeOptions
): Promise<UntappedCompanionBridgeStatus> => {
  if (options?.statusRunner) {
    return options.statusRunner();
  }

  const paths = resolveBridgePaths(options);
  if (!existsSync(paths.executablePath)) {
    return buildStatus(
      null,
      "not-installed",
      "Install the free Untapped Companion desktop app to sync from Arena.",
      false
    );
  }

  const processInfo = findUntappedProcess(paths.executablePath);
  if (!processInfo) {
    return buildStatus(
      null,
      "not-running",
      "Companion will open when you sync.",
      true
    );
  }
  if (!processInfo.automationEnabled) {
    return buildStatus(
      processInfo,
      "restart-required",
      "Restart Companion once to enable automatic local sync.",
      true
    );
  }

  const devToolsPort = readActivePort(paths.activePortPath);
  if (!devToolsPort) {
    return buildStatus(
      processInfo,
      "connecting",
      "Waiting for Companion’s local collection bridge…",
      true
    );
  }

  try {
    const targets = await fetchCdpTargets(devToolsPort);
    if (targets.length === 0) {
      throw new Error("No Companion renderer is available.");
    }
    return buildStatus(
      processInfo,
      "ready",
      "Arena is ready to sync through Companion.",
      true,
      devToolsPort
    );
  } catch {
    return buildStatus(
      processInfo,
      "unavailable",
      "Companion’s local collection bridge is unavailable. Restart Companion and try again.",
      true,
      devToolsPort
    );
  }
};

const waitForProcessExit = async (pid: number, timeoutMs: number) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    await delay(150);
  }
  return false;
};

const launchUntappedCompanion = async (
  options?: UntappedCompanionBridgeOptions
) => {
  const paths = resolveBridgePaths(options);
  if (!existsSync(paths.executablePath)) {
    throw new UntappedBridgeError(
      "UNTAPPED_NOT_INSTALLED",
      "Install the free Untapped Companion desktop app to sync from Arena.",
      404
    );
  }

  rmSync(paths.activePortPath, { force: true });
  const child = spawn(
    paths.executablePath,
    [
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0"
    ],
    {
      detached: true,
      stdio: "ignore"
    }
  );
  child.unref();

  const timeoutMs = options?.launchTimeoutMs ?? defaultLaunchTimeoutMs;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const status = await getUntappedCompanionBridgeStatus(options);
    if (status.automationState === "ready") {
      return status;
    }
    await delay(250);
  }
  throw new UntappedBridgeError(
    "UNTAPPED_BRIDGE_UNAVAILABLE",
    "Companion opened, but its local collection bridge did not become ready.",
    504
  );
};

export const restartUntappedCompanionForAutomation = async (
  options?: UntappedCompanionBridgeOptions
) => {
  if (options?.restartRunner) {
    await options.restartRunner();
    return getUntappedCompanionBridgeStatus(options);
  }

  const paths = resolveBridgePaths(options);
  const processInfo = findUntappedProcess(paths.executablePath);
  if (processInfo) {
    try {
      process.kill(processInfo.pid, "SIGTERM");
    } catch (error) {
      throw new UntappedBridgeError(
        "UNTAPPED_RESTART_FAILED",
        error instanceof Error
          ? `Could not close Companion: ${error.message}`
          : "Could not close Companion."
      );
    }
    const exited = await waitForProcessExit(processInfo.pid, 10_000);
    if (!exited) {
      throw new UntappedBridgeError(
        "UNTAPPED_RESTART_FAILED",
        "Companion did not close cleanly. Quit it manually, then try again."
      );
    }
  }
  return launchUntappedCompanion(options);
};

export const captureUntappedCompanionCollection = async (
  helperOptions?: UntappedCaptureHelperOptions,
  bridgeOptions?: UntappedCompanionBridgeOptions
) => {
  let status = await getUntappedCompanionBridgeStatus(bridgeOptions);
  if (status.automationState === "not-installed") {
    throw new UntappedBridgeError(
      "UNTAPPED_NOT_INSTALLED",
      status.message,
      404
    );
  }
  if (status.automationState === "not-running") {
    status = await launchUntappedCompanion(bridgeOptions);
  }
  if (status.restartRequired) {
    throw new UntappedBridgeError(
      "UNTAPPED_RESTART_REQUIRED",
      "Restart Companion once to enable automatic local sync."
    );
  }
  if (status.automationState !== "ready") {
    throw new UntappedBridgeError(
      "UNTAPPED_BRIDGE_UNAVAILABLE",
      status.message,
      422
    );
  }

  const rawCollection = bridgeOptions?.captureRunner
    ? await bridgeOptions.captureRunner()
    : await captureCollectionFromCdp(status.devToolsPort as number);
  const collection = validateUntappedCollectionMap(rawCollection);
  return writeAutomatedUntappedCapture(collection, helperOptions);
};
