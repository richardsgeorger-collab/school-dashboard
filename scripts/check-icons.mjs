// Every icon carries its own size and nothing draws one over 48px. An unsized SVG grows to its container, which is
// how a 20px clock once filled the Now screen. Runs in `npm run build`; the screenshot script checks the rendered size.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAX = 48;
const files = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx|ts|css)$/.test(f) && !/\.test\./.test(f)) files.push(p);
  }
};
walk('src');
const problems = [];
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  if (file.endsWith('.tsx')) {
    // Inline SVGs outside Icons.tsx must state a width and a height.
    for (const m of src.matchAll(/<svg\b([^>]*)>/g)) {
      const attrs = m[1];
      const line = src.slice(0, m.index).split('\n').length;
      // Data views (rings, charts) size themselves to their data and are not icons.
      if (/\bdata-viz\b/.test(attrs)) continue;
      if (file.endsWith('Icons.tsx') && /\{\.\.\.base\}/.test(attrs) && /width=\{size\}/.test(attrs)) continue;
      if (!/\bwidth=/.test(attrs) || !/\bheight=/.test(attrs)) problems.push(`${file}:${line} <svg> without width and height`);
      for (const n of [...attrs.matchAll(/\b(?:width|height)="(\d+)"/g)].map((x) => Number(x[1]))) if (n > MAX) problems.push(`${file}:${line} <svg> sized ${n}px, over ${MAX}`);
    }
    for (const m of src.matchAll(/<Icon\w+\s+size=\{(\d+)\}/g)) if (Number(m[1]) > MAX) problems.push(`${file}: icon size ${m[1]} over ${MAX}`);
  } else if (file.endsWith('.css')) {
    // A CSS rule that sizes an icon over 48px is the same mistake by another route.
    for (const m of src.matchAll(/([^{}]*svg[^{}]*)\{([^}]*)\}/g)) {
      const sel = m[1].trim();
      if (/\[data-viz\]|\.ring|\.chart|\.arc|\.levelbar|\.load-/.test(sel)) continue;
      for (const w of [...m[2].matchAll(/\b(?:width|height)\s*:\s*(\d+)px/g)].map((x) => Number(x[1]))) if (w > MAX) problems.push(`${file}: "${sel}" sizes an svg to ${w}px`);
    }
  }
}
if (problems.length) {
  console.error(`icons check: ${problems.length} problem${problems.length === 1 ? '' : 's'}\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`icons check: clean (${files.length} files)`);
