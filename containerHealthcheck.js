const https = require("https");

const port = Number(process.env.PORT || process.env.HTTPS_PORT || 8443);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  process.exit(1);
}

const request = https.get(
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
