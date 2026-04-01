import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import { parse as parseCsv } from "csv-parse/sync";

import { workspaceRoot } from "../lib/paths.js";

type CsvRow = {
  Id: string;
  Name: string;
  Set: string;
  Color: string;
  Rarity: string;
  Count: string;
  PrintCount: string;
};

type VariantRow = {
  set: string;
  count: number;
  printCount: number;
};

type CsvNameSummary = {
  maxCount: number;
  sumPrintCount: number;
  rows: VariantRow[];
};

type CsvSummary = {
  path: string;
  totalRows: number;
  ownedCountRows: number;
  ownedPrintRows: number;
  rawCountTotal: number;
  rawPrintCountTotal: number;
  uniqueOwnedNames: number;
  titleLevelOwnedTotal: number;
  byName: Map<string, CsvNameSummary>;
};

type StartHookSnapshot = {
  lineNumber: number;
  data: Record<string, unknown>;
};

type LogSummary = {
  path: string;
  startHookCount: number;
  latestStartHook?: {
    lineNumber: number;
    rootKeys: string[];
    inventoryKeys: string[];
    gold: number | null;
    gems: number | null;
    deckCount: number | null;
    deckSummaryCount: number | null;
    candidateCollectionPaths: string[];
  };
};

type OwnershipEntry = {
  name: string;
  titleCount: number;
  printCount?: number;
};

type OwnershipComparison = {
  path: string;
  uniqueNames: number;
  titleLevelOwnedTotal: number;
  printLevelOwnedTotal: number | null;
  missingFromProbe: string[];
  extraInProbe: string[];
  mismatchedTitleCounts: Array<{
    name: string;
    csvCount: number;
    probeCount: number;
  }>;
};

type CliOptions = {
  csvPath?: string;
  logPath?: string;
  ownershipJsonPath?: string;
};

const defaultCsvCandidates = [
  resolve(workspaceRoot, "Kodo Collection.csv"),
  resolve(workspaceRoot, "Kodo Collect.csv"),
];

const defaultLogCandidates = [
  resolve(workspaceRoot, "Player.log"),
  resolve(workspaceRoot, "Player-prev.log"),
];

const parseArgs = (argv: string[]): CliOptions => {
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextArg = argv[index + 1];

    if (arg === "--csv" && nextArg) {
      options.csvPath = resolve(process.cwd(), nextArg);
      index += 1;
      continue;
    }

    if (arg === "--log" && nextArg) {
      options.logPath = resolve(process.cwd(), nextArg);
      index += 1;
      continue;
    }

    if (arg === "--ownership-json" && nextArg) {
      options.ownershipJsonPath = resolve(process.cwd(), nextArg);
      index += 1;
      continue;
    }
  }

  return options;
};

const firstExisting = (candidates: string[]): string | undefined =>
  candidates.find((candidate) => existsSync(candidate));

const toInt = (value: string | undefined) => Number.parseInt(value ?? "0", 10) || 0;

const formatNumber = (value: number | null) => (value == null ? "n/a" : value.toLocaleString());

const summarizeCsv = (path: string): CsvSummary => {
  const rows = parseCsv(readFileSync(path, "utf8"), {
    bom: true,
    columns: true,
    skip_empty_lines: true,
  }) as CsvRow[];

  const byName = new Map<string, CsvNameSummary>();

  let ownedCountRows = 0;
  let ownedPrintRows = 0;
  let rawCountTotal = 0;
  let rawPrintCountTotal = 0;

  for (const row of rows) {
    const count = toInt(row.Count);
    const printCount = toInt(row.PrintCount);

    rawCountTotal += count;
    rawPrintCountTotal += printCount;

    if (count > 0) {
      ownedCountRows += 1;
    }

    if (printCount > 0) {
      ownedPrintRows += 1;
    }

    if (count <= 0 && printCount <= 0) {
      continue;
    }

    const existing = byName.get(row.Name) ?? {
      maxCount: 0,
      sumPrintCount: 0,
      rows: [],
    };

    existing.maxCount = Math.max(existing.maxCount, count);
    existing.sumPrintCount += printCount;
    existing.rows.push({
      set: row.Set,
      count,
      printCount,
    });

    byName.set(row.Name, existing);
  }

  const titleLevelOwnedTotal = [...byName.values()].reduce((total, entry) => total + entry.maxCount, 0);

  return {
    path,
    totalRows: rows.length,
    ownedCountRows,
    ownedPrintRows,
    rawCountTotal,
    rawPrintCountTotal,
    uniqueOwnedNames: byName.size,
    titleLevelOwnedTotal,
    byName,
  };
};

const extractStartHookSnapshots = (path: string): StartHookSnapshot[] => {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const snapshots: StartHookSnapshot[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index]?.includes("<== StartHook(")) {
      continue;
    }

    const payloadLine = lines[index + 1];
    if (!payloadLine?.trim().startsWith("{")) {
      continue;
    }

    try {
      const data = JSON.parse(payloadLine) as Record<string, unknown>;
      snapshots.push({
        lineNumber: index + 2,
        data,
      });
    } catch {
      // Ignore malformed payloads and keep scanning.
    }
  }

  return snapshots;
};

const collectCandidateCollectionPaths = (value: unknown, prefix = ""): string[] => {
  if (value == null || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectCandidateCollectionPaths(item, `${prefix}[${index}]`));
  }

  const results: string[] = [];

  for (const [key, nestedValue] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (/collection|ownedcards|playercards|cardcounts|cardcollection|cardsowned/i.test(path)) {
      results.push(path);
    }
    results.push(...collectCandidateCollectionPaths(nestedValue, path));
  }

  return results;
};

const summarizeLog = (path: string): LogSummary => {
  const snapshots = extractStartHookSnapshots(path);
  const latest = snapshots.at(-1);

  if (!latest) {
    return {
      path,
      startHookCount: 0,
    };
  }

  const rootKeys = Object.keys(latest.data);
  const inventoryInfo =
    latest.data.InventoryInfo && typeof latest.data.InventoryInfo === "object" && !Array.isArray(latest.data.InventoryInfo)
      ? (latest.data.InventoryInfo as Record<string, unknown>)
      : undefined;

  const deckCount =
    latest.data.Decks && typeof latest.data.Decks === "object" && !Array.isArray(latest.data.Decks)
      ? Object.keys(latest.data.Decks as Record<string, unknown>).length
      : null;

  const deckSummaryCount = Array.isArray(latest.data.DeckSummariesV2) ? latest.data.DeckSummariesV2.length : null;

  return {
    path,
    startHookCount: snapshots.length,
    latestStartHook: {
      lineNumber: latest.lineNumber,
      rootKeys,
      inventoryKeys: inventoryInfo ? Object.keys(inventoryInfo) : [],
      gold: typeof inventoryInfo?.Gold === "number" ? inventoryInfo.Gold : null,
      gems: typeof inventoryInfo?.Gems === "number" ? inventoryInfo.Gems : null,
      deckCount,
      deckSummaryCount,
      candidateCollectionPaths: collectCandidateCollectionPaths(latest.data),
    },
  };
};

const parseOwnershipJson = (path: string): OwnershipEntry[] => {
  const payload = JSON.parse(readFileSync(path, "utf8")) as unknown;

  const coerceEntry = (value: unknown, fallbackName?: string): OwnershipEntry | null => {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      if (fallbackName && typeof value === "number") {
        return {
          name: fallbackName,
          titleCount: value,
        };
      }
      return null;
    }

    const record = value as Record<string, unknown>;
    const nameValue = record.name ?? record.Name ?? record.cardName ?? fallbackName;
    const titleCountValue =
      record.titleCount ?? record.playableCount ?? record.ownedCount ?? record.count ?? record.Count;
    const printCountValue =
      record.printCount ?? record.ownedPrintCount ?? record.variantCount ?? record.PrintCount;

    if (typeof nameValue !== "string" || typeof titleCountValue !== "number") {
      return null;
    }

    return {
      name: nameValue,
      titleCount: titleCountValue,
      ...(typeof printCountValue === "number" ? { printCount: printCountValue } : {}),
    };
  };

  if (Array.isArray(payload)) {
    return payload.map((entry) => coerceEntry(entry)).filter((entry): entry is OwnershipEntry => entry != null);
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;

    if (Array.isArray(record.entries)) {
      return record.entries.map((entry) => coerceEntry(entry)).filter((entry): entry is OwnershipEntry => entry != null);
    }

    if (record.cards && typeof record.cards === "object" && !Array.isArray(record.cards)) {
      return Object.entries(record.cards as Record<string, unknown>)
        .map(([name, entry]) => coerceEntry(entry, name))
        .filter((value): value is OwnershipEntry => value != null);
    }

    return Object.entries(record)
      .map(([name, entry]) => coerceEntry(entry, name))
      .filter((value): value is OwnershipEntry => value != null);
  }

  return [];
};

const compareOwnership = (csvSummary: CsvSummary, ownershipPath: string): OwnershipComparison => {
  const entries = parseOwnershipJson(ownershipPath);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));

  const missingFromProbe: string[] = [];
  const mismatchedTitleCounts: OwnershipComparison["mismatchedTitleCounts"] = [];

  for (const [name, csvEntry] of csvSummary.byName.entries()) {
    const probeEntry = byName.get(name);
    if (!probeEntry) {
      missingFromProbe.push(name);
      continue;
    }

    if (probeEntry.titleCount !== csvEntry.maxCount) {
      mismatchedTitleCounts.push({
        name,
        csvCount: csvEntry.maxCount,
        probeCount: probeEntry.titleCount,
      });
    }
  }

  const extraInProbe = [...byName.keys()].filter((name) => !csvSummary.byName.has(name));
  const printCounts = entries
    .map((entry) => entry.printCount)
    .filter((value): value is number => typeof value === "number");

  return {
    path: ownershipPath,
    uniqueNames: entries.length,
    titleLevelOwnedTotal: entries.reduce((total, entry) => total + entry.titleCount, 0),
    printLevelOwnedTotal: printCounts.length ? printCounts.reduce((total, count) => total + count, 0) : null,
    missingFromProbe: missingFromProbe.sort((left, right) => left.localeCompare(right)),
    extraInProbe: extraInProbe.sort((left, right) => left.localeCompare(right)),
    mismatchedTitleCounts: mismatchedTitleCounts
      .sort((left, right) => {
        const delta = Math.abs(right.csvCount - right.probeCount) - Math.abs(left.csvCount - left.probeCount);
        return delta || left.name.localeCompare(right.name);
      }),
  };
};

const describeVariantRows = (rows: VariantRow[]) =>
  rows
    .map((row) => `${row.set}:${row.count}/${row.printCount}`)
    .join(" | ");

const printCsvSummary = (summary: CsvSummary) => {
  console.log("CSV baseline");
  console.log(`  file: ${basename(summary.path)}`);
  console.log(`  total rows: ${summary.totalRows.toLocaleString()}`);
  console.log(`  rows with Count > 0: ${summary.ownedCountRows.toLocaleString()}`);
  console.log(`  rows with PrintCount > 0: ${summary.ownedPrintRows.toLocaleString()}`);
  console.log(`  unique owned names: ${summary.uniqueOwnedNames.toLocaleString()}`);
  console.log(`  raw Count sum: ${summary.rawCountTotal.toLocaleString()}`);
  console.log(`  raw PrintCount sum: ${summary.rawPrintCountTotal.toLocaleString()}`);
  console.log(`  title-level owned total by max Count per name: ${summary.titleLevelOwnedTotal.toLocaleString()}`);

  const ajani = summary.byName.get("Ajani's Pridemate");
  if (ajani) {
    console.log("  sanity check:");
    console.log(`    Ajani's Pridemate -> max Count ${ajani.maxCount}, sum PrintCount ${ajani.sumPrintCount}`);
    console.log(`    ${describeVariantRows(ajani.rows)}`);
  }

  const divergenceExamples = [...summary.byName.entries()]
    .filter(([, entry]) => entry.maxCount !== entry.sumPrintCount)
    .sort((left, right) => {
      const delta =
        Math.abs(right[1].sumPrintCount - right[1].maxCount) - Math.abs(left[1].sumPrintCount - left[1].maxCount);
      return delta || left[0].localeCompare(right[0]);
    })
    .slice(0, 8);

  if (divergenceExamples.length) {
    console.log("  top title/print divergence examples:");
    for (const [name, entry] of divergenceExamples) {
      console.log(`    ${name}: max Count ${entry.maxCount}, sum PrintCount ${entry.sumPrintCount}`);
      console.log(`    ${describeVariantRows(entry.rows)}`);
    }
  }
};

const printLogSummary = (summary: LogSummary) => {
  console.log("");
  console.log("Log snapshot");
  console.log(`  file: ${basename(summary.path)}`);
  console.log(`  StartHook responses found: ${summary.startHookCount}`);

  if (!summary.latestStartHook) {
    console.log("  no StartHook payload found");
    return;
  }

  console.log(`  latest StartHook line: ${summary.latestStartHook.lineNumber}`);
  console.log(`  root keys: ${summary.latestStartHook.rootKeys.join(", ")}`);
  console.log(`  InventoryInfo keys: ${summary.latestStartHook.inventoryKeys.join(", ")}`);
  console.log(`  gold: ${formatNumber(summary.latestStartHook.gold)}`);
  console.log(`  gems: ${formatNumber(summary.latestStartHook.gems)}`);
  console.log(`  deck summaries: ${formatNumber(summary.latestStartHook.deckSummaryCount)}`);
  console.log(`  decks: ${formatNumber(summary.latestStartHook.deckCount)}`);

  const candidatePaths = summary.latestStartHook.candidateCollectionPaths.filter(
    (path) =>
      !path.startsWith("CardMetadataInfo") &&
      !path.startsWith("Decks") &&
      !path.startsWith("DeckSummariesV2") &&
      !path.startsWith("HomePageAchievements"),
  );

  if (candidatePaths.length === 0) {
    console.log("  owned-card collection map detected: no");
    console.log("  note: this looks like a startup/home snapshot, not a collection snapshot");
    return;
  }

  console.log("  candidate collection paths:");
  for (const path of candidatePaths.slice(0, 20)) {
    console.log(`    ${path}`);
  }
};

const printComparison = (comparison: OwnershipComparison, csvSummary: CsvSummary) => {
  console.log("");
  console.log("Ownership comparison");
  console.log(`  file: ${basename(comparison.path)}`);
  console.log(`  probe unique names: ${comparison.uniqueNames.toLocaleString()}`);
  console.log(`  probe title-level total: ${comparison.titleLevelOwnedTotal.toLocaleString()}`);
  console.log(`  probe print-level total: ${formatNumber(comparison.printLevelOwnedTotal)}`);
  console.log(`  csv unique names: ${csvSummary.uniqueOwnedNames.toLocaleString()}`);
  console.log(`  csv title-level total: ${csvSummary.titleLevelOwnedTotal.toLocaleString()}`);
  console.log(`  csv print-level total: ${csvSummary.rawPrintCountTotal.toLocaleString()}`);
  console.log(`  missing names from probe: ${comparison.missingFromProbe.length.toLocaleString()}`);
  console.log(`  extra names in probe: ${comparison.extraInProbe.length.toLocaleString()}`);
  console.log(`  mismatched title counts: ${comparison.mismatchedTitleCounts.length.toLocaleString()}`);

  if (comparison.missingFromProbe.length) {
    console.log("  missing names sample:");
    for (const name of comparison.missingFromProbe.slice(0, 10)) {
      console.log(`    ${name}`);
    }
  }

  if (comparison.extraInProbe.length) {
    console.log("  extra names sample:");
    for (const name of comparison.extraInProbe.slice(0, 10)) {
      console.log(`    ${name}`);
    }
  }

  if (comparison.mismatchedTitleCounts.length) {
    console.log("  mismatched title-count sample:");
    for (const mismatch of comparison.mismatchedTitleCounts.slice(0, 10)) {
      console.log(`    ${mismatch.name}: csv ${mismatch.csvCount}, probe ${mismatch.probeCount}`);
    }
  }
};

const run = () => {
  const options = parseArgs(process.argv.slice(2));
  const csvPath = options.csvPath ?? firstExisting(defaultCsvCandidates);

  if (!csvPath) {
    throw new Error("No CSV baseline found. Pass --csv <path>.");
  }

  const csvSummary = summarizeCsv(csvPath);
  printCsvSummary(csvSummary);

  const logPath = options.logPath ?? firstExisting(defaultLogCandidates);
  if (logPath) {
    printLogSummary(summarizeLog(logPath));
  }

  if (options.ownershipJsonPath) {
    printComparison(compareOwnership(csvSummary, options.ownershipJsonPath), csvSummary);
  } else {
    console.log("");
    console.log("Next step");
    console.log("  When you have a normalized ownership JSON from log parsing, rerun with:");
    console.log("  npm run compare:collection -- --ownership-json <path>");
  }
};

run();
