import { resolve } from "node:path";

import {
  UNTAPPED_CAPTURE_SNIPPET,
  resolveUntappedCapturePaths,
  setUntappedDevToolsEnabled
} from "../services/untappedCaptureHelper.js";

type CliOptions = {
  enable: boolean;
  disable: boolean;
  configPath?: string;
};

const parseArgs = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    enable: false,
    disable: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextArg = argv[index + 1];

    if (arg === "--enable") {
      options.enable = true;
      continue;
    }

    if (arg === "--disable") {
      options.disable = true;
      continue;
    }

    if (arg === "--config" && nextArg) {
      options.configPath = resolve(process.cwd(), nextArg);
      index += 1;
    }
  }

  return options;
};

const printSnippet = () => {
  console.log("");
  console.log("Untapped DevTools snippet");
  console.log("  Paste this into the Untapped renderer console:");
  console.log(UNTAPPED_CAPTURE_SNIPPET);
  console.log("");
  console.log("Next local steps");
  console.log("  1. Restart Untapped.gg Companion.");
  console.log("  2. Leave MTGA open in Deck Builder with your owned-card view visible.");
  console.log("  3. Open the Untapped window DevTools console and run the snippet above.");
  console.log(
    "  4. Normalize the downloaded file with `npm run normalize:untapped-dump -- --input <file> --out data/untapped-collection-normalized.json`.",
  );
  console.log(
    "  5. Compare it against the CSV with `npm run compare:collection -- --ownership-json data/untapped-collection-normalized.json`.",
  );
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const { configPath } = resolveUntappedCapturePaths(
    options.configPath ? { configPath: options.configPath } : undefined
  );

  if (options.enable === options.disable) {
    throw new Error("Pass exactly one of --enable or --disable.");
  }

  const nextValue = options.enable;
  const result = setUntappedDevToolsEnabled(
    nextValue,
    options.configPath ? { configPath: options.configPath } : undefined
  );

  if (!result.changed) {
    console.log(`showDevTools is already ${nextValue ? "enabled" : "disabled"} in ${configPath}`);
  } else {
    console.log(`Updated ${configPath}`);
    console.log(`  showDevTools: ${nextValue}`);
    console.log(`  backup: ${configPath}.bak`);
  }

  if (nextValue) {
    printSnippet();
  } else {
    console.log("");
    console.log("Restart Untapped.gg Companion to close future auto-opened DevTools windows.");
  }
};

main();
