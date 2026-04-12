import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { defaultProcessPatterns, findMtgaProcess } from "./probeMtgaRuntime.js";

const require = createRequire(import.meta.url);

const defaultScryAddonPath =
  "/Applications/Untapped.gg Companion.app/Contents/Resources/app.asar.unpacked/node_modules/untapped-scry/lib/binding/napi-v5/untapped-scry.node";

type ScryObjectHandle = {
  get: (fieldName: string) => unknown;
  getBaseAddress?: () => number;
  getClassName?: () => string;
};

type ScryArrayLike = {
  length: number;
  at: (index: number) => unknown;
};

const parseArgs = (argv: string[]) => {
  const options: {
    pid?: number;
    scryAddonPath: string;
    key?: string;
    className?: string;
    fieldName?: string;
    chain: string[];
    limit: number;
    out?: string;
    processPatterns: string[];
  } = {
    scryAddonPath: defaultScryAddonPath,
    className: "WrapperController",
    fieldName: "Instance",
    chain: ["InventoryManager", "_inventoryServiceWrapper", "Cards"],
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

    if (arg === "--chain" && nextArg) {
      options.chain = nextArg
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
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

    if (arg === "--out" && nextArg) {
      options.out = nextArg;
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

const isObjectHandle = (value: unknown): value is ScryObjectHandle =>
  Boolean(value) && typeof value === "object" && typeof (value as ScryObjectHandle).get === "function";

const isArrayLike = (value: unknown): value is ScryArrayLike =>
  Boolean(value) &&
  typeof value === "object" &&
  typeof (value as ScryArrayLike).length === "number" &&
  typeof (value as ScryArrayLike).at === "function";

const summarizeValue = (value: unknown) => {
  if (value === null) {
    return { type: "object", value: null };
  }

  if (typeof value === "number") {
    return {
      type: "number",
      value,
      hex: Number.isFinite(value) && value >= 0 ? `0x${Math.trunc(value).toString(16)}` : undefined
    };
  }

  if (typeof value === "string" || typeof value === "boolean" || typeof value === "bigint") {
    return { type: typeof value, value };
  }

  if (isObjectHandle(value)) {
    const className = typeof value.getClassName === "function" ? value.getClassName() : null;
    const baseAddress = typeof value.getBaseAddress === "function" ? value.getBaseAddress() : null;

    return {
      type: "object",
      objectClassName: className,
      baseAddress,
      baseAddressHex:
        typeof baseAddress === "number" && Number.isFinite(baseAddress) && baseAddress >= 0
          ? `0x${Math.trunc(baseAddress).toString(16)}`
          : undefined
    };
  }

  if (isArrayLike(value)) {
    return {
      type: "object",
      length: value.length,
      arrayLike: true
    };
  }

  return { type: typeof value };
};

const resolveTarget = (
  context: {
    getClass: (name: string) => {
      get: (fieldName: string) => unknown;
    };
    getValue: (key: string) => unknown;
  },
  options: ReturnType<typeof parseArgs>
) => {
  let target: unknown;
  let source: string;

  if (options.key) {
    target = context.getValue(options.key);
    source = options.key;
  } else if (options.className && options.fieldName) {
    target = context.getClass(options.className).get(options.fieldName);
    source = `${options.className}.${options.fieldName}`;
  } else {
    throw new Error("Provide either --key or both --class and --field.");
  }

  for (const segment of options.chain) {
    if (!isObjectHandle(target)) {
      throw new Error(`Cannot traverse '${segment}' because the current value is not an object handle.`);
    }

    target = target.get(segment);
    source = `${source}.${segment}`;
  }

  return { source, target };
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
  const { source, target } = resolveTarget(context, options);

  if (!isObjectHandle(target)) {
    throw new Error(`Target '${source}' is not a dictionary-like object handle.`);
  }

  const count = target.get("_count");
  const entriesValue = target.get("_entries");
  if (!isArrayLike(entriesValue)) {
    throw new Error(`Target '${source}' does not expose an array-like _entries field.`);
  }

  const records: Array<Record<string, unknown>> = [];
  const numericMap: Record<string, number> = {};
  let entryClassName: string | null = null;
  let entryFieldNames: string[] = [];
  let activeEntries = 0;

  for (let index = 0; index < entriesValue.length; index += 1) {
    const entry = entriesValue.at(index);
    if (!isObjectHandle(entry)) {
      continue;
    }

    if (!entryClassName && typeof entry.getClassName === "function") {
      entryClassName = entry.getClassName();
      const entryMetadata = context.getClass(entryClassName);
      entryFieldNames = typeof entryMetadata.getFieldNames === "function" ? entryMetadata.getFieldNames() : [];
    }

    const fieldsToRead = entryFieldNames.length > 0 ? entryFieldNames : ["hashCode", "next", "key", "value"];
    const record: Record<string, unknown> = { index };

    for (const fieldName of fieldsToRead) {
      try {
        record[fieldName] = summarizeValue(entry.get(fieldName));
      } catch (error) {
        record[fieldName] = {
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    const hashCodeValue =
      typeof record.hashCode === "object" && record.hashCode !== null && "value" in record.hashCode
        ? (record.hashCode as { value?: unknown }).value
        : undefined;

    if (typeof hashCodeValue === "number" && hashCodeValue < 0) {
      continue;
    }

    activeEntries += 1;
    if (records.length < options.limit) {
      records.push(record);
    }

    const keyValue =
      typeof record.key === "object" && record.key !== null && "value" in record.key
        ? (record.key as { value?: unknown }).value
        : undefined;
    const valueValue =
      typeof record.value === "object" && record.value !== null && "value" in record.value
        ? (record.value as { value?: unknown }).value
        : undefined;

    if (typeof keyValue === "number" && typeof valueValue === "number") {
      numericMap[String(keyValue)] = valueValue;
    }
  }

  const summary = {
    pid,
    source,
    targetClassName: typeof target.getClassName === "function" ? target.getClassName() : null,
    targetBaseAddress: typeof target.getBaseAddress === "function" ? target.getBaseAddress() : null,
    count,
    entriesLength: entriesValue.length,
    activeEntries,
    entryClassName,
    entryFieldNames,
    sample: records,
    numericMapCount: Object.keys(numericMap).length
  };

  if (options.out) {
    const outputPath = resolve(options.out);
    writeFileSync(
      outputPath,
      JSON.stringify(
        {
          ...summary,
          numericMap
        },
        null,
        2
      )
    );
    console.log(`[scry-dictionary] wrote ${outputPath}`);
  }

  console.log(JSON.stringify(summary, null, 2));
};

main();
