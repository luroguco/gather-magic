import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { packageRoot, workspaceRoot } from "../lib/paths.js";
import { parseArgs, summarizeToConsole, writeReport } from "./probeMtgaRuntime.js";
import type { ProbeReport } from "./probeMtgaRuntime.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const compiledProbeModulePath = resolve(currentDir, "probeMtgaRuntime.js");
const preloadPath = resolve(packageRoot, "src/scripts/probeMtgaElectronPreload.cjs");
const require = createRequire(import.meta.url);
const electron = require("electron") as typeof import("electron");
const { app, BrowserWindow, ipcMain } = electron;

const exitWithError = (message: string) => {
  console.error(message);
  app.exit(1);
};

const main = async () => {
  const options = parseArgs(process.argv.slice(1));

  if (!options.outPath) {
    options.outPath = resolve(workspaceRoot, "data/mtga-runtime-probe-electron.json");
  }

  await app.whenReady();

  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  ipcMain.once("probe-ready", () => {
    window.webContents.send("run-probe", {
      modulePath: compiledProbeModulePath,
      options,
    });
  });

  ipcMain.once("probe-result", (_event, payload: { ok: boolean; error?: string; report?: ProbeReport }) => {
    if (!payload.ok || !payload.report) {
      exitWithError(payload.error ?? "Electron-hosted probe failed without a report.");
      return;
    }

    summarizeToConsole(payload.report);

    if (options.outPath) {
      writeReport(options.outPath, payload.report);
      console.log(`report written to ${options.outPath}`);
    }

    app.exit(0);
  });

  await window.loadURL("data:text/html,<html><body></body></html>");
};

main().catch((error) => {
  exitWithError(error instanceof Error ? error.stack ?? error.message : String(error));
});
