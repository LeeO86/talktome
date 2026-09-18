export type SettingsScheme = 'light' | 'dark';

export type SettingsPalette = {
  sheet: string;
  card: string;
  text: string;
  muted: string;
  separator: string;
  link: string;
  danger: string;
  selected: string;
  chevron: string;
  disabled: string;
};

const LIGHT: SettingsPalette = {
  sheet: '#F2F2F7',
  card: '#FFFFFF',
  text: '#111111',
  muted: '#6D6D72',
  separator: 'rgba(0,0,0,0.08)',
  link: '#007AFF',
  danger: '#FF3B30',
  selected: '#E8F7FF',
  chevron: '#C7C7CC',
  disabled: '#C7C7CC',
};

const DARK: SettingsPalette = {
  sheet: '#000000',
  card: '#1C1C1E',
  text: '#F2F2F7',
  muted: '#8E8E93',
  separator: 'rgba(255,255,255,0.12)',
  link: '#0A84FF',
  danger: '#FF453A',
  selected: 'rgba(10,132,255,0.18)',
  chevron: '#636366',
  disabled: '#636366',
};

export function settingsScheme(value: string | null | undefined): SettingsScheme {
  return value === 'dark' ? 'dark' : 'light';
}

export function settingsPalette(scheme: SettingsScheme | string | null | undefined): SettingsPalette {
  return settingsScheme(scheme) === 'dark' ? DARK : LIGHT;
}
