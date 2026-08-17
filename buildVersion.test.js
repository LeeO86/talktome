const test = require("node:test");
const assert = require("node:assert/strict");

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
