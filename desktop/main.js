const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

const APP_PORT = process.env.DUCKERCHAT_PORT || "4318";
let mainWindow = null;
let serverProcess = null;

function startServer() {
  if (serverProcess) return;
  serverProcess = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      DUCKERCHAT_PORT: APP_PORT
    },
    stdio: "inherit"
  });

  serverProcess.on("exit", () => {
    serverProcess = null;
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#f3efe8",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${APP_PORT}/`);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startServer();
  setTimeout(createWindow, 1200);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
