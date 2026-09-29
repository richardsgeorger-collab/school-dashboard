/**
 * What the PDF can draw. The sheet is set in a subset of DejaVu Sans (public/fonts), which carries subscripts,
 * arrows, Greek and the math operators a chemistry or physics worksheet uses. When that font cannot be fetched
 * (offline, or a build without it) the PDF falls back to jsPDF's Helvetica, which knows WinAnsi only: a line with a
 * single "₂" or "→" in it then comes out letter-spaced and off the margin. So the fallback rewrites those
 * characters into what Helvetica can draw, and says so once at the foot of the sheet.
 */
const SUBS: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')', 'ₐ': 'a', 'ₑ': 'e', 'ₒ': 'o', 'ₓ': 'x', 'ₙ': 'n' };
const SUPS: Record<string, string> = { '⁰': '^0', '⁴': '^4', '⁵': '^5', '⁶': '^6', '⁷': '^7', '⁸': '^8', '⁹': '^9', '⁺': '^+', '⁻': '^-', 'ⁿ': '^n', 'ⁱ': '^i' };
const GREEK: Record<string, string> = { α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', Δ: 'delta', ε: 'epsilon', θ: 'theta', λ: 'lambda', μ: 'µ', π: 'pi', ρ: 'rho', σ: 'sigma', Σ: 'sum', τ: 'tau', φ: 'phi', ω: 'omega', Ω: 'ohm' };
const SYMBOLS: Record<string, string> = { '→': '->', '←': '<-', '↔': '<->', '⇌': '<=>', '⇒': '=>', '−': '-', '–': '-', '—': '-', '≥': '>=', '≤': '<=', '≠': '!=', '≈': '~', '∙': '·', '⋅': '·', '∞': 'inf', '√': 'sqrt', '∆': 'delta', '′': "'", '″': '"', '‰': ' per mille', '∝': ' proportional to ', '∈': ' in ', '∑': 'sum', '∫': 'integral of ' };

/** Characters Helvetica in jsPDF can draw: printable ASCII and Latin-1 (WinAnsi), which includes ² ³ × ÷ ° ± µ · and the curly quotes. */
const WINANSI = /^[\x20-\x7e -ÿ‘’“”…–—•€™]$/;

/** The text rewritten for Helvetica. Returns the text and whether anything had to change. */
export function helveticaSafe(text: string): { text: string; changed: boolean } {
  let changed = false;
  const out = [...text]
    .map((ch) => {
      if (WINANSI.test(ch)) return ch;
      const r = SUBS[ch] ?? SUPS[ch] ?? GREEK[ch] ?? SYMBOLS[ch];
      changed = true;
      return r ?? '?';
    })
    .join('');
  return { text: out, changed };
}
