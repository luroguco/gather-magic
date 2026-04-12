import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { packageRoot, workspaceRoot } from "../lib/paths.js";
import { defaultProcessPatterns, findMtgaProcess } from "./probeMtgaRuntime.js";

type CliOptions = {
  pid?: number;
  outPath?: string;
  sourcePath: string;
  entitlementsPath: string;
  appBundlePath: string;
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

type NativeAppBundleAttachReport = {
  generatedAt: string;
  platform: NodeJS.Platform;
  probeVersion: string;
  source: {
    path: string;
    exists: boolean;
  };
  entitlements: {
    path: string;
    exists: boolean;
    contents: string | null;
  };
  appBundle: {
    path: string;
    executablePath: string;
    infoPlistPath: string;
    packaged: boolean;
    packageError?: string;
  };
  compile: {
    attempted: boolean;
    succeeded: boolean;
    exitCode: number | null;
    stdout: string;
    stderr: string;
  };
  signing: {
    attempted: boolean;
    succeeded: boolean;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    entitlementsDisplay?: string;
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

const productName = "MTGA Native Attach Smoke";
const bundleId = "com.luroguco.mtga.native-attach-smoke";
const defaultSourcePath = resolve(packageRoot, "src/native/mtga_attach_smoke.c");
const defaultEntitlementsPath = resolve(packageRoot, "src/native/mtga_debugger.entitlements.plist");
const defaultAppBundlePath = resolve(packageRoot, "out/native-app", `${productName}.app`);

const parseArgs = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    sourcePath: defaultSourcePath,
    entitlementsPath: defaultEntitlementsPath,
    appBundlePath: defaultAppBundlePath,
    processPatterns: [...defaultProcessPatterns]
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

    if (arg === "--entitlements" && nextArg) {
      options.entitlementsPath = resolve(workspaceRoot, nextArg);
      index += 1;
      continue;
    }

    if (arg === "--app" && nextArg) {
      options.appBundlePath = resolve(workspaceRoot, nextArg);
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

const executablePathForBundle = (appBundlePath: string) =>
  resolve(appBundlePath, "Contents/MacOS", productName);

const infoPlistPathForBundle = (appBundlePath: string) =>
  resolve(appBundlePath, "Contents/Info.plist");

const buildInfoPlist = () => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>${productName}</string>
  <key>CFBundleExecutable</key>
  <string>${productName}</string>
  <key>CFBundleIdentifier</key>
  <string>${bundleId}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${productName}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSUIElement</key>
  <true/>
  <key>SecTaskAccess</key>
  <array>
    <string>allowed</string>
    <string>debug</string>
  </array>
</dict>
</plist>
`;

const packageAppBundle = (appBundlePath: string) => {
  const executablePath = executablePathForBundle(appBundlePath);
  const infoPlistPath = infoPlistPathForBundle(appBundlePath);
  const macOsDirectory = dirname(executablePath);
  const contentsDirectory = dirname(macOsDirectory);

  rmSync(appBundlePath, { recursive: true, force: true });
  mkdirSync(macOsDirectory, { recursive: true });
  mkdirSync(resolve(contentsDirectory, "Resources"), { recursive: true });
  writeFileSync(infoPlistPath, buildInfoPlist(), "utf8");
  writeFileSync(resolve(contentsDirectory, "PkgInfo"), "APPL????", "utf8");

  return {
    executablePath,
    infoPlistPath
  };
};

const buildNextSteps = (report: NativeAppBundleAttachReport) => {
  if (process.platform !== "darwin") {
    return ["This native app-bundle smoke test only supports macOS right now."];
  }

  if (!report.source.exists) {
    return ["The native smoke-test source file is missing. Recreate apps/api/src/native/mtga_attach_smoke.c."];
  }

  if (!report.entitlements.exists) {
    return ["The native helper entitlements file is missing. Recreate apps/api/src/native/mtga_debugger.entitlements.plist."];
  }

  if (!report.processLookup.selectedPid) {
    return [
      "Launch MTG Arena, leave the deckbuilder open, and rerun this probe.",
      "If automatic process lookup misses it, rerun with --pid <arena-pid>."
    ];
  }

  if (!report.compile.succeeded) {
    return [
      "The native app bundle did not compile. Review the clang stderr in this report.",
      "If clang is missing, install Xcode Command Line Tools and rerun."
    ];
  }

  if (!report.signing.succeeded) {
    return [
      "The native app bundle failed during ad hoc signing.",
      "Review the recorded codesign stderr and entitlements display."
    ];
  }

  if (report.execution.spawnError) {
    return [
      "The packaged native helper failed to launch.",
      "Review the recorded spawn error and verify the app bundle path."
    ];
  }

  if (!report.execution.succeeded) {
    const payload = report.execution.payload;
    if (payload?.procPidPathOk && !payload.taskForPidOk) {
      return [
        "An ad hoc signed native app bundle can see the MTGA process path, but task_for_pid still failed.",
        "That suggests local ad hoc signing and app-bundle shape are still not sufficient.",
        "The next branch experiment should be an Apple-signed native helper or a different runtime seam."
      ];
    }

    return [
      "The packaged native helper ran but did not secure a task port.",
      "Review the task_for_pid error and compare it against the raw CLI native probe."
    ];
  }

  return [
    "An ad hoc signed native app bundle can get a task port to MTGA on this machine.",
    "That makes a first-party native collector more credible than the Electron host path.",
    "The next step is to extend the helper from attach smoke test into collection extraction."
  ];
};

const writeReport = (path: string, report: NativeAppBundleAttachReport) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
};

const summarizeToConsole = (report: NativeAppBundleAttachReport) => {
  console.log(`MTGA native app-bundle attach probe v${report.probeVersion}`);
  console.log(`platform: ${report.platform}`);
  console.log(`source: ${report.source.exists ? "found" : "missing"} at ${report.source.path}`);
  console.log(`entitlements: ${report.entitlements.exists ? "found" : "missing"} at ${report.entitlements.path}`);
  console.log(`app bundle: ${report.appBundle.path}`);
  console.log(`process pid: ${report.processLookup.selectedPid ?? "not found"}`);
  console.log(`compiled: ${report.compile.succeeded ? "yes" : "no"}`);
  console.log(`signed: ${report.signing.succeeded ? "yes" : "no"}`);
  console.log(`executed: ${report.execution.attempted ? "yes" : "no"}`);
  console.log(`task_for_pid success: ${report.execution.succeeded ? "yes" : "no"}`);

  if (report.execution.payload) {
    console.log(`proc_pidpath: ${report.execution.payload.procPidPathOk ? report.execution.payload.procPidPath : "failed"}`);
    console.log(
      `task_for_pid: ${report.execution.payload.taskForPidOk ? "ok" : `${report.execution.payload.taskForPidKernReturn} (${report.execution.payload.taskForPidMessage})`}`
    );
  }

  if (report.signing.stderr) {
    console.log(`signing stderr:\n${report.signing.stderr}`);
  }

  console.log("next steps:");
  for (const step of report.nextSteps) {
    console.log(`  - ${step}`);
  }
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const appExecutablePath = executablePathForBundle(options.appBundlePath);
  const infoPlistPath = infoPlistPathForBundle(options.appBundlePath);

  const report: NativeAppBundleAttachReport = {
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    probeVersion: "0.1.0",
    source: {
      path: options.sourcePath,
      exists: existsSync(options.sourcePath)
    },
    entitlements: {
      path: options.entitlementsPath,
      exists: existsSync(options.entitlementsPath),
      contents: existsSync(options.entitlementsPath) ? readFileSync(options.entitlementsPath, "utf8") : null
    },
    appBundle: {
      path: options.appBundlePath,
      executablePath: appExecutablePath,
      infoPlistPath,
      packaged: false
    },
    compile: {
      attempted: false,
      succeeded: false,
      exitCode: null,
      stdout: "",
      stderr: ""
    },
    signing: {
      attempted: false,
      succeeded: false,
      exitCode: null,
      stdout: "",
      stderr: ""
    },
    processLookup: options.pid
      ? {
          method: "cli",
          selectedPid: options.pid,
          matches: [],
          errors: []
        }
      : findMtgaProcess(options.processPatterns),
    execution: {
      attempted: false,
      succeeded: false,
      exitCode: null,
      stdout: "",
      stderr: ""
    },
    nextSteps: []
  };

  if (process.platform !== "darwin" || !report.source.exists || !report.entitlements.exists) {
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

  try {
    packageAppBundle(options.appBundlePath);
    report.appBundle.packaged = true;
  } catch (error) {
    report.appBundle.packageError = error instanceof Error ? error.stack ?? error.message : String(error);
    report.nextSteps = buildNextSteps(report);
    summarizeToConsole(report);
    if (options.outPath) {
      writeReport(options.outPath, report);
      console.log(`report written to ${options.outPath}`);
    }
    return;
  }

  report.compile.attempted = true;
  const compileResult = spawnSync(
    "clang",
    [
      "-Wall",
      "-Wextra",
      "-O2",
      "-o",
      appExecutablePath,
      options.sourcePath
    ],
    {
      encoding: "utf8"
    }
  );
  report.compile.exitCode = compileResult.status;
  report.compile.stdout = compileResult.stdout;
  report.compile.stderr = compileResult.stderr;
  report.compile.succeeded = compileResult.status === 0 && !compileResult.error;

  if (!report.compile.succeeded) {
    if (compileResult.error) {
      report.compile.stderr = `${report.compile.stderr}${compileResult.error.stack ?? compileResult.error.message}`;
    }
    report.nextSteps = buildNextSteps(report);
    summarizeToConsole(report);
    if (options.outPath) {
      writeReport(options.outPath, report);
      console.log(`report written to ${options.outPath}`);
    }
    return;
  }

  report.signing.attempted = true;
  const signBinaryResult = spawnSync(
    "codesign",
    ["--force", "--sign", "-", "--entitlements", options.entitlementsPath, appExecutablePath],
    {
      encoding: "utf8"
    }
  );

  const signBundleResult = spawnSync(
    "codesign",
    ["--force", "--sign", "-", "--entitlements", options.entitlementsPath, options.appBundlePath],
    {
      encoding: "utf8"
    }
  );

  report.signing.exitCode = signBundleResult.status;
  report.signing.stdout = `${signBinaryResult.stdout}${signBundleResult.stdout}`;
  report.signing.stderr = `${signBinaryResult.stderr}${signBundleResult.stderr}`;
  report.signing.succeeded =
    signBinaryResult.status === 0 &&
    signBundleResult.status === 0 &&
    !signBinaryResult.error &&
    !signBundleResult.error;

  if (!report.signing.succeeded) {
    if (signBinaryResult.error) {
      report.signing.stderr = `${report.signing.stderr}${signBinaryResult.error.stack ?? signBinaryResult.error.message}`;
    }
    if (signBundleResult.error) {
      report.signing.stderr = `${report.signing.stderr}${signBundleResult.error.stack ?? signBundleResult.error.message}`;
    }
  } else {
    const displayEntitlementsResult = spawnSync(
      "codesign",
      ["-d", "--entitlements", ":-", options.appBundlePath],
      {
        encoding: "utf8"
      }
    );
    report.signing.entitlementsDisplay = `${displayEntitlementsResult.stdout}${displayEntitlementsResult.stderr}`;
  }

  if (!report.signing.succeeded) {
    report.nextSteps = buildNextSteps(report);
    summarizeToConsole(report);
    if (options.outPath) {
      writeReport(options.outPath, report);
      console.log(`report written to ${options.outPath}`);
    }
    return;
  }

  report.execution.attempted = true;
  const runResult = spawnSync(appExecutablePath, [String(pid)], {
    encoding: "utf8",
    cwd: workspaceRoot
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
