#!/usr/bin/env node
/**
 * Fail before an EAS iOS cloud build if this version's build number is not
 * strictly higher than builds already on App Store Connect and/or EAS.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASC_APP_ID = process.env.APP_STORE_CONNECT_APP_ID;
let BUNDLE_ID;

function parseExpoConfig() {
  const output = execFileSync('npx', ['expo', 'config', '--json', '--type', 'public'], {
    cwd: mobileRoot,
    encoding: 'utf8',
    env: { ...process.env, EXPO_NO_TELEMETRY: '1' },
  });
  const start = output.indexOf('{');
  if (start < 0) {
    throw new Error('expo config did not print JSON');
  }
  return JSON.parse(output.slice(start));
}

function parseBuildNumber(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }
  return Number(text);
}

function easJson(args) {
  const output = execFileSync('npx', ['eas-cli', ...args, '--json', '--non-interactive'], {
    cwd: mobileRoot,
    encoding: 'utf8',
    env: { ...process.env, EXPO_NO_TELEMETRY: '1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const arrayStart = output.indexOf('[');
  const objectStart = output.indexOf('{');
  const start =
    arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart) ? arrayStart : objectStart;
  if (start < 0) {
    return [];
  }
  const parsed = JSON.parse(output.slice(start));
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (Array.isArray(parsed.builds)) {
    return parsed.builds;
  }
  if (Array.isArray(parsed.data)) {
    return parsed.data;
  }
  return [];
}

function listEasIosBuilds(status) {
  try {
    const rows = easJson([
      'build:list',
      '--platform',
      'ios',
      '--status',
      status,
      '--app-identifier',
      BUNDLE_ID,
      '--limit',
      '50',
    ]);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    const message = error.stderr?.toString?.() || error.message;
    throw new Error(`eas build:list --status ${status} failed: ${message}`);
  }
}

function appleJwt() {
  const issuer = process.env.APP_STORE_CONNECT_ISSUER_ID;
  const keyId = process.env.APP_STORE_CONNECT_KEY_ID;
  const privateKey = process.env.APP_STORE_CONNECT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!issuer || !keyId || !privateKey) {
    return null;
  }
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iss: issuer,
      iat: now,
      exp: now + 12 * 60,
      aud: 'appstoreconnect-v1',
    }),
  ).toString('base64url');
  const data = `${header}.${payload}`;
  const key = crypto.createPrivateKey(privateKey.includes('BEGIN') ? privateKey : `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`);
  const signature = crypto.sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' });
  return `${data}.${signature.toString('base64url')}`;
}

async function listAppStoreBuilds(version) {
  const token = appleJwt();
  if (!token) {
    return { available: false, builds: [] };
  }
  if (!ASC_APP_ID) throw new Error('APP_STORE_CONNECT_APP_ID is required with Apple API credentials');
  const url = new URL('https://api.appstoreconnect.apple.com/v1/builds');
  url.searchParams.set('filter[app]', ASC_APP_ID);
  url.searchParams.set('include', 'preReleaseVersion');
  url.searchParams.set('sort', '-uploadedDate');
  url.searchParams.set('limit', '200');
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`App Store Connect builds failed (${response.status}): ${body}`);
  }
  const payload = await response.json();
  const versions = new Map(
    (payload.included ?? [])
      .filter((item) => item.type === 'preReleaseVersions')
      .map((item) => [item.id, item.attributes?.version]),
  );
  const builds = (payload.data ?? [])
    .map((item) => ({
      buildNumber: parseBuildNumber(item.attributes?.version),
      version: versions.get(item.relationships?.preReleaseVersion?.data?.id) ?? null,
      processingState: item.attributes?.processingState ?? null,
    }))
    .filter((item) => item.version === version && item.buildNumber != null);
  return { available: true, builds };
}

function maxBuild(rows) {
  return rows.reduce((highest, row) => Math.max(highest, row.buildNumber ?? 0), 0);
}

function easBuildNumber(row) {
  return parseBuildNumber(row.appBuildVersion ?? row.buildDetails?.appBuildVersion);
}

function easVersion(row) {
  return row.appVersion ?? row.buildDetails?.appVersion ?? null;
}

const config = parseExpoConfig();
BUNDLE_ID = config.ios?.bundleIdentifier;
if (!BUNDLE_ID) throw new Error('Missing iOS bundle identifier');
const version = String(config.version ?? '');
const localBuild = parseBuildNumber(config.ios?.buildNumber);
if (!version || localBuild == null) {
  console.error(`Local iOS version/build is invalid: version=${version} buildNumber=${config.ios?.buildNumber}`);
  process.exit(1);
}

const easFinished = listEasIosBuilds('finished')
  .filter((row) => easVersion(row) === version)
  .map((row) => ({
    source: 'eas-finished',
    buildNumber: easBuildNumber(row),
    id: row.id,
    status: row.status,
  }))
  .filter((row) => row.buildNumber != null);

const easActive = ['new', 'in-queue', 'in-progress']
  .flatMap((status) => listEasIosBuilds(status))
  .filter((row) => easVersion(row) === version)
  .map((row) => ({
    source: 'eas-active',
    buildNumber: easBuildNumber(row),
    id: row.id,
    status: row.status,
  }))
  .filter((row) => row.buildNumber != null);

const asc = await listAppStoreBuilds(version);
const sources = [
  ...easFinished,
  ...easActive,
  ...asc.builds.map((row) => ({
    source: 'app-store-connect',
    buildNumber: row.buildNumber,
    status: row.processingState,
  })),
];

if (!asc.available) {
  console.log(
    'App Store Connect API credentials are not set; using EAS build history only. Set APP_STORE_CONNECT_ISSUER_ID, APP_STORE_CONNECT_KEY_ID, and APP_STORE_CONNECT_PRIVATE_KEY for a store-accurate check.',
  );
}

const highest = maxBuild(sources);
const activeSame = easActive.filter((row) => row.buildNumber === localBuild);
const alreadyUsed = sources.filter((row) => row.buildNumber === localBuild);

console.log(
  JSON.stringify(
    {
      version,
      localBuild,
      highestSeen: highest,
      appStoreConnectChecked: asc.available,
      alreadyUsed,
      activeSame,
    },
    null,
    2,
  ),
);

if (activeSame.length > 0) {
  console.error(
    `Refusing to start another EAS iOS cloud build: ${version} (${localBuild}) is already ${activeSame[0].status} (${activeSame[0].id}).`,
  );
  process.exit(1);
}

if (localBuild <= highest) {
  console.error(
    `Refusing to spend an EAS iOS cloud build: ${version} (${localBuild}) is not higher than the highest seen build ${highest}. Bump ios.buildNumber in app.config.ts.`,
  );
  process.exit(1);
}

console.log(`iOS build pre-check passed: ${version} (${localBuild}) > ${highest || 0}`);
