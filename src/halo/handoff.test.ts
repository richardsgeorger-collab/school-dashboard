import { describe, expect, it } from 'vitest';
import { mkAssessment, mkClass, mkExport } from './fixtures';
import { acceptHandoff, HALO_ORIGIN, isHaloExport, parseHaloExport } from './handoff';

const good = mkExport([mkClass({ id: 'x', courseCode: 'CHM-113', assessments: [mkAssessment({ id: 'a', title: 't' })] })]);

describe('handoff', () => {
  it('accepts only Halo as a sender', () => {
    expect(acceptHandoff({ origin: HALO_ORIGIN, data: good })).toEqual(good);
    expect(acceptHandoff({ origin: 'https://evil.example', data: good })).toBeNull();
    expect(acceptHandoff({ origin: '*', data: good })).toBeNull();
    expect(acceptHandoff({ origin: 'null', data: good })).toBeNull();
  });
  it('validates the payload shape', () => {
    expect(isHaloExport(good)).toBe(true);
    expect(isHaloExport({ kind: 'halo-export', version: 2, exportedAt: 'x', classes: [] })).toBe(false);
    expect(isHaloExport({ kind: 'halo-export', version: 1, exportedAt: 'x', classes: [{ id: 1 }] })).toBe(false);
    expect(isHaloExport('nope')).toBe(false);
    expect(acceptHandoff({ origin: HALO_ORIGIN, data: { kind: 'halo-received' } })).toBeNull();
  });
  it('parses pasted text with friendly errors', () => {
    expect(parseHaloExport(JSON.stringify(good)).classes.length).toBe(1);
    expect(() => parseHaloExport('hello')).toThrow(/not JSON/);
    expect(() => parseHaloExport('{"a":1}')).toThrow(/not a Halo export/);
  });
});
