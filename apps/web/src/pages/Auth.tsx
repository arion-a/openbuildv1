import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  auth,
  firebaseConfigured,
  googleProvider,
  githubProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  updateProfile,
  getAdditionalUserInfo,
} from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { passwordOk, passwordChecks, PASSWORD_HINT } from '../lib/password';
import { api } from '../lib/api';

type Mode = 'choose' | 'signin' | 'signup';

const WRONG_PASSWORD_CODES = new Set(['auth/wrong-password', 'auth/invalid-credential', 'auth/user-not-found']);

function isWrongPasswordError(err: any) {
  return WRONG_PASSWORD_CODES.has(err?.code) || /wrong$/i.test(String(err?.message || '').trim());
}

function isEmailInUseError(err: any) {
  return err?.code === 'auth/email-already-in-use' || /already has an account/i.test(String(err?.message || ''));
}

function authErrorMessage(err: any) {
  const code = err?.code || '';
  const raw = String(err?.message || '').replace('Firebase: ', '');
  if (code === 'auth/configuration-not-found' || raw.includes('configuration-not-found')) {
    return 'GitHub/Google sign-in isn’t available right now — use email instead.';
  }
  if (isEmailInUseError(err)) {
    return 'That email already has an account.';
  }
  if (isWrongPasswordError(err)) {
    return 'That email or password is wrong.';
  }
  if (code === 'auth/popup-blocked') {
    return 'The browser blocked the sign-in window. Allow pop-ups and try again.';
  }
  if (code === 'auth/network-request-failed' || /Failed to fetch|ECONNREFUSED/i.test(raw)) {
    return 'Could not reach the auth service. Check your connection and try again.';
  }
  return raw || 'Something went wrong';
}

function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  return raw;
}

function initialMode(param: string | null): Mode {
  if (param === 'signup' || param === 'signin' || param === 'choose') return param;
  return import.meta.env.DEV ? 'signup' : 'choose';
}

export function Auth() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>(initialMode(searchParams.get('mode')));
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [recoverableError, setRecoverableError] = useState<null | 'wrong-password' | 'email-in-use'>(null);
  const [otpStage, setOtpStage] = useState<'idle' | 'sent'>('idle');
  const [otpCode, setOtpCode] = useState('');
  const navigate = useNavigate();
  const { isLoggedIn, user, setUser } = useAuth();

  const resetAuthFlowState = () => {
    setError('');
    setResetSent(false);
    setRecoverableError(null);
    setOtpStage('idle');
    setOtpCode('');
  };

  const afterLogin = (handle: string, isNew = false) => {
    const stored = sessionStorage.getItem('ob_auth_next');
    if (stored) sessionStorage.removeItem('ob_auth_next');
    const next = safeNext(searchParams.get('next')) || safeNext(stored);
    navigate(next || (isNew ? '/welcome' : `/u/${handle}`));
  };

  useEffect(() => {
    const next = safeNext(searchParams.get('next'));
    if (next) sessionStorage.setItem('ob_auth_next', next);
  }, [searchParams]);

  useEffect(() => {
    if (isLoggedIn() && user?.username) afterLogin(user.username);
  }, [isLoggedIn(), user?.username]);

  const syncWithBackend = async (idToken: string, extra?: { github_username?: string; github_url?: string }) => {
    const res = await fetch('/api/auth/firebase', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        ...(extra ? { 'Content-Type': 'application/json' } : {}),
      },
      body: extra ? JSON.stringify(extra) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Backend error' }));
      throw new Error(err.message || 'Failed to sync with backend');
    }
    return res.json() as Promise<{ user: { username: string } }>;
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    resetAuthFlowState();
    if (mode === 'signup' && !passwordOk(password)) {
      setError(PASSWORD_HINT);
      return;
    }
    setLoading(true);
    try {
      if (import.meta.env.DEV) {
        const data = await api.localAuth({
          email,
          password,
          display_name: username,
          mode: mode === 'signin' ? 'signin' : 'signup',
        });
        if (data.token) localStorage.setItem('ob_jwt', data.token);
        setUser(data.user);
        afterLogin(data.user.username, mode === 'signup');
        return;
      }
      if (!auth) return;
      let cred;
      let displayNameJustSet = false;
      if (mode === 'signin') {
        cred = await signInWithEmailAndPassword(auth, email, password);
      } else {
        cred = await createUserWithEmailAndPassword(auth, email, password);
        if (username) {
          await updateProfile(cred.user, { displayName: username });
          displayNameJustSet = true;
        }
      }
      // getIdToken() alone can return a token cached from before updateProfile
      // ran, missing the new displayName — the backend then falls back to the
      // username for display_name. Force a refresh so the name claim is current.
      const idToken = await cred.user.getIdToken(displayNameJustSet);
      const data = await syncWithBackend(idToken);
      afterLogin(data.user.username, mode === 'signup');
    } catch (err: any) {
      setError(authErrorMessage(err));
      if (mode === 'signin' && isWrongPasswordError(err)) {
        setRecoverableError('wrong-password');
      } else if (mode === 'signup' && isEmailInUseError(err)) {
        setRecoverableError('email-in-use');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Enter your email above first, then tap Forgot password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      // Local dev accounts (created via /auth/local) aren't real Firebase
      // users, so a Firebase reset email wouldn't reach anyone — use the same
      // one-time-code path a wrong-password attempt offers instead.
      if (import.meta.env.DEV || !auth) {
        await api.requestOtp(email);
        setOtpStage('sent');
      } else {
        await sendPasswordResetEmail(auth, email);
        setResetSent(true);
      }
    } catch (err: any) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async () => {
    if (!email) return;
    setError('');
    setLoading(true);
    try {
      await api.requestOtp(email);
      setOtpStage('sent');
    } catch (err: any) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.verifyOtp(email, otpCode);
      if (data.token) localStorage.setItem('ob_jwt', data.token);
      setUser(data.user);
      afterLogin(data.user.username);
    } catch (err: any) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthResult = async (cred: Awaited<ReturnType<typeof signInWithPopup>>) => {
    const info = getAdditionalUserInfo(cred);
    const ghName = info?.username || undefined;
    const idToken = await cred.user.getIdToken();
    const data = await syncWithBackend(
      idToken,
      ghName ? { github_username: ghName, github_url: `https://github.com/${ghName}` } : undefined
    );
    afterLogin(data.user.username, !!info?.isNewUser);
  };

  const handleGithub = async () => {
    if (!auth || !githubProvider) return;
    setError('');
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, githubProvider);
      await handleOAuthResult(cred);
    } catch (err: any) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (!auth || !googleProvider) return;
    setError('');
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await handleOAuthResult(cred);
    } catch (err: any) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <a href="/" className="font-display text-3xl">Open<span className="text-[var(--ember)]">Build</span></a>
          {import.meta.env.DEV && (
            <p className="text-[var(--muted)] text-xs mt-2">Local — not openbuild.world</p>
          )}
          <p className="text-[var(--muted)] mt-3 text-sm">Sign in to publish. Browse without an account.</p>
        </div>

        <div className="ob-card p-6">
          {!firebaseConfigured && (
            <p className="text-amber-300 text-sm mb-4 leading-relaxed">
              Sign-in needs Firebase web keys. Copy <span className="font-mono text-amber-200">apps/web/.env.example</span> to <span className="font-mono text-amber-200">apps/web/.env</span>, fill the VITE_FIREBASE_* values, and restart the dev server.
            </p>
          )}
          {mode === 'choose' && (
            <div className="space-y-3">
              <button
                onClick={handleGithub}
                disabled={loading}
                className="btn-ember w-full flex items-center justify-center gap-3 py-3 disabled:opacity-50"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                {loading ? 'Signing in…' : 'Continue with GitHub'}
              </button>
              <button
                onClick={handleGoogle}
                disabled={loading}
                className="btn-ghost w-full flex items-center justify-center gap-3 py-3 disabled:opacity-50"
              >
                Continue with Google
              </button>
              <button
                onClick={() => { setMode('signup'); resetAuthFlowState(); }}
                className="btn-ghost w-full py-3"
              >
                Create a new account
              </button>
              <button
                onClick={() => { setMode('signin'); resetAuthFlowState(); }}
                className="w-full py-3 text-sm text-[var(--muted)] hover:text-[var(--cream)] transition"
              >
                Sign in with email
              </button>
            </div>
          )}

          {(mode === 'signin' || mode === 'signup') && (
            <>
              <button
                type="button"
                onClick={() => { setMode('choose'); resetAuthFlowState(); }}
                className="text-xs text-[var(--muted)] hover:text-[var(--cream)] mb-4"
              >
                ← All options
              </button>
              <h2 className="font-display text-2xl mb-4">
                {mode === 'signin' ? 'Sign in with email' : 'Create a new account'}
              </h2>
              <form onSubmit={handleEmail} className="space-y-4">
                {mode === 'signup' && (
                  <input
                    type="text"
                    placeholder="Display name"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="ob-input"
                  />
                )}
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="ob-input"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === 'signup' ? 8 : undefined}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  className="ob-input"
                />
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-xs text-[var(--muted)] hover:text-[var(--cream)] -mt-2 block"
                  >
                    Forgot password?
                  </button>
                )}
                {mode === 'signup' && (
                  <ul className="text-xs space-y-1 pt-1">
                    {passwordChecks(password).map((c) => (
                      <li key={c.label} className={c.ok ? 'text-[var(--gold)]' : 'text-[var(--muted)]'}>
                        {c.ok ? '✓' : '·'} {c.label}
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="submit"
                  disabled={loading || (mode === 'signup' && !passwordOk(password))}
                  className="btn-ember w-full py-3 disabled:opacity-50"
                >
                  {loading ? '...' : mode === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              </form>

              {resetSent && (
                <p className="text-xs text-[var(--gold)] mt-3 leading-relaxed">
                  If that email has an account, a reset link is on its way.
                </p>
              )}

              {recoverableError === 'email-in-use' && (
                <button
                  type="button"
                  onClick={() => { setMode('signin'); resetAuthFlowState(); }}
                  className="text-xs text-[var(--ember)] mt-3 underline block"
                >
                  Sign in instead
                </button>
              )}

              {recoverableError === 'wrong-password' && otpStage === 'idle' && (
                <button
                  type="button"
                  onClick={handleRequestOtp}
                  disabled={loading}
                  className="text-xs text-[var(--ember)] mt-3 underline block disabled:opacity-50"
                >
                  Email me a one-time code instead
                </button>
              )}

              {otpStage === 'sent' && (
                <form onSubmit={handleVerifyOtp} className="space-y-3 mt-3">
                  <p className="text-xs text-[var(--muted)]">
                    If that email has an account, we’ve sent a code — enter it below.
                  </p>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="6-digit code"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    required
                    className="ob-input"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-ember w-full py-2 text-sm disabled:opacity-50"
                  >
                    {loading ? '...' : 'Verify & sign in'}
                  </button>
                </form>
              )}
            </>
          )}

          {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
          <a href="/" className="block text-center text-sm text-[var(--muted)] hover:text-[var(--cream)] mt-6">
            back
          </a>
        </div>
      </div>
    </div>
  );
}
