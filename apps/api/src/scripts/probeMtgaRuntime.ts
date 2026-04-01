import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { workspaceRoot } from "../lib/paths.js";

export type CliOptions = {
  pid?: number;
  outPath?: string;
  scryAddonPath?: string;
  processPatterns: string[];
  metadataTargets: string[];
  monoImages: string[];
};

type ProcessMatch = {
  pid: number;
  label: string;
  sourcePattern: string;
};

type ProcessLookupResult = {
  method: string;
  selectedPid: number | null;
  matches: ProcessMatch[];
  errors: string[];
};

type ClassCheck = {
  className: string;
  ok: boolean;
  fieldCount?: number;
  error?: string;
};

type ContextAttempt = {
  target: string;
  ok: boolean;
  error?: string;
  classChecks?: ClassCheck[];
};

type ConstructorAttempt = {
  label: string;
  ok: boolean;
  error?: string;
};

type ModeProbe = {
  mode: "il2cpp" | "mono";
  constructorAttempts: ConstructorAttempt[];
  constructed: boolean;
  targetsTried: ContextAttempt[];
};

export type ProbeReport = {
  generatedAt: string;
  platform: NodeJS.Platform;
  nodeVersion: string;
  probeVersion: string;
  scryAddon: {
    path: string;
    exists: boolean;
    loaded: boolean;
    exports: string[];
    loadError?: string;
  };
  processLookup: ProcessLookupResult;
  connection: {
    attempted: boolean;
    connected: boolean;
    error?: string;
  };
  modes: ModeProbe[];
  nextSteps: string[];
};

type ScryInstance = object;

type ProbeClass = {
  getFieldNames?: () => string[];
};

type MonoImageLike = {
  getClass: (name: string) => ProbeClass;
};

type Il2CppMetadataContextLike = {
  getClass: (name: string) => ProbeClass;
};

type NativeScryModule = {
  Scry: {
    connect: (pid: number) => ScryInstance;
  };
  MonoScry: new (scry: ScryInstance, options?: Record<string, unknown>) => {
    getMonoImage: (name?: string) => MonoImageLike;
  };
  Il2CppScry: new (scry: ScryInstance, options?: Record<string, unknown>) => {
    getMetadataContext: (name?: string) => Il2CppMetadataContextLike;
  };
};

const require = createRequire(import.meta.url);

const defaultScryAddonPath =
  "/Applications/Untapped.gg Companion.app/Contents/Resources/app.asar.unpacked/node_modules/untapped-scry/lib/binding/napi-v5/untapped-scry.node";

export const defaultProcessPatterns = ["MTGA", "Magic The Gathering Arena"];
const defaultMetadataTargets = [
  "",
  "Assembly-CSharp",
  "Assembly-CSharp.dll",
  "GameAssembly",
  "GameAssembly.dll",
];
const defaultMonoImages = ["", "Assembly-CSharp", "Assembly-CSharp-firstpass"];
const candidateMtgaClasses = [
  "Wizards.Mtga.Pantry",
  "PAPA",
  "WrapperController",
  "SystemMessageManager",
  "MatchSceneManager",
];

export const parseArgs = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    processPatterns: [...defaultProcessPatterns],
    metadataTargets: [...defaultMetadataTargets],
    monoImages: [...defaultMonoImages],
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

    if (arg === "--scry-addon" && nextArg) {
      options.scryAddonPath = resolve(workspaceRoot, nextArg);
      index += 1;
      continue;
    }

    if (arg === "--pattern" && nextArg) {
      options.processPatterns = nextArg
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }

    if (arg === "--metadata-targets" && nextArg) {
      options.metadataTargets = nextArg.split(",").map((value) => value.trim());
      index += 1;
      continue;
    }

    if (arg === "--mono-images" && nextArg) {
      options.monoImages = nextArg.split(",").map((value) => value.trim());
      index += 1;
    }
  }

  return options;
};

const uniqueByPid = (matches: ProcessMatch[]) => {
  const seen = new Set<number>();

  return matches.filter((match) => {
    if (seen.has(match.pid)) {
      return false;
    }
    seen.add(match.pid);
    return true;
  });
};

const shouldIgnoreMatch = (match: ProcessMatch) =>
  /untapped|helper|companion/i.test(match.label) ||
  /(^|\s)node(\s|$)/i.test(match.label) ||
  /concurrently|tsx|npm run dev|node_modules\/\.bin/i.test(match.label);

export const findMtgaProcess = (patterns: string[]): ProcessLookupResult => {
  if (process.platform !== "darwin" && process.platform !== "linux") {
    return {
      method: "unsupported-platform",
      selectedPid: null,
      matches: [],
      errors: [`Automatic process lookup is not implemented for ${process.platform}. Use --pid.`],
    };
  }

  const matches: ProcessMatch[] = [];
  const errors: string[] = [];

  for (const pattern of patterns) {
    const result = spawnSync("pgrep", ["-ifl", pattern], {
      encoding: "utf8",
    });

    if (result.error) {
      errors.push(`pgrep ${JSON.stringify(pattern)} failed: ${result.error.message}`);
      continue;
    }

    if (result.status !== 0 && !result.stdout.trim()) {
      continue;
    }

    for (const line of result.stdout.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const match = trimmed.match(/^(\d+)\s+(.*)$/);
      if (!match) {
        continue;
      }

      const pid = Number.parseInt(match[1]!, 10);
      const label = match[2] ?? "";

      if (!Number.isFinite(pid)) {
        continue;
      }

      matches.push({
        pid,
        label,
        sourcePattern: pattern,
      });
    }
  }

  const dedupedMatches = uniqueByPid(matches).filter((match) => !shouldIgnoreMatch(match));
  const selectedPid = dedupedMatches[0]?.pid ?? null;

  return {
    method: "pgrep",
    selectedPid,
    matches: dedupedMatches,
    errors,
  };
};

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
};

const checkClasses = (
  context: { getClass: (name: string) => ProbeClass },
  classNames: string[],
): ClassCheck[] =>
  classNames.map((className) => {
    try {
      const cls = context.getClass(className);
      const fields = typeof cls?.getFieldNames === "function" ? cls.getFieldNames() : [];
      return {
        className,
        ok: true,
        fieldCount: fields.length,
      };
    } catch (error) {
      return {
        className,
        ok: false,
        error: serializeError(error),
      };
    }
  });

const constructMode = <T>(
  labels: string[],
  factory: (label: string) => T,
): { instance: T | null; attempts: ConstructorAttempt[] } => {
  const attempts: ConstructorAttempt[] = [];

  for (const label of labels) {
    try {
      const instance = factory(label);
      attempts.push({
        label,
        ok: true,
      });
      return {
        instance,
        attempts,
      };
    } catch (error) {
      attempts.push({
        label,
        ok: false,
        error: serializeError(error),
      });
    }
  }

  return {
    instance: null,
    attempts,
  };
};

const probeIl2Cpp = (nativeModule: NativeScryModule, scry: ScryInstance, targets: string[]): ModeProbe => {
  const { instance, attempts } = constructMode(["with-options", "without-options"], (label) => {
    if (label === "with-options") {
      return new nativeModule.Il2CppScry(scry, { enumerateProperties: false });
    }
    return new nativeModule.Il2CppScry(scry);
  });

  const report: ModeProbe = {
    mode: "il2cpp",
    constructorAttempts: attempts,
    constructed: instance !== null,
    targetsTried: [],
  };

  if (!instance) {
    return report;
  }

  for (const target of targets) {
    try {
      const context = target ? instance.getMetadataContext(target) : instance.getMetadataContext();
      report.targetsTried.push({
        target: target || "<default>",
        ok: true,
        classChecks: checkClasses(context, candidateMtgaClasses),
      });
    } catch (error) {
      report.targetsTried.push({
        target: target || "<default>",
        ok: false,
        error: serializeError(error),
      });
    }
  }

  return report;
};

const probeMono = (nativeModule: NativeScryModule, scry: ScryInstance, targets: string[]): ModeProbe => {
  const { instance, attempts } = constructMode(["with-options", "without-options"], (label) => {
    if (label === "with-options") {
      return new nativeModule.MonoScry(scry, { enumerateProperties: false });
    }
    return new nativeModule.MonoScry(scry);
  });

  const report: ModeProbe = {
    mode: "mono",
    constructorAttempts: attempts,
    constructed: instance !== null,
    targetsTried: [],
  };

  if (!instance) {
    return report;
  }

  for (const target of targets) {
    try {
      const image = target ? instance.getMonoImage(target) : instance.getMonoImage();
      report.targetsTried.push({
        target: target || "<default>",
        ok: true,
        classChecks: checkClasses(image, candidateMtgaClasses),
      });
    } catch (error) {
      report.targetsTried.push({
        target: target || "<default>",
        ok: false,
        error: serializeError(error),
      });
    }
  }

  return report;
};

const buildNextSteps = (report: ProbeReport) => {
  if (!report.scryAddon.exists) {
    return [
      "Install Untapped.gg Companion or rerun with --scry-addon pointing at a compatible untapped-scry.node.",
      "This spike currently uses Untapped's local native addon only as a research probe.",
    ];
  }

  if (!report.processLookup.selectedPid) {
    return [
      "Launch MTG Arena and leave it running on the collection screen, then rerun this probe.",
      "If automatic lookup keeps missing the process, rerun with --pid <arena-pid>.",
    ];
  }

  if (!report.connection.connected) {
    const pid = report.processLookup.selectedPid;
    return [
      "The live MTGA PID was found, but Scry.connect(...) still failed.",
      "That points to a host-process limitation on macOS, not a collection-screen issue.",
      "The most likely blocker is that untapped-scry.node is running inside plain node instead of a signed Electron/native host like Untapped Companion.",
      ...(pid
        ? [`Run 'lldb -p ${pid} -o \"detach\" -o \"quit\"' as a control test. If that attach fails too, the blocker is machine-level macOS debugging permissions rather than our script.`]
        : []),
      "Next spike should test a signed host or our own native helper rather than raw Node.",
    ];
  }

  const il2cppSuccess = report.modes
    .find((mode) => mode.mode === "il2cpp")
    ?.targetsTried.some((attempt) => attempt.ok);

  const monoSuccess = report.modes
    .find((mode) => mode.mode === "mono")
    ?.targetsTried.some((attempt) => attempt.ok);

  if (!il2cppSuccess && !monoSuccess) {
    return [
      "Process attachment worked, but no metadata/image target resolved cleanly yet.",
      "Next step is to inspect the live runtime more directly and tune the collector around the working MTGA assembly/context.",
    ];
  }

  return [
    "A runtime reader path is viable on this machine.",
    "Next step is to turn the successful mode into a collector that emits grpId -> quantity and compare it against the CSV baseline.",
  ];
};

export const writeReport = (path: string, report: ProbeReport) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
};

export const summarizeToConsole = (report: ProbeReport) => {
  console.log(`MTGA runtime probe v${report.probeVersion}`);
  console.log(`platform: ${report.platform} node: ${report.nodeVersion}`);
  console.log(`scry addon: ${report.scryAddon.exists ? "found" : "missing"} at ${report.scryAddon.path}`);

  if (report.scryAddon.loadError) {
    console.log(`load error: ${report.scryAddon.loadError}`);
  }

  console.log(`process pid: ${report.processLookup.selectedPid ?? "not found"}`);

  if (report.processLookup.matches.length > 0) {
    console.log("candidate processes:");
    for (const match of report.processLookup.matches) {
      console.log(`  - ${match.pid}: ${match.label}`);
    }
  }

  console.log(`connected: ${report.connection.connected ? "yes" : "no"}`);
  if (report.connection.error) {
    console.log(`connection error: ${report.connection.error}`);
  }

  for (const mode of report.modes) {
    console.log(`${mode.mode}: constructed=${mode.constructed ? "yes" : "no"}`);
    for (const attempt of mode.targetsTried) {
      const workingClasses = attempt.classChecks?.filter((check) => check.ok).length ?? 0;
      console.log(`  - ${attempt.target}: ${attempt.ok ? `ok (${workingClasses} class checks passed)` : `failed (${attempt.error})`}`);
    }
  }

  console.log("next steps:");
  for (const step of report.nextSteps) {
    console.log(`  - ${step}`);
  }
};

export const runProbe = (options: CliOptions): ProbeReport => {
  const scryAddonPath = options.scryAddonPath ?? defaultScryAddonPath;
  const report: ProbeReport = {
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    nodeVersion: process.version,
    probeVersion: "0.1.0",
    scryAddon: {
      path: scryAddonPath,
      exists: existsSync(scryAddonPath),
      loaded: false,
      exports: [],
    },
    processLookup: {
      method: options.pid ? "cli" : "pgrep",
      selectedPid: options.pid ?? null,
      matches: [],
      errors: [],
    },
    connection: {
      attempted: false,
      connected: false,
    },
    modes: [],
    nextSteps: [],
  };

  if (!report.scryAddon.exists) {
    report.nextSteps = buildNextSteps(report);
    return report;
  }

  let nativeModule: NativeScryModule | null = null;

  try {
    nativeModule = require(scryAddonPath) as NativeScryModule;
    report.scryAddon.loaded = true;
    report.scryAddon.exports = Object.keys(nativeModule);
  } catch (error) {
    report.scryAddon.loadError = serializeError(error);
    report.nextSteps = buildNextSteps(report);
    return report;
  }

  if (!options.pid) {
    report.processLookup = findMtgaProcess(options.processPatterns);
  }

  const pid = options.pid ?? report.processLookup.selectedPid;
  if (!pid) {
    report.nextSteps = buildNextSteps(report);
    return report;
  }

  report.connection.attempted = true;

  let scry: ScryInstance | null = null;
  try {
    scry = nativeModule.Scry.connect(pid);
    report.connection.connected = true;
  } catch (error) {
    report.connection.error = serializeError(error);
    report.nextSteps = buildNextSteps(report);
    return report;
  }

  report.modes.push(probeIl2Cpp(nativeModule, scry, options.metadataTargets));
  report.modes.push(probeMono(nativeModule, scry, options.monoImages));
  report.nextSteps = buildNextSteps(report);
  return report;
};

export const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const report = runProbe(options);

  summarizeToConsole(report);

  if (options.outPath) {
    writeReport(options.outPath, report);
    console.log(`report written to ${options.outPath}`);
  }
};

const invokedAsMain = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (invokedAsMain) {
  main();
}
