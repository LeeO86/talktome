#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import {
  chmod,
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function requireArgument(name) {
  const value = readArgument(name);
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
}

function getFreeTcpPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => {
        if (error) {
          reject(error);
        } else if (!port) {
          reject(new Error("Failed to allocate a local HTTPS port"));
        } else {
          resolve(port);
        }
      });
    });
  });
}

function requestHealth(port, expectedVersion = null) {
  return new Promise((resolve) => {
    const request = https.get(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/v1/health",
        rejectUnauthorized: false,
        timeout: 2000,
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
          if (body.length > 64 * 1024) {
            request.destroy();
          }
        });
        response.on("end", () => {
          if (response.statusCode !== 200) {
            resolve(false);
            return;
          }
          try {
            const payload = JSON.parse(body);
            resolve(
              payload?.ok === true
              && (!expectedVersion || payload.appVersion === expectedVersion)
            );
          } catch {
            resolve(false);
          }
        });
      }
    );
    request.on("timeout", () => {
      request.destroy();
    });
    request.on("error", () => {
      resolve(false);
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readTextIfPresent(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

function formatProcessResult(result) {
  if (!result) return "still running";
  if (result.error) return `spawnError=${result.error.message}`;
  return `exitCode=${result.code ?? "null"} signal=${result.signal ?? "none"}`;
}

function verifyPackagedServerVersion(executable, expectedVersion) {
  const environment = { ...process.env };
  delete environment.TALKTOME_VERSION;
  delete environment.npm_package_version;

  const result = spawnSync(executable, ["--version"], {
    cwd: path.dirname(executable),
    env: environment,
    encoding: "utf8",
    timeout: 15000,
    windowsHide: true,
  });
  const actualVersion = String(result.stdout || "").trim();
  if (result.status !== 0 || actualVersion !== expectedVersion) {
    throw new Error(
      `Expected packaged server version ${expectedVersion}, found ${actualVersion || "no version"} `
      + `(${formatProcessResult({ code: result.status, signal: result.signal, error: result.error })})`
    );
  }
}

async function terminateProcessTree(child, processResult) {
  if (!child?.pid || processResult.value) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
    await delay(1500);
    if (!processResult.value) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    }
  }

  for (let attempt = 0; attempt < 20 && !processResult.value; attempt += 1) {
    await delay(100);
  }
}

function trayLogPath(environment) {
  if (process.platform === "win32") {
    return path.join(environment.LOCALAPPDATA, "Talktome Server", "Logs", "server.log");
  }
  if (process.platform === "darwin") {
    return path.join(environment.HOME, "Library", "Logs", "Talktome Server", "server.log");
  }
  return path.join(environment.HOME, ".talktome-server", "logs", "server.log");
}

async function stageServerRuntime(executable, tempRoot) {
  const sourceDir = path.dirname(executable);
  const runtimeDir = path.join(tempRoot, "runtime");
  await mkdir(runtimeDir, { recursive: true });

  const stagedExecutable = path.join(runtimeDir, path.basename(executable));
  await copyFile(executable, stagedExecutable);
  if (process.platform !== "win32") {
    await chmod(stagedExecutable, 0o755);
  }

  const runtimePattern = /^(?:better_sqlite3\.node|mediasoup-worker(?:\.exe)?|api-ms-win-crt-[a-z0-9-]+\.dll|concrt140\.dll|msvcp140(?:_[a-z0-9_]+)?\.dll|ucrtbase\.dll|vcruntime140(?:_[a-z0-9_]+)?\.dll)$/i;
  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !runtimePattern.test(entry.name)) continue;
    const target = path.join(runtimeDir, entry.name);
    await copyFile(path.join(sourceDir, entry.name), target);
    if (process.platform !== "win32" && entry.name.startsWith("mediasoup-worker")) {
      await chmod(target, 0o755);
    }
  }

  return stagedExecutable;
}

async function main() {
  const mode = requireArgument("--mode");
  if (!["server", "tray"].includes(mode)) {
    throw new Error('--mode must be either "server" or "tray"');
  }

  const executable = path.resolve(requireArgument("--executable"));
  const timeoutSeconds = Number(readArgument("--timeout-seconds") || 120);
  const expectedVersion = readArgument("--expected-version");
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 5) {
    throw new Error("--timeout-seconds must be at least 5");
  }
  if (!fs.statSync(executable).isFile()) {
    throw new Error(`Executable not found: ${executable}`);
  }

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), `talktome-${mode}-smoke-`));
  const dataDir = path.join(tempRoot, "data");
  const localAppData = path.join(tempRoot, "local-app-data");
  await mkdir(dataDir, { recursive: true });
  await mkdir(localAppData, { recursive: true });
  const staleRuntimeDir = path.join(dataDir, "runtime");
  const staleWorkerName = process.platform === "win32" ? "mediasoup-worker.exe" : "mediasoup-worker";
  const staleWorkerPath = path.join(staleRuntimeDir, staleWorkerName);
  await mkdir(staleRuntimeDir, { recursive: true });
  await writeFile(staleWorkerPath, "outdated mediasoup worker used to verify runtime upgrades\n");
  if (process.platform !== "win32") {
    await chmod(staleWorkerPath, 0o755);
  }
  const launchedExecutable = mode === "server"
    ? await stageServerRuntime(executable, tempRoot)
    : executable;

  if (mode === "server" && expectedVersion) {
    verifyPackagedServerVersion(launchedExecutable, expectedVersion);
  }

  const httpsPort = await getFreeTcpPort();
  const rtcPortStart = 45000 + Math.floor(Math.random() * 5000);
  const config = {
    httpsPort,
    mdnsHost: "off",
    httpPort: "off",
    rtcPortStart,
    rtcPortCount: 32,
    mediaNetworkMode: "manual",
    mediaAnnouncedAddress: "127.0.0.1",
  };
  await writeFile(
    path.join(dataDir, "config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8"
  );

  const environment = {
    ...process.env,
    TALKTOME_DATA_DIR: dataDir,
    TALKTOME_NO_WIZARD: "1",
    PUBLIC_IP: "127.0.0.1",
    HTTPS_PORT: String(httpsPort),
    HTTP_PORT: "off",
    MDNS_HOST: "off",
    TALKTOME_RTC_PORT_START: String(rtcPortStart),
    TALKTOME_RTC_PORT_COUNT: "32",
    HOME: tempRoot,
    USERPROFILE: tempRoot,
    LOCALAPPDATA: localAppData,
    APPDATA: path.join(tempRoot, "app-data"),
  };
  delete environment.PORT;
  await mkdir(environment.APPDATA, { recursive: true });

  const output = [];
  let outputLength = 0;
  const appendOutput = (prefix, chunk) => {
    const text = `${prefix}${chunk.toString()}`;
    output.push(text);
    outputLength += text.length;
    while (outputLength > 1024 * 1024 && output.length > 1) {
      outputLength -= output.shift().length;
    }
  };

  const child = spawn(launchedExecutable, [], {
    cwd: path.dirname(launchedExecutable),
    env: environment,
    detached: process.platform !== "win32",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => appendOutput("[stdout] ", chunk));
  child.stderr.on("data", (chunk) => appendOutput("[stderr] ", chunk));

  const processResult = { value: null };
  child.once("error", (error) => {
    processResult.value = { code: null, signal: null, error };
  });
  child.once("exit", (code, signal) => {
    processResult.value = { code, signal, error: null };
  });

  const logPath = mode === "tray" ? trayLogPath(environment) : null;
  const deadline = Date.now() + timeoutSeconds * 1000;
  let lastTrayLog = "";

  try {
    while (Date.now() < deadline) {
      if (processResult.value) {
        throw new Error(
          `${mode} process exited before startup completed: ${formatProcessResult(processResult.value)}`
        );
      }

      if (logPath) {
        lastTrayLog = await readTextIfPresent(logPath);
      }
      const startupLog = mode === "tray" ? lastTrayLog : output.join("");
      const routerReady = startupLog.includes("[INIT] Router created");
      const healthReady = await requestHealth(httpsPort, expectedVersion);

      if (routerReady && healthReady) {
        console.log(
          `${mode === "tray" ? "Tray app" : "Server binary"} started successfully: `
          + `HTTPS ${httpsPort}, mediasoup router ready.`
        );
        return;
      }
      await delay(500);
    }

    const versionExpectation = expectedVersion
      ? ` with version ${expectedVersion}`
      : "";
    throw new Error(
      `${mode} startup did not become ready${versionExpectation} within ${timeoutSeconds} seconds`
    );
  } catch (error) {
    console.error(error.message);
    console.error(`Executable: ${launchedExecutable}`);
    console.error(`Process: ${formatProcessResult(processResult.value)}`);
    if (output.length > 0) {
      console.error("Process output:");
      console.error(output.join("").trimEnd());
    }
    if (logPath) {
      lastTrayLog = lastTrayLog || await readTextIfPresent(logPath);
      console.error(`Tray server log: ${logPath}`);
      console.error(lastTrayLog.trimEnd() || "(not created)");
    }
    throw error;
  } finally {
    await terminateProcessTree(child, processResult);
    await rm(tempRoot, { recursive: true, force: true }).catch((error) => {
      console.warn(`Failed to remove smoke-test directory ${tempRoot}: ${error.message}`);
    });
  }
}

main().catch((error) => {
  console.error(`Native startup smoke test failed: ${error.message}`);
  process.exitCode = 1;
});
