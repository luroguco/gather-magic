import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { packager } from "@electron/packager";
import { sign } from "@electron/osx-sign";

type PackageOptions = {
  arch: "arm64" | "x64" | "universal";
  signMode: "none" | "identity" | "adhoc";
};

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, "..");
const workspaceRoot = resolve(packageRoot, "../..");
const outputDirectory = resolve(packageRoot, "out/mac");
const productName = "MTGA Collector Spike";
const bundleId = "com.luroguco.mtga.collector.spike";
const rootEntitlementsPath = resolve(packageRoot, "build/entitlements.mac.plist");
const inheritEntitlementsPath = resolve(packageRoot, "build/entitlements.mac.inherit.plist");
const electronPackageRoot = resolve(workspaceRoot, "node_modules/electron");
const electronPackageJsonPath = resolve(electronPackageRoot, "package.json");
const electronAppPath = resolve(electronPackageRoot, "dist/Electron.app");

const parseArgs = (argv: string[]): PackageOptions => {
  const options: PackageOptions = {
    arch: process.arch === "arm64" || process.arch === "x64" ? process.arch : "arm64",
    signMode: "none"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextArg = argv[index + 1];

    if (arg === "--sign") {
      options.signMode = "identity";
      continue;
    }

    if (arg === "--adhoc-sign") {
      options.signMode = "adhoc";
      continue;
    }

    if (arg === "--arch" && nextArg) {
      if (nextArg === "arm64" || nextArg === "x64" || nextArg === "universal") {
        options.arch = nextArg;
      }
      index += 1;
    }
  }

  return options;
};

const shouldEnableHardenedRuntime = () => process.env.COLLECTOR_MAC_HARDENED_RUNTIME !== "0";

const buildOptionsForFile = (
  appPath: string,
  signMode: PackageOptions["signMode"]
) => (filePath: string) => ({
  entitlements: filePath === appPath ? rootEntitlementsPath : inheritEntitlementsPath,
  hardenedRuntime: shouldEnableHardenedRuntime(),
  ...(signMode === "adhoc"
    ? {
        timestamp: "none"
      }
    : {})
});

const debugInfoPlistExtension = {
  SecTaskAccess: ["allowed", "debug"]
};

const readPackageVersion = () => {
  const payload = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as { version?: string };
  return payload.version ?? "0.1.0";
};

const ensureBuildPrerequisites = () => {
  const requiredPaths = [
    resolve(packageRoot, "dist/main.js"),
    resolve(packageRoot, "dist/index.html"),
    resolve(workspaceRoot, "apps/api/dist/scripts/probeMtgaRuntime.js"),
    electronPackageJsonPath,
    electronAppPath
  ];

  for (const candidate of requiredPaths) {
    if (!existsSync(candidate)) {
      throw new Error(`Required build artifact missing: ${candidate}`);
    }
  }
};

const resolveLocalElectronVersion = () => {
  const payload = JSON.parse(readFileSync(electronPackageJsonPath, "utf8")) as { version?: string };
  if (!payload.version) {
    throw new Error(`Could not determine Electron version from ${electronPackageJsonPath}`);
  }

  return payload.version;
};

const ensureLocalElectronZip = (arch: PackageOptions["arch"], electronVersion: string) => {
  if (arch === "universal") {
    throw new Error("Offline local packaging does not support universal builds yet. Use --arch arm64 or --arch x64.");
  }

  const electronZipDirectory = resolve(outputDirectory, "electron-zips");
  const electronZipPath = resolve(electronZipDirectory, `electron-v${electronVersion}-darwin-${arch}.zip`);

  if (!existsSync(electronZipPath)) {
    mkdirSync(electronZipDirectory, { recursive: true });
    const zipResult = spawnSync(
      "ditto",
      ["-c", "-k", "--sequesterRsrc", "--keepParent", electronAppPath, electronZipPath],
      {
        encoding: "utf8"
      }
    );

    if (zipResult.status !== 0) {
      throw new Error(zipResult.stderr || `Failed to create local Electron zip at ${electronZipPath}`);
    }
  }

  return electronZipDirectory;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  ensureBuildPrerequisites();
  const electronVersion = resolveLocalElectronVersion();

  rmSync(outputDirectory, { recursive: true, force: true });
  const electronZipDir = ensureLocalElectronZip(options.arch, electronVersion);

  const appPaths = await packager({
    arch: options.arch,
    appBundleId: bundleId,
    appVersion: readPackageVersion(),
    asar: true,
    dir: packageRoot,
    executableName: productName,
    extendHelperInfo: debugInfoPlistExtension,
    extendInfo: debugInfoPlistExtension,
    name: productName,
    out: outputDirectory,
    overwrite: true,
    platform: "darwin",
    prune: true,
    electronVersion,
    electronZipDir,
    ignore: [
      /^\/build($|\/)/,
      /^\/out($|\/)/,
      /^\/README\.md$/,
      /^\/src($|\/)/,
      /^\/tsconfig\.json$/
    ]
  });

  const packagePath = appPaths[0];
  if (!packagePath) {
    throw new Error("Electron Packager did not return an app path.");
  }

  const appPath = resolve(packagePath, `${productName}.app`);
  if (!existsSync(appPath)) {
    throw new Error(`Packaged app bundle not found at ${appPath}`);
  }

  console.log(`Packaged app: ${appPath}`);

  if (options.signMode !== "none") {
    const identity = process.env.COLLECTOR_MAC_IDENTITY;
    const provisioningProfile = process.env.COLLECTOR_MAC_PROVISIONING_PROFILE;
    const usingAdHocSignature = options.signMode === "adhoc";

    await sign({
      app: appPath,
      ...(usingAdHocSignature
        ? {
            identity: "-",
            identityValidation: false,
            preAutoEntitlements: false,
            preEmbedProvisioningProfile: false
          }
        : {}),
      ...(!usingAdHocSignature && identity ? { identity } : {}),
      ...(!usingAdHocSignature && provisioningProfile ? { provisioningProfile } : {}),
      optionsForFile: buildOptionsForFile(appPath, options.signMode)
    });

    console.log(usingAdHocSignature ? "Ad hoc signing completed." : "Signing completed.");
  }

  console.log("To run the packaged probe from this repo:");
  console.log(
    `COLLECTOR_WORKSPACE_ROOT="${workspaceRoot}" "${appPath}/Contents/MacOS/${productName}" --run-runtime-probe`
  );
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
