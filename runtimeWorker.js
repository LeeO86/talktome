const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function fileSha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function filesMatch(sourcePath, destinationPath) {
  if (!fs.existsSync(destinationPath)) return false;

  const sourceStat = fs.statSync(sourcePath);
  const destinationStat = fs.statSync(destinationPath);
  if (sourceStat.size !== destinationStat.size) return false;

  return fileSha256(sourcePath) === fileSha256(destinationPath);
}

function syncRuntimeFile(sourcePath, destinationPath, { executable = false } = {}) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error(`Runtime source is missing: ${sourcePath || "unknown"}`);
  }

  if (path.resolve(sourcePath) === path.resolve(destinationPath)) {
    return { updated: false, destinationPath };
  }

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  if (filesMatch(sourcePath, destinationPath)) {
    if (executable) fs.chmodSync(destinationPath, 0o755);
    return { updated: false, destinationPath };
  }

  const temporaryPath = `${destinationPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.copyFileSync(sourcePath, temporaryPath);
    if (executable) fs.chmodSync(temporaryPath, 0o755);
    fs.renameSync(temporaryPath, destinationPath);
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {}
    throw new Error(`Failed to update runtime file ${destinationPath}: ${error.message}`);
  }

  return { updated: true, destinationPath };
}

function syncRuntimeExecutable(sourcePath, destinationPath) {
  return syncRuntimeFile(sourcePath, destinationPath, { executable: true });
}

module.exports = {
  fileSha256,
  filesMatch,
  syncRuntimeExecutable,
  syncRuntimeFile,
};
