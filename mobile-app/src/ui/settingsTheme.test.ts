import { describe, expect, it } from 'vitest';

import { settingsPalette, settingsScheme } from './settingsTheme';

describe('settings theme', () => {
  it('follows a light or dark scheme', () => {
    expect(settingsScheme('dark')).toBe('dark');
    expect(settingsScheme('light')).toBe('light');
    expect(settingsPalette('light').sheet).toBe('#F2F2F7');
    expect(settingsPalette('dark').sheet).toBe('#000000');
    expect(settingsPalette('dark').card).toBe('#1C1C1E');
    expect(settingsPalette('dark').link).toBe('#0A84FF');
  });
});
