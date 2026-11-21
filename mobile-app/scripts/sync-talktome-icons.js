#!/usr/bin/env node
/**
 * Build TalkToMe icons from assets/talktome-mark.png.
 * Android launchers must stay adaptive: black background + transparent white glyph.
 * An opaque circular PNG becomes a solid white themed icon on Pixel.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const root = path.join(__dirname, '..');
const markPath = path.join(root, 'assets', 'talktome-mark.png');
const glyphPath = path.join(root, 'assets', 'talktome-mark-glyph.png');

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

function writePng(file, png) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

function writeGlyph() {
  const src = readPng(markPath);
  const out = new PNG({ width: src.width, height: src.height });
  for (let i = 0; i < src.data.length; i += 4) {
    const lum = (src.data[i] + src.data[i + 1] + src.data[i + 2]) / 3;
    const alpha = Math.round((lum / 255) * src.data[i + 3]);
    out.data[i] = 255;
    out.data[i + 1] = 255;
    out.data[i + 2] = 255;
    out.data[i + 3] = alpha >= 40 ? alpha : 0;
  }
  writePng(glyphPath, out);
}

function scalePng(src, dest, size) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const temp = dest.replace(/@/g, '_at_') + '.tmp.png';
  const result = spawnSync(
    'ffmpeg',
    ['-y', '-i', src, '-vf', `scale=${size}:${size}:flags=lanczos`, temp],
    { stdio: 'ignore' },
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${dest}`);
  }
  fs.renameSync(temp, dest);
}

function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function flattenOntoBlack(file) {
  const png = readPng(file);
  for (let i = 0; i < png.data.length; i += 4) {
    const a = png.data[i + 3] / 255;
    png.data[i] = Math.round(png.data[i] * a);
    png.data[i + 1] = Math.round(png.data[i + 1] * a);
    png.data[i + 2] = Math.round(png.data[i + 2] * a);
    png.data[i + 3] = 255;
  }
  writePng(file, png);
}

// Android adaptive canvas is 108dp; the circle mask is ~72dp; important content
// must stay in the inner 66dp (radius 0.611 of half-canvas). The source mark
// reaches ~0.80, so it gets clipped unless we shrink it into the safe zone.
const ADAPTIVE_SAFE_RADIUS = 0.52;

function opaqueRadius(png) {
  const cx = png.width / 2;
  const cy = png.height / 2;
  let maxR = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      if (png.data[i + 3] >= 40) {
        maxR = Math.max(maxR, Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
      }
    }
  }
  return maxR;
}

function writeContainedGlyph(srcPath, destPath, size) {
  const src = readPng(srcPath);
  const maxR = opaqueRadius(src);
  const targetR = (size / 2) * ADAPTIVE_SAFE_RADIUS;
  const scaled = Math.max(1, Math.min(size, Math.round(src.width * (targetR / maxR))));
  const temp = destPath.replace(/@/g, '_at_') + '.fit.png';
  scalePng(srcPath, temp, scaled);
  const fitted = readPng(temp);
  const out = new PNG({ width: size, height: size });
  const ox = Math.round((size - fitted.width) / 2);
  const oy = Math.round((size - fitted.height) / 2);
  PNG.bitblt(fitted, out, 0, 0, fitted.width, fitted.height, ox, oy);
  fs.unlinkSync(temp);
  writePng(destPath, out);
}

writeGlyph();

const statDensities = [
  ['drawable-mdpi', 24],
  ['drawable-hdpi', 36],
  ['drawable-xhdpi', 48],
  ['drawable-xxhdpi', 72],
  ['drawable-xxxhdpi', 96],
];
const launcherDensities = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192],
];

const androidIconRoots = [
  path.join(root, 'assets', 'android-icons'),
  path.join(root, 'modules', 'foreground-service', 'android', 'src', 'main', 'res'),
];
for (const base of androidIconRoots) {
  for (const [dir, size] of statDensities) {
    scalePng(glyphPath, path.join(base, dir, 'ic_stat_talktome.png'), size);
  }
}

const launcherRoot = path.join(root, 'assets', 'android-icons');
writeContainedGlyph(
  glyphPath,
  path.join(launcherRoot, 'drawable', 'ic_talktome_adaptive_foreground.png'),
  432,
);
for (const [dir, size] of launcherDensities) {
  const square = path.join(launcherRoot, dir, 'ic_launcher.png');
  const round = path.join(launcherRoot, dir, 'ic_launcher_round.png');
  writeContainedGlyph(glyphPath, square, size);
  flattenOntoBlack(square);
  copy(square, round);
}

const glyphSet = path.join(
  root,
  'targets',
  'TalkToMeWidget',
  'Assets.xcassets',
  'TalkToMeMarkGlyph.imageset',
);
scalePng(glyphPath, path.join(glyphSet, 'TalkToMeMarkGlyph.png'), 48);
scalePng(glyphPath, path.join(glyphSet, 'ivan.p@example.net'), 96);
scalePng(glyphPath, path.join(glyphSet, 'tom.h@example.org'), 144);
copy(markPath, path.join(root, 'targets', 'TalkToMeWidget', 'Assets.xcassets', 'TalkToMeMark.imageset', 'TalkToMeMark.png'));
// iOS App Store icons cannot have alpha. A transparent icon.png is compiled
// into an empty AppIcon and TestFlight/production shows no icon.
copy(markPath, path.join(root, 'assets', 'icon.png'));
flattenOntoBlack(path.join(root, 'assets', 'icon.png'));
writeContainedGlyph(glyphPath, path.join(root, 'assets', 'android-icon-foreground.png'), 1024);
writeContainedGlyph(glyphPath, path.join(root, 'assets', 'android-icon-monochrome.png'), 1024);

console.log('Synced TalkToMe icons from assets/talktome-mark.png');
