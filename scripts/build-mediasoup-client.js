const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const entryPoint = require.resolve("mediasoup-client");
let packageDirectory = path.dirname(entryPoint);

while (!fs.existsSync(path.join(packageDirectory, "package.json"))) {
  const parentDirectory = path.dirname(packageDirectory);
  if (parentDirectory === packageDirectory) {
    throw new Error("Could not locate the mediasoup-client package metadata");
  }
  packageDirectory = parentDirectory;
}

const packageMetadata = JSON.parse(
  fs.readFileSync(path.join(packageDirectory, "package.json"), "utf8")
);
const outputFile = path.resolve(__dirname, "..", "public", "mediasoup-client.js");

esbuild.buildSync({
  entryPoints: [entryPoint],
  bundle: true,
  globalName: "mediasoupClient",
  outfile: outputFile
});

const versionPlaceholder = "__MEDIASOUP_CLIENT_VERSION__";
const bundledSource = fs.readFileSync(outputFile, "utf8");
// Recent releases already embed their version; older ones use this placeholder.
// tests/mediasoupClientBundle.test.js verifies the actual exported bundle version.
fs.writeFileSync(
  outputFile,
  bundledSource.replaceAll(versionPlaceholder, packageMetadata.version)
);
console.log(`Built mediasoup-client ${packageMetadata.version}`);
