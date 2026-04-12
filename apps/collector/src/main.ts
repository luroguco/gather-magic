import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type ProbeOverrides = {
  pid?: number;
  scryAddonPath?: string;
  processPatterns?: string[];
  metadataTargets?: string[];
  monoImages?: string[];
};

type ProbeReport = {
  generatedAt?: string;
  processLookup?: {
    selectedPid?: number | null;
    matches?: Array<{ pid: number; label: string; sourcePattern?: string }>;
  };
  connection?: {
    attempted?: boolean;
    connected?: boolean;
    error?: string;
  };
  nextSteps?: string[];
  [key: string]: unknown;
};

type ProbeRunResult = {
  report: ProbeReport;
  latestReportPath: string;
  archivedReportPath: string;
  summary: string;
};

const require = createRequire(import.meta.url);
const electron = require("electron") as typeof import("electron");
const { app, BrowserWindow, ipcMain } = electron;

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, "..");
const defaultWorkspaceRoot = resolve(packageRoot, "../..");
const uiPreloadPath = resolve(packageRoot, "dist/uiPreload.cjs");
const indexPath = resolve(packageRoot, "dist/index.html");

const resolveWorkspaceRoot = () => {
  const candidates = [
    process.env.COLLECTOR_WORKSPACE_ROOT,
    process.cwd(),
    defaultWorkspaceRoot
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const probeCandidate = resolve(candidate, "apps/api/dist/scripts/probeMtgaRuntime.js");
    if (existsSync(probeCandidate)) {
      return candidate;
    }
  }

  return null;
};

const workspaceRoot = resolveWorkspaceRoot();
const probeModulePath = workspaceRoot
  ? resolve(workspaceRoot, "apps/api/dist/scripts/probeMtgaRuntime.js")
  : resolve(defaultWorkspaceRoot, "apps/api/dist/scripts/probeMtgaRuntime.js");
const collectorDataDirectory = workspaceRoot
  ? resolve(workspaceRoot, "data/collector")
  : resolve(process.env.HOME ?? packageRoot, "Library/Application Support/mtga-collector-spike");
const latestReportPath = resolve(collectorDataDirectory, "latest-runtime-probe.json");
const sessionLogPath = resolve(collectorDataDirectory, "session.log");

const parseCliOptions = (argv: string[]) => {
  const options: { autoRunRuntimeProbe: boolean; overrides: ProbeOverrides } = {
    autoRunRuntimeProbe: process.env.COLLECTOR_AUTO_RUN_RUNTIME_PROBE === "1",
    overrides: {}
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextArg = argv[index + 1];

    if (arg === "--run-runtime-probe") {
      options.autoRunRuntimeProbe = true;
      continue;
    }

    if (arg === "--pid" && nextArg) {
      const pid = Number.parseInt(nextArg, 10);
      if (!Number.isNaN(pid)) {
        options.overrides.pid = pid;
      }
      index += 1;
      continue;
    }
  }

  return options;
};

const buildArchivedReportPath = () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return resolve(collectorDataDirectory, `runtime-probe-${stamp}.json`);
};

const writeProbeReport = (report: ProbeReport) => {
  mkdirSync(collectorDataDirectory, { recursive: true });
  const archivedReportPath = buildArchivedReportPath();
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(latestReportPath, serialized, "utf8");
  writeFileSync(archivedReportPath, serialized, "utf8");

  return {
    latestReportPath,
    archivedReportPath
  };
};

const summarizeReport = (report: ProbeReport) => {
  const lines = [
    `Generated: ${String(report.generatedAt ?? "unknown")}`,
    `Probe module: ${probeModulePath}`,
    `MTGA PID: ${String(report.processLookup?.selectedPid ?? "not found")}`,
    `Connected: ${report.connection?.connected ? "yes" : "no"}`
  ];

  if (report.connection?.error) {
    lines.push(`Connection error: ${report.connection.error}`);
  }

  const nextSteps = report.nextSteps ?? [];
  if (nextSteps.length > 0) {
    lines.push("");
    lines.push("Next steps:");
    for (const step of nextSteps) {
      lines.push(`- ${step}`);
    }
  }

  return lines.join("\n");
};

const logSession = (message: string) => {
  mkdirSync(collectorDataDirectory, { recursive: true });
  appendFileSync(sessionLogPath, `${new Date().toISOString()} ${message}\n`, "utf8");
};

const buildStatusPayload = () => ({
  platform: process.platform,
  workspaceRoot,
  probeModulePath,
  probeModuleExists: existsSync(probeModulePath),
  collectorDataDirectory,
  latestReportPath,
  sessionLogPath
});

const createMainWindow = () => {
  const window = new BrowserWindow({
    width: 1120,
    height: 800,
    minWidth: 920,
    minHeight: 680,
    webPreferences: {
      preload: uiPreloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  void window.loadFile(indexPath);
  return window;
};

const runRuntimeProbe = async (overrides: ProbeOverrides = {}): Promise<ProbeRunResult> => {
  if (!existsSync(probeModulePath)) {
    throw new Error(
      `Probe module not found at ${probeModulePath}. Build the API workspace first with "npm run build -w @mtga/api".`
    );
  }

  const probeModule = await import(pathToFileURL(probeModulePath).href);
  const options =
    typeof probeModule.parseArgs === "function"
      ? probeModule.parseArgs([])
      : { processPatterns: [], metadataTargets: [], monoImages: [] };

  Object.assign(options, overrides);
  const report = probeModule.runProbe(options) as ProbeReport;

  const paths = writeProbeReport(report);

  return {
    report,
    ...paths,
    summary: summarizeReport(report)
  };
};

const registerIpcHandlers = () => {
  ipcMain.handle("collector:get-status", () => buildStatusPayload());
  ipcMain.handle("collector:run-runtime-probe", async (_event, overrides?: ProbeOverrides) =>
    runRuntimeProbe(overrides ?? {})
  );
};

const main = async () => {
  const cliOptions = parseCliOptions(process.argv.slice(2));
  logSession(
    `main-start autoRun=${cliOptions.autoRunRuntimeProbe ? "yes" : "no"} cwd=${process.cwd()} workspaceRoot=${workspaceRoot ?? "none"}`
  );
  await app.whenReady();
  registerIpcHandlers();

  if (cliOptions.autoRunRuntimeProbe) {
    try {
      logSession("auto-run-probe-start");
      const result = await runRuntimeProbe(cliOptions.overrides);
      logSession(`auto-run-probe-success latest=${result.latestReportPath}`);
      console.log(result.summary);
      console.log(`Latest report: ${result.latestReportPath}`);
      console.log(`Archived report: ${result.archivedReportPath}`);
      app.exit(0);
      return;
    } catch (error) {
      logSession(`auto-run-probe-error ${error instanceof Error ? error.message : String(error)}`);
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
      app.exit(1);
      return;
    }
  }

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
};

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  app.exit(1);
});
