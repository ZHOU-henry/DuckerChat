const { app, BrowserWindow } = require("electron");
const http = require("http");
const net = require("net");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const DEFAULT_PORT = Number(process.env.DUCKERCHAT_PORT || "4318");
const APP_HOST = "127.0.0.1";
const NO_SANDBOX = process.env.DUCKERCHAT_ELECTRON_NO_SANDBOX === "1";
let mainWindow = null;
let serverProcess = null;
let activePort = DEFAULT_PORT;

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

function findOpenPort(startPort = DEFAULT_PORT, host = APP_HOST, searchSpan = 20) {
  return new Promise(async (resolve) => {
    for (let port = Number(startPort); port < Number(startPort) + searchSpan; port += 1) {
      const inUse = await isPortOpen(port, host);
      if (!inUse) {
        resolve(port);
        return;
      }
    }
    resolve(Number(startPort) + searchSpan);
  });
}

function ensurePredictionPopulation() {
  const root = path.join(__dirname, "..");
  const configPath = path.join(root, "config", "agents.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const swarmCount = (config.agents || []).filter((agent) => agent.id.startsWith("swarm-")).length;
  if (swarmCount >= 1000) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const seedProcess = spawn(
      process.execPath,
      [path.join(root, "scripts", "seed-agent-swarm.js"), "1000", "swarm-room"],
      {
        cwd: root,
        env: process.env,
        stdio: "inherit"
      }
    );

    seedProcess.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Failed to seed prediction population, exit=${code}`));
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
          path: "/api/health",
          timeout: 4000
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
      DUCKERCHAT_PORT: String(activePort)
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
    title: "DuckerChat",
    width: 1520,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#f3efe8",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: !NO_SANDBOX
    }
  });

  mainWindow.loadURL(`http://${APP_HOST}:${activePort}/`);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

if (process.platform === "linux" && NO_SANDBOX) {
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-setuid-sandbox");
}

app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-software-rasterizer");

app.whenReady().then(async () => {
  await ensurePredictionPopulation();
  activePort = await findOpenPort(DEFAULT_PORT);
  await startServer();
  await waitForServer(activePort);
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
