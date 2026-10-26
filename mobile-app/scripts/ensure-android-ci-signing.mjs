#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const gradlePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../android/app/build.gradle',
);
if (!fs.existsSync(gradlePath)) {
  throw new Error(`Missing ${gradlePath}; run expo prebuild first`);
}

let source = fs.readFileSync(gradlePath, 'utf8');
const releaseBlock = source.match(/release\s*\{[\s\S]*?\n        \}/);
if (!releaseBlock) {
  throw new Error('Could not find a release buildType in android/app/build.gradle');
}

if (/signingConfig\s+signingConfigs\.debug/.test(releaseBlock[0])) {
  console.log('Release already signs with the debug keystore.');
  process.exit(0);
}

if (/signingConfig\s+signingConfigs\.release/.test(source)) {
  source = source.replace(/signingConfig\s+signingConfigs\.release/g, 'signingConfig signingConfigs.debug');
  fs.writeFileSync(gradlePath, source);
  console.log('CI release APK will use the debug keystore.');
  process.exit(0);
}

source = source.replace(/release\s*\{/, 'release {\n            signingConfig signingConfigs.debug');
fs.writeFileSync(gradlePath, source);
console.log('Patched android/app/build.gradle so CI release APKs sign with the debug keystore.');
