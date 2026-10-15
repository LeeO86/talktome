const path = require("node:path");

// In packaged builds this points at the root of the embedded snapshot.
const projectRoot = path.resolve(__dirname, "..", "..");

module.exports = { projectRoot };
