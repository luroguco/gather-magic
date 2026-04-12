import { createRequire } from "node:module";

import { defaultProcessPatterns, findMtgaProcess } from "./probeMtgaRuntime.js";

const require = createRequire(import.meta.url);

const defaultScryAddonPath =
  "/Applications/Untapped.gg Companion.app/Contents/Resources/app.asar.unpacked/node_modules/untapped-scry/lib/binding/napi-v5/untapped-scry.node";

const parseArgs = (argv: string[]) => {
  const options: {
    pid?: number;
    scryAddonPath: string;
    processPatterns: string[];
  } = {
    scryAddonPath: defaultScryAddonPath,
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

const runConstructor = (label: string, factory: () => unknown) => {
  console.log(`[scry-modes] before-${label}`);
  const value = factory();
  console.log(`[scry-modes] after-${label} type=${typeof value}`);
  return value;
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const addon = require(options.scryAddonPath) as {
    Scry: {
      connect: (pid: number) => unknown;
    };
    Il2CppScry: new (scry: unknown, options?: Record<string, unknown>) => unknown;
    MonoScry: new (scry: unknown, options?: Record<string, unknown>) => unknown;
  };

  const pid = options.pid ?? findMtgaProcess(options.processPatterns).selectedPid;
  if (!pid) {
    throw new Error("Could not find an MTGA process.");
  }

  console.log(`[scry-modes] pid=${pid}`);
  const scry = runConstructor("connect", () => addon.Scry.connect(pid));
  runConstructor("il2cpp-with-options", () => new addon.Il2CppScry(scry, { enumerateProperties: false }));
  runConstructor("il2cpp-without-options", () => new addon.Il2CppScry(scry));
  runConstructor("mono-with-options", () => new addon.MonoScry(scry, { enumerateProperties: false }));
  runConstructor("mono-without-options", () => new addon.MonoScry(scry));
};

main();
