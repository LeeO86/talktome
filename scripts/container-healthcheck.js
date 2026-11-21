const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { getDataDir } = require("../src/server/dataPaths");
const { resolveWebAccess } = require("../src/server/webAccess");

let access;
try {
  const configPath = path.join(getDataDir(), "config.json");
  const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
  access = resolveWebAccess(config);
} catch {
  process.exit(1);
}
const port = access.httpsPort;
const client = access.tlsMode === "proxy" ? http : https;

const request = client.get(
  {
    hostname: "127.0.0.1",
    port,
    path: "/login/options",
    rejectUnauthorized: false,
    timeout: 4000,
  },
  (response) => {
    let body = "";

    response.setEncoding("utf8");
    response.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) {
        request.destroy(new Error("Health response is too large"));
      }
    });
    response.on("end", () => {
      if (response.statusCode !== 200) {
        process.exit(1);
      }

      try {
        const payload = JSON.parse(body);
        process.exit(payload && typeof payload.guestLogin === "object" ? 0 : 1);
      } catch {
        process.exit(1);
      }
    });
  }
);

request.on("timeout", () => {
  request.destroy(new Error("Health request timed out"));
});
request.on("error", () => {
  process.exit(1);
});
