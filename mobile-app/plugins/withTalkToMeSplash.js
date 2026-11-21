const { withAndroidColors, withAndroidStyles } = require('expo/config-plugins');

const BLACK = '#000000';

function withTalkToMeSplash(config) {
  config = withAndroidColors(config, (mod) => {
    const colors = mod.modResults.resources.color ?? [];
    setColor(colors, 'splashscreen_background', BLACK);
    setColor(colors, 'iconBackground', BLACK);
    mod.modResults.resources.color = colors;
    return mod;
  });

  return withAndroidStyles(config, (mod) => {
    const styles = mod.modResults.resources.style ?? [];
    const appTheme = styles.find((style) => style.$.name === 'AppTheme');
    if (appTheme) {
      setStyleItem(appTheme, 'android:windowBackground', '@color/splashscreen_background');
      setStyleItem(appTheme, 'android:colorBackground', '@color/splashscreen_background');
    }
    const splashTheme = styles.find((style) => style.$.name === 'Theme.App.SplashScreen');
    if (splashTheme) {
      setStyleItem(splashTheme, 'android:windowBackground', '@drawable/splashscreen');
    }
    return mod;
  });
}

function setColor(colors, name, value) {
  const existing = colors.find((color) => color.$.name === name);
  if (existing) {
    existing._ = value;
    return;
  }
  colors.push({ $: { name }, _: value });
}

function setStyleItem(style, name, value) {
  style.item = style.item ?? [];
  const existing = style.item.find((item) => item.$.name === name);
  if (existing) {
    existing._ = value;
    return;
  }
  style.item.push({ $: { name }, _: value });
}

module.exports = withTalkToMeSplash;
