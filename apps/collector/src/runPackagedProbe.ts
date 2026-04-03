import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, "..");
const workspaceRoot = resolve(packageRoot, "../..");
const outputDirectory = resolve(packageRoot, "out/mac");
const productName = "MTGA Collector Spike";

const findLatestPackagedApp = () => {
  if (!existsSync(outputDirectory)) {
    throw new Error(`Packaged output directory not found: ${outputDirectory}`);
  }

  const candidates = readdirSync(outputDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(outputDirectory, entry.name, `${productName}.app`))
    .filter((candidate) => existsSync(candidate))
    .map((candidate) => ({
      path: candidate,
      modifiedAt: statSync(candidate).mtimeMs
    }))
    .sort((left, right) => right.modifiedAt - left.modifiedAt);

  return candidates[0]?.path ?? null;
};

const main = async () => {
  const appPath = findLatestPackagedApp();
  if (!appPath) {
    throw new Error(`No packaged app found under ${outputDirectory}. Run "npm run package:mac -w @mtga/collector" first.`);
  }

  const binaryPath = resolve(appPath, "Contents/MacOS", productName);
  const child = spawn(binaryPath, [], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      COLLECTOR_AUTO_RUN_RUNTIME_PROBE: "1",
      COLLECTOR_WORKSPACE_ROOT: workspaceRoot
    },
    stdio: "inherit"
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`Packaged probe exited with status ${code ?? "unknown"}.`));
    });
  });
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
