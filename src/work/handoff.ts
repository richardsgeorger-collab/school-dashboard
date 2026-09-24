import type { Item } from '../domain/types';

/**
 * The format rules an assignment's own description sets: word count, citation style, how many sources, and where
 * it is submitted. The prompt itself lives in work/prompt/; this is the part the ingestion pass shares with it.
 */

/** "APA style is not required" is not a rule to follow. A rule only counts when nothing near it cancels it. */
const NEGATED = /\b(not|no|isn't|aren't|never|without)\b[^.]{0,40}$/i;
const asserted = (text: string, index: number): boolean => !NEGATED.test(text.slice(Math.max(0, index - 60), index)) && !/^[^.]{0,40}\b(is |are |)not required\b/i.test(text.slice(index));

const NUM = '(\\d{1,3}(?:,\\d{3})+|\\d{2,5})';
const WORD_COUNT = new RegExp(`\\b${NUM}\\s*(?:[-–—]|to)?\\s*${NUM}?\\s*[-\\s]?words?\\b`, 'i');
const SOURCES = /\b(\d+|one|two|three|four|five)\s+(?:scholarly\s+|peer[- ]reviewed\s+|credible\s+|academic\s+)?(?:sources?|references?|citations?|articles?)\b/i;
const STYLE = /\b(APA|MLA|Chicago|IEEE)\b/i;
const PAGES = /\b(\d+)\s*[-–—]?\s*(\d+)?\s*(?:full\s+)?pages?\b/i;

/** The format rules that actually constrain the work, read from the description and the flags. */
export function formatRules(item: Item): string[] {
  const text = `${item.title} ${item.notes ?? ''} ${item.plan?.asks ?? ''}`;
  const out: string[] = [];
  const words = WORD_COUNT.exec(text);
  if (words) out.push(words[2] ? `${words[1]}–${words[2]} words` : `${words[1]} words`);
  else {
    const pages = PAGES.exec(text);
    if (pages) out.push(pages[2] ? `${pages[1]}–${pages[2]} pages` : `${pages[1]} page${pages[1] === '1' ? '' : 's'}`);
  }
  const style = STYLE.exec(text);
  if (style && asserted(text, style.index)) out.push(`${style[1].toUpperCase()} formatting`);
  const sources = SOURCES.exec(text);
  if (sources && asserted(text, sources.index)) out.push(`${sources[1]} source${/^(1|one)$/i.test(sources[1]) ? '' : 's'} cited`);
  // A fact about where it goes, not a warning.
  if (item.flags.lopesWrite || item.plan?.flags.lopesWrite) out.push('submitted through LopesWrite');
  if (item.flags.group || item.plan?.flags.group) out.push('group work: a CLC team submits one copy');
  if (item.flags.timed || item.plan?.flags.timed) out.push('timed once it is opened');
  return out;
}
