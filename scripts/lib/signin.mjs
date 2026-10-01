// The sign-in form is email first (2026-10-01): the address, Continue, then a password (or, for Gmail, Google with
// "Or use a password instead"). Fills it the way a student would. Leaves the form on the password screen, filled.
export async function fillSignIn(p, email, password) {
  if (!(await p.$('form.signin[data-step="email"]'))) {
    const back = p.locator('.signin button:has-text("Change email")');
    if (await back.count()) await back.click();
  }
  await p.fill('form.signin[data-step="email"] input[name="email"]', email);
  await p.click('form.signin[data-step="email"] button[type="submit"]');
  const moved = await p.waitForSelector('.signin[data-step]:not([data-step="email"])', { timeout: 5000 }).then(() => true, () => false);
  if (!moved || password === undefined) return moved;
  if (await p.$('.signin[data-step="google"]')) await p.click('.signin-instead');
  await p.fill('form.signin input[name="password"]', password);
  return true;
}
