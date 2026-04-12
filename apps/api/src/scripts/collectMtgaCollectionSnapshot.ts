import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { defaultProcessPatterns, findMtgaProcess } from "./probeMtgaRuntime.js";

const require = createRequire(import.meta.url);

const defaultScryAddonPath =
  "/Applications/Untapped.gg Companion.app/Contents/Resources/app.asar.unpacked/node_modules/untapped-scry/lib/binding/napi-v5/untapped-scry.node";
const signedHostEnvVar = "MTGA_SCRY_SIGNED_HOST";

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
    out: string;
    processPatterns: string[];
  } = {
    scryAddonPath: defaultScryAddonPath,
    out: "data/collector/latest-collector-snapshot.json",
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
      continue;
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

const ensureSignedNodeHost = () => {
  const outputDirectory = resolve("apps/api/out/node-probe");
  const signedNodePath = resolve(outputDirectory, "mtga_probe_node");
  const entitlementsPath = resolve("apps/api/src/native/mtga_debugger.entitlements.plist");

  mkdirSync(outputDirectory, { recursive: true });
  rmSync(signedNodePath, { force: true });
  copyFileSync(process.execPath, signedNodePath);

  const codesignResult = spawnSync(
    "codesign",
    ["--force", "--sign", "-", "--entitlements", entitlementsPath, signedNodePath],
    { stdio: "inherit" }
  );
  if (codesignResult.status !== 0) {
    throw new Error(`codesign failed with status ${codesignResult.status ?? "unknown"}.`);
  }

  return signedNodePath;
};

const runSignedHost = () => {
  const signedNodePath = ensureSignedNodeHost();
  const result = spawnSync(signedNodePath, process.argv.slice(1), {
    stdio: "inherit",
    env: {
      ...process.env,
      [signedHostEnvVar]: "1"
    }
  });

  process.exit(result.status ?? 1);
};

const main = () => {
  if (process.env[signedHostEnvVar] !== "1") {
    runSignedHost();
    return;
  }

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
  const cardsDictionary = context
    .getClass("WrapperController")
    .get("Instance") as ScryObjectHandle;

  if (!isObjectHandle(cardsDictionary)) {
    throw new Error("WrapperController.Instance is not an object handle.");
  }

  const inventoryManager = cardsDictionary.get("InventoryManager");
  if (!isObjectHandle(inventoryManager)) {
    throw new Error("WrapperController.Instance.InventoryManager is not an object handle.");
  }

  const inventoryServiceWrapper = inventoryManager.get("_inventoryServiceWrapper");
  if (!isObjectHandle(inventoryServiceWrapper)) {
    throw new Error("InventoryManager._inventoryServiceWrapper is not an object handle.");
  }

  const cards = inventoryServiceWrapper.get("Cards");
  if (!isObjectHandle(cards)) {
    throw new Error("Inventory service Cards field is not an object handle.");
  }

  const count = cards.get("_count");
  const entriesValue = cards.get("_entries");
  if (!isArrayLike(entriesValue)) {
    throw new Error("Cards._entries is not array-like.");
  }

  let entryClassName: string | null = null;
  let entryFieldNames: string[] = [];
  const collection: Record<string, number> = {};
  let rawEntryCount = 0;
  let filteredEntryCount = 0;

  for (let index = 0; index < entriesValue.length; index += 1) {
    const entry = entriesValue.at(index);
    if (!isObjectHandle(entry)) {
      continue;
    }

    if (!entryClassName && typeof entry.getClassName === "function") {
      entryClassName = entry.getClassName();
      const metadata = context.getClass(entryClassName);
      entryFieldNames = typeof metadata.getFieldNames === "function" ? metadata.getFieldNames() : [];
    }

    rawEntryCount += 1;
    const key = entry.get("key");
    const value = entry.get("value");

    if (typeof key !== "number" || typeof value !== "number") {
      continue;
    }

    if (key <= 0 || value <= 0) {
      continue;
    }

    collection[String(key)] = value;
    filteredEntryCount += 1;
  }

  const outputPath = resolve(options.out);
  const snapshot = {
    snapshotVersion: 1,
    capturedAt: new Date().toISOString(),
    platform: process.platform,
    collectorVersion: "local-scry-dictionary-v1",
    mtgaPid: pid,
    collection,
    diagnostics: {
      source: "WrapperController.Instance.InventoryManager._inventoryServiceWrapper.Cards",
      targetClassName: typeof cards.getClassName === "function" ? cards.getClassName() : null,
      targetBaseAddress: typeof cards.getBaseAddress === "function" ? cards.getBaseAddress() : null,
      dictionaryCount: count,
      entriesLength: entriesValue.length,
      rawEntryCount,
      filteredEntryCount,
      entryClassName,
      entryFieldNames
    }
  };

  writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));

  console.log("MTGA collector snapshot captured");
  console.log(`  output: ${outputPath}`);
  console.log(`  mtga pid: ${pid}`);
  console.log(`  raw dictionary entries: ${rawEntryCount.toLocaleString()}`);
  console.log(`  filtered owned grpIds: ${filteredEntryCount.toLocaleString()}`);
};

main();
