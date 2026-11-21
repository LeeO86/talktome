const fs = require('fs');
const path = require('path');
const { withAndroidColors, withDangerousMod } = require('expo/config-plugins');

const DRAWABLE_DIRS = [
  'drawable-mdpi',
  'drawable-hdpi',
  'drawable-xhdpi',
  'drawable-xxhdpi',
  'drawable-xxxhdpi',
  'drawable',
];
const MIPMAP_DIRS = [
  'mipmap-mdpi',
  'mipmap-hdpi',
  'mipmap-xhdpi',
  'mipmap-xxhdpi',
  'mipmap-xxxhdpi',
];

const ADAPTIVE_ICON = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/iconBackground"/>
    <foreground android:drawable="@drawable/ic_talktome_adaptive_foreground"/>
    <monochrome android:drawable="@drawable/ic_talktome_adaptive_foreground"/>
</adaptive-icon>
`;

function copyDirPngs(fromDir, toDir) {
  if (!fs.existsSync(fromDir)) {
    return;
  }
  fs.mkdirSync(toDir, { recursive: true });
  for (const name of fs.readdirSync(fromDir)) {
    if (!name.endsWith('.png')) {
      continue;
    }
    fs.copyFileSync(path.join(fromDir, name), path.join(toDir, name));
  }
}

function removeIfExists(file) {
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}

function writeFile(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function setColor(colors, name, value) {
  const existing = colors.find((color) => color.$.name === name);
  if (existing) {
    existing._ = value;
    return;
  }
  colors.push({ $: { name }, _: value });
}

function withTalkToMeAndroidIcons(config) {
  config.android = {
    ...config.android,
    adaptiveIcon: {
      ...(config.android?.adaptiveIcon ?? {}),
      backgroundColor: '#000000',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
  };

  config = withAndroidColors(config, (mod) => {
    const colors = mod.modResults.resources.color ?? [];
    setColor(colors, 'iconBackground', '#000000');
    mod.modResults.resources.color = colors;
    return mod;
  });

  return withDangerousMod(config, [
    'android',
    (mod) => {
      const iconsRoot = path.join(mod.modRequest.projectRoot, 'assets', 'android-icons');
      const res = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      for (const dir of DRAWABLE_DIRS) {
        copyDirPngs(path.join(iconsRoot, dir), path.join(res, dir));
      }
      for (const dir of MIPMAP_DIRS) {
        copyDirPngs(path.join(iconsRoot, dir), path.join(res, dir));
      }
      removeIfExists(path.join(res, 'drawable', 'ic_stat_talktome.xml'));
      writeFile(path.join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml'), ADAPTIVE_ICON);
      writeFile(path.join(res, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), ADAPTIVE_ICON);
      for (const dir of MIPMAP_DIRS) {
        removeIfExists(path.join(res, dir, 'ic_launcher.webp'));
        removeIfExists(path.join(res, dir, 'ic_launcher_round.webp'));
        removeIfExists(path.join(res, dir, 'ic_launcher_foreground.webp'));
        removeIfExists(path.join(res, dir, 'ic_launcher_background.webp'));
        removeIfExists(path.join(res, dir, 'ic_launcher_monochrome.webp'));
      }
      return mod;
    },
  ]);
}

module.exports = withTalkToMeAndroidIcons;
