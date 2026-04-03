const statusBanner = document.getElementById("statusBanner");
const platformValue = document.getElementById("platformValue");
const probePathValue = document.getElementById("probePathValue");
const dataDirValue = document.getElementById("dataDirValue");
const latestReportValue = document.getElementById("latestReportValue");
const pidInput = document.getElementById("pidInput");
const runProbeButton = document.getElementById("runProbeButton");
const runBanner = document.getElementById("runBanner");
const summaryOutput = document.getElementById("summaryOutput");
const jsonOutput = document.getElementById("jsonOutput");

const setStatusBanner = (message, error = false) => {
  statusBanner.textContent = message;
  statusBanner.className = error ? "banner error" : "banner";
};

const setRunBanner = (message, error = false) => {
  runBanner.textContent = message;
  runBanner.className = error ? "banner error" : "banner";
};

const loadStatus = async () => {
  const status = await window.collectorApi.getStatus();
  platformValue.textContent = status.platform;
  probePathValue.textContent = status.probeModulePath;
  dataDirValue.textContent = status.collectorDataDirectory;
  latestReportValue.textContent = status.latestReportPath;

  if (status.probeModuleExists) {
    setStatusBanner("Collector host is ready. Probe module found.");
    return status;
  }

  setStatusBanner(
    'Probe module is missing. Build the API workspace first with "npm run build -w @mtga/api".',
    true
  );
  return status;
};

const parsePidOverride = () => {
  const trimmed = pidInput.value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? NaN : parsed;
};

const runProbe = async () => {
  const pid = parsePidOverride();
  if (Number.isNaN(pid)) {
    setRunBanner("PID override must be a whole number.", true);
    return;
  }

  runProbeButton.disabled = true;
  setRunBanner("Running runtime probe...");

  try {
    const result = await window.collectorApi.runRuntimeProbe(pid ? { pid } : {});
    latestReportValue.textContent = result.latestReportPath;
    summaryOutput.textContent = result.summary;
    jsonOutput.textContent = JSON.stringify(result.report, null, 2);
    setRunBanner(`Probe finished. Latest report saved to ${result.latestReportPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setRunBanner(message, true);
    summaryOutput.textContent = "Probe failed.";
  } finally {
    runProbeButton.disabled = false;
  }
};

runProbeButton.addEventListener("click", () => {
  void runProbe();
});

void loadStatus().catch((error) => {
  setStatusBanner(error instanceof Error ? error.message : String(error), true);
});
