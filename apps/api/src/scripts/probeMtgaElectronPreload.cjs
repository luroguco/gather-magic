const { ipcRenderer } = require("electron");
const { pathToFileURL } = require("node:url");

const serializeError = (error) => {
  if (error instanceof Error) {
    return error.stack || error.message;
  }

  return String(error);
};

ipcRenderer.on("run-probe", async (_event, payload) => {
  try {
    const moduleUrl = pathToFileURL(payload.modulePath).href;
    const probeModule = await import(moduleUrl);
    const report = probeModule.runProbe(payload.options);

    ipcRenderer.send("probe-result", {
      ok: true,
      report,
    });
  } catch (error) {
    ipcRenderer.send("probe-result", {
      ok: false,
      error: serializeError(error),
    });
  }
});

ipcRenderer.send("probe-ready");
