import { spawnSync } from "node:child_process";

export type ProcessMatch = {
  pid: number;
  label: string;
  sourcePattern: string;
};

export type ProcessLookupResult = {
  method: string;
  selectedPid: number | null;
  matches: ProcessMatch[];
  errors: string[];
};

export const defaultProcessPatterns = ["MTGA", "Magic The Gathering Arena"];

export const shouldIgnoreProcessMatch = (match: ProcessMatch) =>
  /untapped|helper|companion/i.test(match.label) ||
  /(^|\s)node(\s|$)/i.test(match.label) ||
  /mtga_probe_node|node-probe|collectMtgaCollectionSnapshot/i.test(match.label) ||
  /concurrently|tsx|npm run dev|node_modules\/\.bin/i.test(match.label);

export const findMtgaProcess = (patterns: string[]): ProcessLookupResult => {
  if (process.platform !== "darwin" && process.platform !== "linux") {
    return {
      method: "unsupported-platform",
      selectedPid: null,
      matches: [],
      errors: [
        `Automatic process lookup is not implemented for ${process.platform}. Use --pid.`
      ]
    };
  }

  const matches: ProcessMatch[] = [];
  const errors: string[] = [];

  for (const pattern of patterns) {
    const result = spawnSync("pgrep", ["-ifl", pattern], {
      encoding: "utf8"
    });
    if (result.error) {
      errors.push(`pgrep ${JSON.stringify(pattern)} failed: ${result.error.message}`);
      continue;
    }
    if (result.status !== 0 && !result.stdout.trim()) {
      continue;
    }

    for (const line of result.stdout.split(/\r?\n/)) {
      const match = line.trim().match(/^(\d+)\s+(.*)$/);
      if (!match) {
        continue;
      }
      const pid = Number.parseInt(match[1]!, 10);
      if (!Number.isFinite(pid)) {
        continue;
      }
      matches.push({
        pid,
        label: match[2] ?? "",
        sourcePattern: pattern
      });
    }
  }

  const seen = new Set<number>();
  const dedupedMatches = matches.filter((match) => {
    if (seen.has(match.pid) || shouldIgnoreProcessMatch(match)) {
      return false;
    }
    seen.add(match.pid);
    return true;
  });

  return {
    method: "pgrep",
    selectedPid: dedupedMatches[0]?.pid ?? null,
    matches: dedupedMatches,
    errors
  };
};
