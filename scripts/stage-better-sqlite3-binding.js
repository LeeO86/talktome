const fs = require("node:fs");
const path = require("node:path");

const {
  getBetterSqlitePackageRoot,
  resolveBetterSqliteBinding,
} = require("../betterSqliteBinding");

const packageRoot = getBetterSqlitePackageRoot();
const sourcePath = resolveBetterSqliteBinding({ packageRoot });
const stagedPath = path.join(packageRoot, "build", "Release", "better_sqlite3.node");

fs.mkdirSync(path.dirname(stagedPath), { recursive: true });
if (path.resolve(sourcePath) !== path.resolve(stagedPath)) {
  fs.copyFileSync(sourcePath, stagedPath);
}
console.log(`[build] staged better-sqlite3 binding from ${path.basename(sourcePath)}`);
