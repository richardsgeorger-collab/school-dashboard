import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The privacy page has to say what the Chrome Web Store form says (docs/webstore/LISTING.md), and what the app does
 * today (2026-10-01). A reviewer compares the two; so does a student.
 */
const page = readFileSync('public/privacy.html', 'utf8').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const listing = readFileSync('docs/webstore/LISTING.md', 'utf8').replace(/\s+/g, ' ');

describe('the privacy page', () => {
  it('states the extension’s single purpose in the store’s words', () => {
    const purpose = /\*\*Single purpose \(for the review form\):\*\* (.+?)\.\s/.exec(listing)?.[1];
    expect(purpose).toBeTruthy();
    expect(page.toLowerCase()).toContain(purpose!.toLowerCase());
  });
  it('matches the store’s data answers: website content only, no credentials, not sold, no remote code', () => {
    expect(listing).toContain('select only Website content');
    expect(page).toContain('website content');
    expect(page).toContain('never collects your password or any other login information');
    expect(page).toContain('only on halo.gcu.edu and on the Halo+ site');
    expect(page).toContain('does not read cookies, history or any other site');
    expect(listing).toContain('It does not read cookies, history or any other site');
    expect(page).toContain('not sold, not used for anything other than that one purpose, and not used to decide creditworthiness');
    expect(page).toContain('runs no code from anywhere else');
  });
  it('lists the same error-report fields as the store’s permission answer', () => {
    for (const f of ['the reason', 'version', 'the browser and operating system', 'plan', 'a random id for this browser']) {
      expect(listing).toContain(f);
      expect(page).toContain(f);
    }
    expect(page).toContain('Never class data, names or login');
    expect(page).toContain('Reports are deleted after 30 days');
  });
  it('describes sign-in as it works today, and every service that handles data', () => {
    expect(page).toContain('Email and password');
    expect(page).toContain('Google');
    expect(page).not.toMatch(/sign-in is by email link or Google/);
    for (const s of ['Supabase', 'Stripe', 'Anthropic', 'Groq', 'Resend', 'GitHub Pages', 'Google Fonts']) expect(page).toContain(s);
    expect(page).toContain('not affiliated with, endorsed by, or connected to Grand Canyon University');
  });
});
