#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

function readBaseline(path) {
  const parsed = JSON.parse(readFileSync(resolve(path), "utf8"));
  if (!Array.isArray(parsed.allowedAdvisories)) {
    throw new Error(`Expected allowedAdvisories array in ${path}`);
  }
  return new Set(parsed.allowedAdvisories);
}

function collectAdvisories(report) {
  const advisories = new Map();
  for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
    for (const entry of vulnerability.via ?? []) {
      if (typeof entry !== "object" || entry === null || !entry.url) continue;
      advisories.set(entry.url, {
        severity: entry.severity ?? vulnerability.severity ?? "unknown",
        title: entry.title ?? vulnerability.name ?? entry.url,
        url: entry.url,
      });
    }
  }
  return advisories;
}

const baselinePath = process.argv[2];
if (!baselinePath) {
  console.error("Usage: node scripts/check-npm-audit-baseline.mjs <baseline.json>");
  process.exit(2);
}

const command = process.platform === "win32" ? "npm.cmd" : "npm";
const audit = spawnSync(
  command,
  ["audit", "--package-lock-only", "--omit=dev", "--json"],
  { encoding: "utf8" },
);

if (audit.error) throw audit.error;

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  console.error(audit.stderr || audit.stdout || "npm audit returned no JSON report");
  process.exit(2);
}

if (report.error) {
  console.error(JSON.stringify(report.error, null, 2));
  process.exit(2);
}

const allowed = readBaseline(baselinePath);
const current = collectAdvisories(report);
const unexpected = [...current.values()].filter(({ url }) => !allowed.has(url));
const resolved = [...allowed].filter((url) => !current.has(url));
const counts = report.metadata?.vulnerabilities ?? {};

console.log(
  `Production audit: ${counts.total ?? current.size} package finding(s); `
    + `${current.size} advisory ID(s); ${unexpected.length} new.`,
);

if (resolved.length > 0) {
  console.log("Resolved baseline advisories (remove these from the baseline):");
  for (const url of resolved) console.log(`- ${url}`);
}

if (unexpected.length > 0) {
  console.error("New production advisories are not in the reviewed baseline:");
  for (const advisory of unexpected) {
    console.error(`- [${advisory.severity}] ${advisory.title}: ${advisory.url}`);
  }
  process.exit(1);
}
