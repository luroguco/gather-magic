import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

export const packageRoot = resolve(currentDir, "../../");
export const workspaceRoot = resolve(packageRoot, "../..");
export const dataDirectory = process.env.MTGA_DATA_DIR
  ? resolve(process.env.MTGA_DATA_DIR)
  : resolve(workspaceRoot, "data");
export const databasePath = resolve(dataDirectory, "mtga.sqlite");
