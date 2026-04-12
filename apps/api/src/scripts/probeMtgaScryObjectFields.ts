import { createRequire } from "node:module";

import { defaultProcessPatterns, findMtgaProcess } from "./probeMtgaRuntime.js";

const require = createRequire(import.meta.url);

const defaultScryAddonPath =
  "/Applications/Untapped.gg Companion.app/Contents/Resources/app.asar.unpacked/node_modules/untapped-scry/lib/binding/napi-v5/untapped-scry.node";

type ScryObjectHandle = {
  get: (fieldName: string) => unknown;
  getBaseAddress?: () => number;
  getClassName?: () => string;
};

const parseArgs = (argv: string[]) => {
  const options: {
    pid?: number;
    scryAddonPath: string;
    key?: string;
    className?: string;
    fieldName?: string;
    chain: string[];
    limit?: number;
    processPatterns: string[];
  } = {
    scryAddonPath: defaultScryAddonPath,
    key: "WrapperController.Instance",
    chain: [],
    limit: 20,
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

    if (arg === "--class" && nextArg) {
      options.className = nextArg;
      index += 1;
      continue;
    }

    if (arg === "--field" && nextArg) {
      options.fieldName = nextArg;
      index += 1;
      continue;
    }

    if (arg === "--limit" && nextArg) {
      const parsed = Number.parseInt(nextArg, 10);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        options.limit = parsed;
      }
      index += 1;
      continue;
    }

    if (arg === "--chain" && nextArg) {
      options.chain = nextArg
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
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

  if (typeof value === "object" && value !== null) {
    const maybeHandle = value as ScryObjectHandle;
    if (typeof maybeHandle.getClassName === "function") {
      summary.objectClassName = maybeHandle.getClassName();
    }
    if (typeof maybeHandle.getBaseAddress === "function") {
      const baseAddress = maybeHandle.getBaseAddress();
      summary.baseAddress = baseAddress;
      if (Number.isFinite(baseAddress) && baseAddress >= 0) {
        summary.baseAddressHex = `0x${Math.trunc(baseAddress).toString(16)}`;
      }
    }
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
        getClass: (name: string) => {
          getFieldNames?: () => string[];
          get: (fieldName: string) => unknown;
        };
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

  let target: unknown;
  let sourceDescription: string;
  if (options.className && options.fieldName) {
    target = context.getClass(options.className).get(options.fieldName);
    sourceDescription = `${options.className}.${options.fieldName}`;
  } else if (options.key) {
    target = context.getValue(options.key);
    sourceDescription = options.key;
  } else {
    throw new Error("Provide either --key or both --class and --field.");
  }

  for (const segment of options.chain) {
    if (!target || typeof target !== "object") {
      throw new Error(`Cannot traverse '${segment}' because the current value is not an object handle.`);
    }

    const handle = target as ScryObjectHandle;
    if (typeof handle.get !== "function") {
      throw new Error(`Cannot traverse '${segment}' because the current object does not expose get(fieldName).`);
    }

    target = handle.get(segment);
    sourceDescription = `${sourceDescription}.${segment}`;
  }

  if (!target || typeof target !== "object") {
    console.log(`[scry-object-fields] pid=${pid}`);
    console.log(`[scry-object-fields] source=${sourceDescription}`);
    console.log(JSON.stringify({ source: sourceDescription, ...describe(target) }, null, 2));
    return;
  }

  const handle = target as ScryObjectHandle;
  if (typeof handle.get !== "function" || typeof handle.getClassName !== "function") {
    console.log(`[scry-object-fields] pid=${pid}`);
    console.log(`[scry-object-fields] source=${sourceDescription}`);
    console.log(JSON.stringify({ source: sourceDescription, ...describe(target) }, null, 2));
    return;
  }

  const className = handle.getClassName();
  const classMetadata = context.getClass(className);
  const fieldNames = typeof classMetadata.getFieldNames === "function" ? classMetadata.getFieldNames() : [];
  const targetFields = options.limit === 0 ? fieldNames : fieldNames.slice(0, options.limit);

  console.log(`[scry-object-fields] pid=${pid}`);
  console.log(`[scry-object-fields] source=${sourceDescription}`);
  console.log(`[scry-object-fields] object-class=${className}`);
  if (typeof handle.getBaseAddress === "function") {
    const baseAddress = handle.getBaseAddress();
    console.log(`[scry-object-fields] base-address=${baseAddress}`);
    console.log(`[scry-object-fields] base-address-hex=0x${Math.trunc(baseAddress).toString(16)}`);
  }
  console.log(`[scry-object-fields] field-count=${fieldNames.length}`);
  console.log(`[scry-object-fields] fields=${JSON.stringify(fieldNames)}`);

  for (const fieldName of targetFields) {
    try {
      const value = handle.get(fieldName);
      console.log(JSON.stringify({ field: fieldName, ...describe(value) }));
    } catch (error) {
      console.log(
        JSON.stringify({
          field: fieldName,
          error: error instanceof Error ? error.message : String(error)
        })
      );
    }
  }
};

main();
