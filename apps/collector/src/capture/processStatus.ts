import {
  defaultProcessPatterns,
  findMtgaProcess
} from "./processDiscovery.js";

const status = findMtgaProcess(defaultProcessPatterns);
process.stdout.write(
  `${JSON.stringify({
    method: status.method,
    selectedPid: status.selectedPid,
    matches: status.matches,
    errors: status.errors
  })}\n`
);
