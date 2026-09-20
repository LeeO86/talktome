const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const {
  createVersionInfo,
  parseVersionTag,
  resolveBuildVersion,
} = require("./scripts/resolve-build-version");

test("uses an exact release tag without modification", () => {
  assert.deepEqual(
    createVersionInfo({
      exactTag: "v1.2.4",
      baseTag: "v1.2.4",
      distance: "0",
      sha: "a1b2c3d4",
    }),
    {
      version: "v1.2.4",
      appVersion: "1.2.4",
      safeVersion: "v1.2.4",
      baseVersion: "1.2.4",
      release: true,
      sha: "a1b2c3d4",
      dirty: false,
      distance: 0,
    },
  );
});

test("derives a unique development version after the latest tag", () => {
  const info = createVersionInfo({
    exactTag: "",
    baseTag: "v1.2.4",
    distance: "5",
    sha: "deadbeef",
  });

  assert.equal(info.appVersion, "1.2.4-dev.5");
  assert.equal(info.safeVersion, "v1.2.4-dev.5-deadbeef");
  assert.equal(info.release, false);
});

test("marks local builds from a modified worktree", () => {
  const info = createVersionInfo({
    exactTag: "v1.2.4",
    baseTag: "v1.2.4",
    distance: "0",
    sha: "deadbeef",
    dirty: true,
  });

  assert.equal(info.appVersion, "1.2.4-dev.0.dirty");
  assert.equal(info.release, false);
});

test("rejects values that are not semantic release tags", () => {
  assert.throws(() => parseVersionTag("release-1.2.4"), /Invalid Talktome version tag/);
});

test("reads all version data from Git", () => {
  const calls = [];
  const responses = new Map([
    ["describe --tags --match v[0-9]* --exact-match HEAD", ""],
    ["describe --tags --match v[0-9]* --abbrev=0 HEAD", "v2.0.0"],
    ["rev-list --count v2.0.0..HEAD", "3"],
    ["rev-parse --short=8 HEAD", "1234abcd"],
    ["status --porcelain --untracked-files=no", ""],
  ]);

  const info = resolveBuildVersion({
    runGit(args) {
      const key = args.join(" ");
      calls.push(key);
      return responses.get(key);
    },
  });

  assert.equal(info.appVersion, "2.0.0-dev.3");
  assert.deepEqual(calls, [...responses.keys()]);
});

test("reuses a workflow version without consulting mutable Git refs", () => {
  const info = resolveBuildVersion({
    environment: {
      TALKTOME_BUILD_VERSION: "1.2.5-dev.1",
      TALKTOME_BUILD_SAFE_VERSION: "v1.2.5-dev.1-1234abcd",
      GITHUB_SHA: "1234abcd5678",
    },
    runGit() {
      assert.fail("Git must not be queried after the workflow version was resolved");
    },
  });

  assert.equal(info.appVersion, "1.2.5-dev.1");
  assert.equal(info.safeVersion, "v1.2.5-dev.1-1234abcd");
  assert.equal(info.sha, "1234abcd");
  assert.equal(info.release, false);
});

test("rejects an invalid propagated workflow version", () => {
  assert.throws(
    () => resolveBuildVersion({ environment: { TALKTOME_BUILD_VERSION: "latest" } }),
    /Invalid Talktome version tag/,
  );
});

test("falls back to 0.0.0-dev when no release tags are reachable", () => {
  const calls = [];
  const info = resolveBuildVersion({
    runGit(args, options = {}) {
      const key = args.join(" ");
      calls.push(key);
      if (key.startsWith("describe")) {
        if (options.optional) return "";
        throw new Error("Git version resolution failed: fatal: No names found, cannot describe anything.");
      }
      if (key === "rev-list --count HEAD") return "17";
      if (key === "rev-parse --short=8 HEAD") return "cafed00d";
      if (key === "status --porcelain --untracked-files=no") return "";
      throw new Error(`unexpected git ${key}`);
    },
  });

  assert.equal(info.appVersion, "0.0.0-dev.17");
  assert.equal(info.version, "v0.0.0-dev.17");
  assert.equal(info.safeVersion, "v0.0.0-dev.17-cafed00d");
  assert.equal(info.baseVersion, "0.0.0");
  assert.equal(info.release, false);
  assert.equal(info.sha, "cafed00d");
  assert.deepEqual(calls, [
    "describe --tags --match v[0-9]* --exact-match HEAD",
    "describe --tags --match v[0-9]* --abbrev=0 HEAD",
    "rev-list --count HEAD",
    "rev-parse --short=8 HEAD",
    "status --porcelain --untracked-files=no",
  ]);
});

test("resolves 0.0.0-dev against a real git repo with no tags", () => {
  const dir = mkdtempSync(join(tmpdir(), "talktome-untagged-"));
  const git = (args) =>
    execFileSync("git", args, {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

  try {
    git(["init", "-b", "main"]);
    git(["config", "user.email", "ci@example.com"]);
    git(["config", "user.name", "CI Test"]);
    writeFileSync(join(dir, "README"), "untagged\n");
    git(["add", "README"]);
    git(["commit", "-m", "init"]);

    assert.throws(
      () => git(["describe", "--tags", "--match", "v[0-9]*", "--abbrev=0", "HEAD"]),
      /No names found/,
    );

    const info = resolveBuildVersion({ cwd: dir, environment: {} });
    assert.equal(info.appVersion, "0.0.0-dev.1");
    assert.equal(info.version, "v0.0.0-dev.1");
    assert.equal(info.baseVersion, "0.0.0");
    assert.equal(info.release, false);
    assert.match(info.safeVersion, /^v0\.0\.0-dev\.1-[0-9a-f]{8}$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
