import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { workspaceRoot } from "../lib/paths.js";
import { defaultProcessPatterns, findMtgaProcess } from "./probeMtgaRuntime.js";

type CliOptions = {
  pid?: number;
  outPath?: string;
  sourcePath: string;
  binaryPath: string;
  processPatterns: string[];
};

type NativeAttachPayload = {
  pid: number;
  uid: number;
  euid: number;
  procPidPathOk: boolean;
  procPidPathLength: number;
  procPidPath: string | null;
  procPidPathErrno: number;
  procPidPathErrnoMessage: string;
  taskForPidOk: boolean;
  taskForPidKernReturn: number;
  taskForPidMessage: string;
  taskPort: number;
  taskPortTypeChecked: boolean;
  taskPortTypeKernReturn: number;
  taskPortTypeMessage: string;
  taskPortType: number;
};

type NativeAttachReport = {
  generatedAt: string;
  platform: NodeJS.Platform;
  probeVersion: string;
  source: {
    path: string;
    exists: boolean;
  };
  binary: {
    path: string;
    compileAttempted: boolean;
    compileSucceeded: boolean;
    compileExitCode: number | null;
    compileStdout: string;
    compileStderr: string;
  };
  processLookup: ReturnType<typeof findMtgaProcess>;
  execution: {
    attempted: boolean;
    succeeded: boolean;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    payload?: NativeAttachPayload;
    parseError?: string;
    spawnError?: string;
  };
  nextSteps: string[];
};

const defaultSourcePath = resolve(
  workspaceRoot,
  "apps/api/src/native/mtga_attach_smoke.c",
);
const defaultBinaryPath = resolve(
  workspaceRoot,
  "apps/api/dist/native/mtga_attach_smoke",
);

const parseArgs = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    sourcePath: defaultSourcePath,
    binaryPath: defaultBinaryPath,
    processPatterns: [...defaultProcessPatterns],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextArg = argv[index + 1];

    if (arg === "--pid" && nextArg) {
      const parsed = Number.parseInt(nextArg, 10);
      if (!Number.isNaN(parsed)) {
        options.pid = parsed;
      }
      index += 1;
      continue;
    }

    if (arg === "--out" && nextArg) {
      options.outPath = resolve(workspaceRoot, nextArg);
      index += 1;
      continue;
    }

    if (arg === "--source" && nextArg) {
      options.sourcePath = resolve(workspaceRoot, nextArg);
      index += 1;
      continue;
    }

    if (arg === "--binary" && nextArg) {
      options.binaryPath = resolve(workspaceRoot, nextArg);
      index += 1;
      continue;
    }

    if (arg === "--pattern" && nextArg) {
      options.processPatterns = nextArg
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      index += 1;
    }
  }

  return options;
};

const buildNextSteps = (report: NativeAttachReport) => {
  if (process.platform !== "darwin") {
    return ["This native smoke test only supports macOS right now."];
  }

  if (!report.source.exists) {
    return ["The native smoke-test source file is missing. Recreate apps/api/src/native/mtga_attach_smoke.c."];
  }

  if (!report.processLookup.selectedPid) {
    return [
      "Launch MTG Arena, leave the deckbuilder open, and rerun this probe.",
      "If automatic process lookup misses it, rerun with --pid <arena-pid>.",
    ];
  }

  if (!report.binary.compileSucceeded) {
    return [
      "The native helper did not compile. Review the clang stderr in this report.",
      "If clang is missing, install Xcode Command Line Tools and rerun.",
    ];
  }

  if (report.execution.spawnError) {
    return [
      "The compiled helper failed to launch. Review the recorded spawn error.",
      "If this happened inside a sandboxed session, rerun the probe outside the sandbox.",
    ];
  }

  if (!report.execution.succeeded) {
    const payload = report.execution.payload;
    if (payload?.procPidPathOk && !payload.taskForPidOk) {
      return [
        "A first-party native helper can see the MTGA process path, but task_for_pid still failed.",
        "That means a custom collector likely needs a signed/entitled host, not just arbitrary native code.",
        "The next direction would be a proper signed desktop helper or instrumentation of an existing signed host.",
      ];
    }

    return [
      "The helper ran but did not secure a task port.",
      "Review the task_for_pid error in the report and compare it against the lldb attach behavior.",
    ];
  }

  return [
    "A first-party native helper can get a task port to MTGA on this machine.",
    "That makes our own desktop collector viable without depending on Untapped's private addon.",
    "Next step is to enumerate the runtime surface carefully and extract the collection map.",
  ];
};

const writeReport = (path: string, report: NativeAttachReport) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
};

const summarizeToConsole = (report: NativeAttachReport) => {
  console.log(`MTGA native attach probe v${report.probeVersion}`);
  console.log(`platform: ${report.platform}`);
  console.log(`source: ${report.source.exists ? "found" : "missing"} at ${report.source.path}`);
  console.log(`process pid: ${report.processLookup.selectedPid ?? "not found"}`);

  if (report.processLookup.matches.length > 0) {
    console.log("candidate processes:");
    for (const match of report.processLookup.matches) {
      console.log(`  - ${match.pid}: ${match.label}`);
    }
  }

  console.log(`compiled: ${report.binary.compileSucceeded ? "yes" : "no"}`);
  if (report.binary.compileExitCode !== null) {
    console.log(`compile exit code: ${report.binary.compileExitCode}`);
  }
  if (report.binary.compileStderr) {
    console.log(`compile stderr:\n${report.binary.compileStderr}`);
  }

  console.log(`executed: ${report.execution.attempted ? "yes" : "no"}`);
  console.log(`task_for_pid success: ${report.execution.succeeded ? "yes" : "no"}`);

  if (report.execution.payload) {
    console.log(`proc_pidpath: ${report.execution.payload.procPidPathOk ? report.execution.payload.procPidPath : "failed"}`);
    console.log(
      `task_for_pid: ${report.execution.payload.taskForPidOk ? "ok" : `${report.execution.payload.taskForPidKernReturn} (${report.execution.payload.taskForPidMessage})`}`,
    );
  }

  if (report.execution.stderr) {
    console.log(`execution stderr:\n${report.execution.stderr}`);
  }

  console.log("next steps:");
  for (const step of report.nextSteps) {
    console.log(`  - ${step}`);
  }
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const report: NativeAttachReport = {
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    probeVersion: "0.1.0",
    source: {
      path: options.sourcePath,
      exists: existsSync(options.sourcePath),
    },
    binary: {
      path: options.binaryPath,
      compileAttempted: false,
      compileSucceeded: false,
      compileExitCode: null,
      compileStdout: "",
      compileStderr: "",
    },
    processLookup: options.pid
      ? {
          method: "cli",
          selectedPid: options.pid,
          matches: [],
          errors: [],
        }
      : findMtgaProcess(options.processPatterns),
    execution: {
      attempted: false,
      succeeded: false,
      exitCode: null,
      stdout: "",
      stderr: "",
    },
    nextSteps: [],
  };

  if (process.platform !== "darwin" || !report.source.exists) {
    report.nextSteps = buildNextSteps(report);
    summarizeToConsole(report);
    if (options.outPath) {
      writeReport(options.outPath, report);
      console.log(`report written to ${options.outPath}`);
    }
    return;
  }

  const pid = options.pid ?? report.processLookup.selectedPid;
  if (!pid) {
    report.nextSteps = buildNextSteps(report);
    summarizeToConsole(report);
    if (options.outPath) {
      writeReport(options.outPath, report);
      console.log(`report written to ${options.outPath}`);
    }
    return;
  }

  mkdirSync(dirname(options.binaryPath), { recursive: true });
  report.binary.compileAttempted = true;
  const compileResult = spawnSync(
    "clang",
    [
      "-Wall",
      "-Wextra",
      "-O2",
      "-o",
      options.binaryPath,
      options.sourcePath,
    ],
    {
      encoding: "utf8",
    },
  );
  report.binary.compileExitCode = compileResult.status;
  report.binary.compileStdout = compileResult.stdout;
  report.binary.compileStderr = compileResult.stderr;
  report.binary.compileSucceeded = compileResult.status === 0 && !compileResult.error;

  if (compileResult.error) {
    report.binary.compileStderr = `${report.binary.compileStderr}${compileResult.error.stack ?? compileResult.error.message}`;
    report.nextSteps = buildNextSteps(report);
    summarizeToConsole(report);
    if (options.outPath) {
      writeReport(options.outPath, report);
      console.log(`report written to ${options.outPath}`);
    }
    return;
  }

  if (!report.binary.compileSucceeded) {
    report.nextSteps = buildNextSteps(report);
    summarizeToConsole(report);
    if (options.outPath) {
      writeReport(options.outPath, report);
      console.log(`report written to ${options.outPath}`);
    }
    return;
  }

  report.execution.attempted = true;
  const runResult = spawnSync(options.binaryPath, [String(pid)], {
    encoding: "utf8",
  });

  report.execution.exitCode = runResult.status;
  report.execution.stdout = runResult.stdout;
  report.execution.stderr = runResult.stderr;

  if (runResult.error) {
    report.execution.spawnError = runResult.error.stack ?? runResult.error.message;
    report.nextSteps = buildNextSteps(report);
    summarizeToConsole(report);
    if (options.outPath) {
      writeReport(options.outPath, report);
      console.log(`report written to ${options.outPath}`);
    }
    return;
  }

  try {
    report.execution.payload = JSON.parse(runResult.stdout) as NativeAttachPayload;
  } catch (error) {
    report.execution.parseError = error instanceof Error ? error.stack ?? error.message : String(error);
  }

  report.execution.succeeded = runResult.status === 0 && report.execution.payload?.taskForPidOk === true;
  report.nextSteps = buildNextSteps(report);
  summarizeToConsole(report);

  if (options.outPath) {
    writeReport(options.outPath, report);
    console.log(`report written to ${options.outPath}`);
  }
};

main();
