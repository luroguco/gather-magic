import { createRequire } from "node:module";

import { defaultProcessPatterns, findMtgaProcess } from "./probeMtgaRuntime.js";

const require = createRequire(import.meta.url);

const defaultScryAddonPath =
  "/Applications/Untapped.gg Companion.app/Contents/Resources/app.asar.unpacked/node_modules/untapped-scry/lib/binding/napi-v5/untapped-scry.node";

const parseArgs = (argv: string[]) => {
  const options: {
    pid?: number;
    scryAddonPath: string;
    key: string;
    processPatterns: string[];
  } = {
    scryAddonPath: defaultScryAddonPath,
    key: "WrapperController",
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

    if (arg === "--key" && nextArg) {
      options.key = nextArg;
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

const describe = (value: unknown) => {
  const proto = value && typeof value === "object" ? Object.getPrototypeOf(value) : null;
  const ownKeys = value && typeof value === "object" ? Object.keys(value as Record<string, unknown>) : [];
  const prototypeKeys =
    proto && typeof proto === "object"
      ? Object.getOwnPropertyNames(proto).filter((name) => name !== "constructor")
      : [];
  const summary: Record<string, unknown> = {
    type: typeof value,
    ownKeys,
    prototypeKeys
  };

  if (value === null) {
    summary.value = null;
    return summary;
  }

  if (typeof value === "number") {
    summary.value = value;
    if (Number.isFinite(value) && value >= 0) {
      summary.hex = `0x${Math.trunc(value).toString(16)}`;
    }
    return summary;
  }

  if (typeof value === "string" || typeof value === "boolean" || typeof value === "bigint") {
    summary.value = value;
    return summary;
  }

  return summary;
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const addon = require(options.scryAddonPath) as {
    Scry: {
      connect: (pid: number) => unknown;
    };
    Il2CppScry: new (scry: unknown, options?: Record<string, unknown>) => {
      getMetadataContext: (target?: string) => {
        getValue: (key: string) => unknown;
      };
    };
  };

  const pid = options.pid ?? findMtgaProcess(options.processPatterns).selectedPid;
  if (!pid) {
    throw new Error("Could not find an MTGA process.");
  }

  const scry = addon.Scry.connect(pid);
  const il2cpp = new addon.Il2CppScry(scry, { enumerateProperties: false });
  const context = il2cpp.getMetadataContext();

  console.log(`[scry-get-value] pid=${pid}`);
  console.log(`[scry-get-value] key=${options.key}`);
  const value = context.getValue(options.key);
  console.log(JSON.stringify(describe(value), null, 2));
};

main();
