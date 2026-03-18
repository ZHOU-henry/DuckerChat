const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("duckerchatDesktop", {
  platform: process.platform
});
