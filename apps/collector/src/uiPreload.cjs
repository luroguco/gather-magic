const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("collectorApi", {
  getStatus: () => ipcRenderer.invoke("collector:get-status"),
  runRuntimeProbe: (overrides) => ipcRenderer.invoke("collector:run-runtime-probe", overrides || {}),
});
