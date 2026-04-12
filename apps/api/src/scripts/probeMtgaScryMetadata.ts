import { createRequire } from "node:module";

import { defaultProcessPatterns, findMtgaProcess } from "./probeMtgaRuntime.js";

const require = createRequire(import.meta.url);

const defaultScryAddonPath =
  "/Applications/Untapped.gg Companion.app/Contents/Resources/app.asar.unpacked/node_modules/untapped-scry/lib/binding/napi-v5/untapped-scry.node";

const parseArgs = (argv: string[]) => {
  const options: {
    pid?: number;
    scryAddonPath: string;
    metadataTarget?: string;
    monoImage?: string;
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

    if (arg === "--metadata-target" && nextArg) {
      options.metadataTarget = nextArg;
      index += 1;
      continue;
    }

    if (arg === "--mono-image" && nextArg) {
      options.monoImage = nextArg;
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
        };
      };
    };
    MonoScry: new (scry: unknown, options?: Record<string, unknown>) => {
      getMonoImage: (target?: string) => {
        getClass: (name: string) => {
          getFieldNames?: () => string[];
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
  const mono = new addon.MonoScry(scry, { enumerateProperties: false });

  console.log(`[scry-metadata] pid=${pid}`);
  console.log(`[scry-metadata] metadata-target=${options.metadataTarget ?? "<default>"}`);
  console.log(`[scry-metadata] mono-image=${options.monoImage ?? "<default>"}`);
  console.log(`[scry-metadata] class=${options.className}`);

  console.log("[scry-metadata] before-il2cpp-context");
  const il2cppContext = options.metadataTarget
    ? il2cpp.getMetadataContext(options.metadataTarget)
    : il2cpp.getMetadataContext();
  console.log("[scry-metadata] after-il2cpp-context");

  console.log("[scry-metadata] before-il2cpp-class");
  const il2cppClass = il2cppContext.getClass(options.className);
  console.log("[scry-metadata] after-il2cpp-class");

  console.log("[scry-metadata] before-il2cpp-fields");
  const il2cppFields = typeof il2cppClass.getFieldNames === "function" ? il2cppClass.getFieldNames() : [];
  console.log(`[scry-metadata] after-il2cpp-fields count=${il2cppFields.length}`);

  console.log("[scry-metadata] before-mono-image");
  const monoImage = options.monoImage ? mono.getMonoImage(options.monoImage) : mono.getMonoImage();
  console.log("[scry-metadata] after-mono-image");

  console.log("[scry-metadata] before-mono-class");
  const monoClass = monoImage.getClass(options.className);
  console.log("[scry-metadata] after-mono-class");

  console.log("[scry-metadata] before-mono-fields");
  const monoFields = typeof monoClass.getFieldNames === "function" ? monoClass.getFieldNames() : [];
  console.log(`[scry-metadata] after-mono-fields count=${monoFields.length}`);
};

main();
