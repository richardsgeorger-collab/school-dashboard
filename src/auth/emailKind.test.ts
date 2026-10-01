import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emailKind } from './SignIn';

describe('email first: which way in an address gets', () => {
  it('GCU school addresses get a password, never Google (GCU blocks Google sign-in for them)', () => {
    for (const e of ['jsmith12@my.gcu.edu', 'J.Smith@MY.GCU.EDU', 'prof@gcu.edu', ' someone@gcu.edu ']) expect(emailKind(e)).toBe('gcu');
  });
  it('Gmail addresses get Google first', () => {
    for (const e of ['me@gmail.com', 'Me@GMail.com', 'old@googlemail.com']) expect(emailKind(e)).toBe('google');
  });
  it('everything else gets a password', () => {
    for (const e of ['me@icloud.com', 'me@outlook.com', 'me@gcu.edu.example.com', 'me@notgcu.edu', 'me@gmail.co']) expect(emailKind(e)).toBe('other');
  });
  it('the Google button is only ever drawn on the Gmail screen', () => {
    const src = readFileSync('src/auth/SignIn.tsx', 'utf8');
    // The button's label appears once, inside the Gmail-only branch (the e2e checks the rendered screens).
    expect(src.match(/: 'Continue with Google'\}/g)?.length).toBe(1);
    const google = src.indexOf(": 'Continue with Google'}");
    expect(src.lastIndexOf('if (withGoogle)', google)).toBeGreaterThan(-1);
  });
});
