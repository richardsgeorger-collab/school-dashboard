import { describe, expect, it } from 'vitest';
import { authMessage } from './useAuth';

describe("Supabase's sign-in errors, in the app's words", () => {
  it('points an email-link account at Forgot password, never at Google (GCU blocks it for school addresses)', () => {
    expect(authMessage('Invalid login credentials')).toMatch(/Forgot password/);
    expect(authMessage('Invalid login credentials')).not.toMatch(/Google/);
  });
  it('sends an existing address to log in', () => expect(authMessage('User already registered')).toBe('That email already has an account. Log in instead.'));
  it('asks for 8 characters', () => expect(authMessage('Password should be at least 8 characters.')).toMatch(/8 characters/));
  it('passes anything else through', () => expect(authMessage('Something new')).toBe('Something new'));
});
