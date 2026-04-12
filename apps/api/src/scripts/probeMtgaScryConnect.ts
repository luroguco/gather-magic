import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

import { workspaceRoot } from "../lib/paths.js";
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

    if (arg === "--scry-addon" && nextArg) {
      options.scryAddonPath = nextArg.startsWith("/")
        ? nextArg
        : `${workspaceRoot}/${nextArg}`;
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

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  console.log(`[scry-connect] execPath=${process.execPath}`);
  console.log(`[scry-connect] addon=${options.scryAddonPath}`);
  const addon = require(options.scryAddonPath) as {
    Scry: {
      connect: (pid: number) => unknown;
    };
  };
  console.log("[scry-connect] addon-loaded");

  const pid = options.pid ?? findMtgaProcess(options.processPatterns).selectedPid;
  if (!pid) {
    throw new Error("Could not find an MTGA process.");
  }

  console.log(`[scry-connect] pid=${pid}`);
  console.log("[scry-connect] before-connect");
  const scry = addon.Scry.connect(pid);
  console.log("[scry-connect] after-connect");
  console.log(`[scry-connect] scry-type=${typeof scry}`);
};

main();
