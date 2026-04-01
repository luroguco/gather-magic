import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { workspaceRoot } from "../lib/paths.js";
import { defaultProcessPatterns, findMtgaProcess } from "./probeMtgaRuntime.js";

type CliOptions = {
  pid?: number;
  outPath: string;
  assemblyNames: string[];
  classPatterns: string[];
  exactClasses: string[];
  includeFields: boolean;
  allowDebuggerAttach: boolean;
};

const defaultAssemblyNames = ["Assembly-CSharp.dll", "SharedClientCore.dll"];
const defaultClassPatterns = ["collection", "inventory", "deckbuilder", "pantry", "wrapper"];

const quoteForLldb = (value: string) => JSON.stringify(value);

const parseArgs = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    outPath: resolve(workspaceRoot, "data/mtga-lldb-collector-report.json"),
    assemblyNames: [...defaultAssemblyNames],
    classPatterns: [...defaultClassPatterns],
    exactClasses: [],
    includeFields: false,
    allowDebuggerAttach: false,
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

    if (arg === "--assemblies" && nextArg) {
      options.assemblyNames = nextArg
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }

    if (arg === "--patterns" && nextArg) {
      options.classPatterns = nextArg
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }

    if (arg === "--classes" && nextArg) {
      options.exactClasses = nextArg
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      options.classPatterns = [];
      index += 1;
      continue;
    }

    if (arg === "--include-fields") {
      options.includeFields = true;
      continue;
    }

    if (arg === "--allow-debugger-attach") {
      options.allowDebuggerAttach = true;
    }
  }

  return options;
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));

  if (!options.allowDebuggerAttach) {
    throw new Error(
      "Refusing to attach LLDB by default. This probe caused MTGA/Epic crashes on macOS. Re-run with --allow-debugger-attach only if you explicitly want the debugger-risking path."
    );
  }

  const pid = options.pid ?? findMtgaProcess(defaultProcessPatterns).selectedPid;

  if (!pid) {
    throw new Error("Could not find a live MTGA process. Launch Arena and rerun, or pass --pid <pid>.");
  }

  const pythonScriptPath = resolve(workspaceRoot, "apps/api/src/scripts/mtgaLldbCollector.py");
  const outPath = options.outPath;
  mkdirSync(dirname(outPath), { recursive: true });

  const lldbArgs = [
    "-p",
    String(pid),
    "--batch",
    "-o",
    `command script import ${quoteForLldb(pythonScriptPath)}`,
    "-o",
    `mtga_collect_json --out ${quoteForLldb(outPath)} --assemblies ${options.assemblyNames.join(",")}${options.classPatterns.length > 0 ? ` --patterns ${options.classPatterns.join(",")}` : ""}${options.exactClasses.length > 0 ? ` --classes ${options.exactClasses.join(",")}` : ""}${options.includeFields ? " --include-fields" : ""}`,
    "-o",
    "detach",
    "-o",
    "quit",
  ];

  const result = spawnSync("lldb", lldbArgs, {
    cwd: workspaceRoot,
    encoding: "utf8",
  });

  if (result.stdout.trim()) {
    process.stdout.write(result.stdout);
    if (!result.stdout.endsWith("\n")) {
      process.stdout.write("\n");
    }
  }

  if (result.stderr.trim()) {
    process.stderr.write(result.stderr);
    if (!result.stderr.endsWith("\n")) {
      process.stderr.write("\n");
    }
  }

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`lldb exited with status ${result.status ?? "unknown"}`);
  }

  const payload = JSON.parse(readFileSync(outPath, "utf8")) as {
    matches?: Array<{ qualifiedName: string; assembly: string; fieldNames?: string[] }>;
    errors?: string[];
    exactClassesRequested?: string[];
    unmatchedExactClasses?: string[];
  };

  console.log(`collector report: ${outPath}`);
  console.log(`matching classes: ${payload.matches?.length ?? 0}`);
  if ((payload.exactClassesRequested?.length ?? 0) > 0) {
    console.log(`exact classes requested: ${payload.exactClassesRequested?.join(", ")}`);
  }

  for (const match of payload.matches?.slice(0, 12) ?? []) {
    const fieldPreview = (match.fieldNames ?? []).slice(0, 6).join(", ");
    console.log(`  - ${match.qualifiedName} [${match.assembly}]${fieldPreview ? ` -> ${fieldPreview}` : ""}`);
  }

  const unmatchedExactClasses = payload.unmatchedExactClasses ?? [];
  if (unmatchedExactClasses.length > 0) {
    console.log(`unmatched exact classes: ${unmatchedExactClasses.join(", ")}`);
  }

  if ((payload.errors?.length ?? 0) > 0) {
    console.log("errors:");
    for (const entry of payload.errors ?? []) {
      console.log(`  - ${entry}`);
    }
  }
};

main();
