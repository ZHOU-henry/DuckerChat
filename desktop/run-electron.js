const fs = require("fs");
const { spawn } = require("child_process");
const path = require("path");

const electronBinary = require("electron");
const args = [];
const chromeSandboxPath = path.join(path.dirname(electronBinary), "chrome-sandbox");

function hasValidSandboxHelper() {
  try {
    const stats = fs.statSync(chromeSandboxPath);
    const mode = stats.mode & 0o7777;
    return stats.uid === 0 && stats.gid === 0 && mode === 0o4755;
  } catch {
    return false;
  }
}

const useNoSandbox = process.platform === "linux" && !hasValidSandboxHelper();

if (useNoSandbox) {
  args.push("--no-sandbox", "--disable-setuid-sandbox");
}

args.push(path.join(__dirname, ".."));

if (process.platform === "linux") {
  if (useNoSandbox) {
    console.warn(
      `[DuckerChat] chrome-sandbox is not configured as root:root 4755 at ${chromeSandboxPath}. Falling back to --no-sandbox.`
    );
  } else {
    console.log(`[DuckerChat] using system sandbox helper at ${chromeSandboxPath}`);
  }
}

const child = spawn(electronBinary, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    DUCKERCHAT_ELECTRON_NO_SANDBOX: useNoSandbox ? "1" : "0",
    ELECTRON_DISABLE_SANDBOX: useNoSandbox ? "1" : (process.env.ELECTRON_DISABLE_SANDBOX || "")
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code || 0);
});
