import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ON_HALO_FEATURES, versionAtLeast } from './onHaloFeatures';

describe('the on-Halo feature switches', () => {
  it('the app and the extension list the same features, in the same words and order', () => {
    const core = readFileSync('extension/onhalo/features.js', 'utf8');
    const block = /HaloPlusOnFeatures = \[([\s\S]*?)\n\];/.exec(core)?.[1] ?? '';
    const ext = [...block.matchAll(/\['([a-z]+)', '([^']+)'\]/g)].map((m) => [m[1], m[2]]);
    expect(ext).toEqual(ON_HALO_FEATURES.map(([id, label]) => [id, label]));
  });
  it('the popup lists them too, from the same file the extension runs', () => {
    const popup = readFileSync('extension/popup.html', 'utf8');
    expect(popup).toContain('onhalo/features.js');
  });
});

describe('the switches show only with an extension that has the features', () => {
  it('compares versions', () => {
    expect(versionAtLeast('0.12.0', '0.12.0')).toBe(true);
    expect(versionAtLeast('0.12.3', '0.12.0')).toBe(true);
    expect(versionAtLeast('1.0', '0.12.0')).toBe(true);
    expect(versionAtLeast('0.11.1', '0.12.0')).toBe(false);
    expect(versionAtLeast('0.9.9', '0.12.0')).toBe(false);
    expect(versionAtLeast(null, '0.12.0')).toBe(false);
    expect(versionAtLeast('', '0.12.0')).toBe(false);
    expect(versionAtLeast('x.y', '0.12.0')).toBe(false);
  });
});
