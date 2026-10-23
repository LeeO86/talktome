const fs = require("node:fs");
const path = require("node:path");

const requiredVersion = fs.readFileSync(path.join(__dirname, "..", ".node-version"), "utf8").trim();
const [requiredMajor, requiredMinor, requiredPatch] = requiredVersion.split(".").map(Number);

function verifyBuildNode(actualVersion = process.versions.node) {
  const [actualMajor, actualMinor, actualPatch] = actualVersion.split(".").map(Number);
  const supported = /^\d+\.\d+\.\d+$/.test(actualVersion)
    && actualMajor === requiredMajor
    && (actualMinor > requiredMinor || (actualMinor === requiredMinor && actualPatch >= requiredPatch));

  if (!supported) {
    throw new Error(
      `Talktome standalone builds require Node >=${requiredVersion} <${requiredMajor + 1}; current runtime is ${actualVersion}`
    );
  }
}

if (require.main === module) verifyBuildNode();

module.exports = { verifyBuildNode };
