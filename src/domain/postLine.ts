/**
 * The one line an announcement gets in the Inbox. The reader's summary when there is one; otherwise the title,
 * unless the post is just an attachment ("attached", "Hello, here is the ppt."), in which case the file names are
 * the only thing worth a line. Some professors post a whole term's homework this way.
 */
const GENERIC = new Set(['attached', 'attachment', 'attachments', 'see', 'here', 'is', 'the', 'ppt', 'file', 'files', 'resource', 'resources', 'hello', 'hi', 'regards', 'please', 'find', 'slides', 'notes', 'a', 'an', 'and', 'this', 'these', 'below', 'document', 'documents', 'fyi']);

export const EMPTY_POST = '(empty post)';

export function isAttachmentStub(title: string): boolean {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words.every((w) => GENERIC.has(w));
}

/** A post that is nothing but a link reads as the place it points to, not as the address. */
function linkLine(title: string): string | null {
  if (!/^https?:\/\/\S+$/i.test(title)) return null;
  try {
    return `Link: ${new URL(title).hostname.replace(/^www\./, '')}`;
  } catch {
    return null;
  }
}

export function postLine(post: { title?: string | null; resources?: { name?: string | null }[] | null }, summary?: string | null): string {
  if (summary && summary.trim()) return summary.trim();
  const title = (post.title ?? '').trim();
  const names = (post.resources ?? []).map((r) => (r.name ?? '').trim()).filter(Boolean);
  if (names.length && isAttachmentStub(title)) return `Attached: ${names[0]}${names.length > 1 ? ` +${names.length - 1}` : ''}`;
  return linkLine(title) ?? (title || EMPTY_POST);
}
