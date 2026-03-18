const { app, BrowserWindow } = require("electron");
const http = require("http");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");

const APP_PORT = process.env.DUCKERCHAT_PORT || "4318";
const APP_HOST = "127.0.0.1";
let mainWindow = null;
let serverProcess = null;

function isPortOpen(port, host = APP_HOST) {
  return new Promise((resolve) => {
    const socket = net.connect({ port: Number(port), host }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      resolve(false);
    });
  });
}

function waitForServer(port, host = APP_HOST, timeoutMs = 15000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(
        {
          host,
          port: Number(port),
          path: "/api/rooms",
          timeout: 1500
        },
        (res) => {
          res.resume();
          resolve();
        }
      );
      req.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error("Timed out waiting for DuckerChat local server"));
          return;
        }
        setTimeout(attempt, 400);
      });
      req.on("timeout", () => {
        req.destroy();
      });
    };
    attempt();
  });
}

function startServer() {
  if (serverProcess) return Promise.resolve("spawned");
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

  return Promise.resolve("spawned");
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

  mainWindow.loadURL(`http://${APP_HOST}:${APP_PORT}/`);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-software-rasterizer");

app.whenReady().then(async () => {
  const portAlreadyOpen = await isPortOpen(APP_PORT);
  if (!portAlreadyOpen) {
    await startServer();
  }
  await waitForServer(APP_PORT);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch((error) => {
  console.error(error);
  app.quit();
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
