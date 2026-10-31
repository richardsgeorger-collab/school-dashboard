import { funnel, laptopLink } from '../analytics/funnel';

/**
 * "Text or AirDrop it to my laptop" (Loop 294; on the "You're in!" step since Loop 299): the phone's share sheet with the
 * laptop page; where sharing is not supported (some in-app browsers) the link is copied instead, and where even copying
 * fails the caller shows it to copy by hand.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the old way */
  }
  try {
    const t = document.createElement('textarea');
    t.value = text;
    t.setAttribute('readonly', '');
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    t.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  } catch {
    return false;
  }
}

export type ShareResult = { done: 'shared' | 'copied' | null; manual?: string };

export async function shareLaptopLink(fromIg: boolean): Promise<ShareResult> {
  const canShare = typeof navigator.share === 'function';
  const copy = async (): Promise<ShareResult> => {
    const url = laptopLink('copy', fromIg);
    if (await copyText(url)) {
      if (fromIg) funnel('copy', { via: 'copy' });
      return { done: 'copied' };
    }
    return { done: null, manual: url };
  };
  if (!canShare) return copy();
  try {
    await navigator.share({ title: 'Halo+ for my laptop', text: 'Open this on your laptop to add Halo+ to Chrome:', url: laptopLink('share', fromIg) });
    if (fromIg) funnel('share', { via: 'share' });
    return { done: 'shared' };
  } catch (e) {
    // Closing the share sheet is not a failure; a browser that will not share copies instead.
    if ((e as Error)?.name === 'AbortError') return { done: null };
    return copy();
  }
}
