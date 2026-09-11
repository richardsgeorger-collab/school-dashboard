export interface Finding {
  file: string;
  line: number;
  name: string;
  sample: string;
}
export const PATTERNS: { name: string; re: RegExp; accept?: (m: string) => boolean }[];
export function scanText(text: string, file?: string): Finding[];
export function scanTree(roots: string[], cwd?: string): Finding[];
