export const PASSWORD_HINT =
  'At least 8 characters, with a capital letter, a number, and a symbol.';

export function passwordOk(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export function passwordChecks(password: string) {
  return [
    { ok: password.length >= 8, label: '8+ characters' },
    { ok: /[A-Z]/.test(password), label: 'A capital letter' },
    { ok: /[a-z]/.test(password), label: 'A lowercase letter' },
    { ok: /[0-9]/.test(password), label: 'A number' },
    { ok: /[^A-Za-z0-9]/.test(password), label: 'A symbol (!@#…)' },
  ];
}
