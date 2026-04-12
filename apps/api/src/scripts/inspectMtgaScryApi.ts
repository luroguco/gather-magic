import { createRequire } from "node:module";

import { defaultProcessPatterns, findMtgaProcess } from "./probeMtgaRuntime.js";

const require = createRequire(import.meta.url);

const defaultScryAddonPath =
  "/Applications/Untapped.gg Companion.app/Contents/Resources/app.asar.unpacked/node_modules/untapped-scry/lib/binding/napi-v5/untapped-scry.node";

const parseArgs = (argv: string[]) => {
  const options: {
    pid?: number;
    scryAddonPath: string;
    className: string;
    processPatterns: string[];
  } = {
    scryAddonPath: defaultScryAddonPath,
    className: "WrapperController",
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

    if (arg === "--class" && nextArg) {
      options.className = nextArg;
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

const describe = (label: string, value: unknown) => {
  const proto = value && typeof value === "object" ? Object.getPrototypeOf(value) : null;
  const ownKeys = value && typeof value === "object" ? Object.keys(value as Record<string, unknown>) : [];
  const prototypeKeys =
    proto && typeof proto === "object"
      ? Object.getOwnPropertyNames(proto).filter((name) => name !== "constructor")
      : [];

  console.log(`\n[inspect] ${label}`);
  console.log(`type=${typeof value}`);
  console.log(`ownKeys=${JSON.stringify(ownKeys)}`);
  console.log(`prototypeKeys=${JSON.stringify(prototypeKeys)}`);
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const addon = require(options.scryAddonPath) as {
    Scry: {
      connect: (pid: number) => unknown;
    };
    Il2CppScry: new (scry: unknown, options?: Record<string, unknown>) => {
      getMetadataContext: (target?: string) => {
        getClass: (name: string) => unknown;
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
  const cls = context.getClass(options.className);

  describe("scry", scry);
  describe("il2cpp", il2cpp);
  describe("context", context);
  describe(`class:${options.className}`, cls);
};

main();
