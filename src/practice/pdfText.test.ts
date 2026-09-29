import { describe, expect, it } from 'vitest';
import { helveticaSafe } from './pdfText';

describe('what Helvetica can draw', () => {
  it('leaves plain and Latin-1 text alone, including ² × ° µ and curly quotes', () => {
    const r = helveticaSafe('10.0 g × 2 = 20.0 g at 25 °C, x² + “quotes” and 5 µm');
    expect(r.changed).toBe(false);
    expect(r.text).toBe('10.0 g × 2 = 20.0 g at 25 °C, x² + “quotes” and 5 µm');
  });
  it('rewrites subscripts, arrows and Greek into readable ASCII and says it changed something', () => {
    const r = helveticaSafe('2 H₂ + O₂ → 2 H₂O; ΔH ≥ 0; 6.022 × 10²³; k = 10⁻⁵');
    expect(r.changed).toBe(true);
    expect(r.text).toBe('2 H2 + O2 -> 2 H2O; deltaH >= 0; 6.022 × 10²³; k = 10^-^5');
  });
});
