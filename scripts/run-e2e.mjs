import { spawn } from "node:child_process";
import { join } from "node:path";

const port = process.env.AGENTPAY_E2E_PORT ?? "5173";
const host = "127.0.0.1";
const root = `http://${host}:${port}`;
const viteCli = join(process.cwd(), "node_modules", "vite", "bin", "vite.js");
const playwrightCli = join(process.cwd(), "node_modules", "@playwright", "test", "cli.js");

const server = spawnCommand(process.execPath, [viteCli, "--host", host, "--port", port], {
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";

server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForServer(root);
  const exitCode = await runTests();
  process.exitCode = exitCode;
} catch (error) {
  console.error(error);
  console.error(serverOutput);
  process.exitCode = 1;
} finally {
  await stopProcess(server);
}

function spawnCommand(command, args = [], options = {}) {
  return spawn(command, args, {
    windowsHide: true,
    ...options,
  });
}

function runTests() {
  return new Promise((resolve) => {
    const tests = spawnCommand(process.execPath, [playwrightCli, "test"], {
      env: {
        ...process.env,
        AGENTPAY_EXTERNAL_SERVER: "1",
      },
      stdio: "inherit",
    });

    tests.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

function stopProcess(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 2_000);

    child.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill();
  });
}

async function waitForServer(url) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < 60_000) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(500);
  }

  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
