import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const roots = ["apps", "packages", "docs"];
const violations = [];

const visit = async (path) => {
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "dist" || entry.name === "node_modules" || entry.name === "out") {
      continue;
    }

    const childPath = join(path, entry.name);
    if (entry.isDirectory()) {
      await visit(childPath);
      continue;
    }

    if (entry.name.includes(" (1)")) {
      violations.push(childPath);
    }

    if (
      childPath.startsWith(join("apps", "web", "src")) &&
      (extname(entry.name) === ".js" || entry.name.endsWith(".d.ts"))
    ) {
      violations.push(childPath);
    }
  }
};

for (const root of roots) {
  await visit(root);
}

if (violations.length > 0) {
  throw new Error(`Generated or duplicate source artifacts found:\n${violations.sort().join("\n")}`);
}

console.log("Source hygiene checks passed.");
