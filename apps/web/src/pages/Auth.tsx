import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  auth,
  firebaseConfigured,
  googleProvider,
  githubProvider,
  browserPopupRedirectResolver,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithRedirect,
  getRedirectResult,
  updateProfile,
  getAdditionalUserInfo,
} from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { passwordOk, passwordChecks, PASSWORD_HINT } from '../lib/password';

type Mode = 'choose' | 'signin' | 'signup';

function authErrorMessage(err: any) {
  const code = err?.code || '';
  const raw = String(err?.message || '').replace('Firebase: ', '');
  if (code === 'auth/configuration-not-found' || raw.includes('configuration-not-found')) {
    return 'GitHub/Google are not available until Firebase Authentication is turned on in the Firebase console. On localhost, go back and create an account with email and password.';
  }
  if (code === 'auth/popup-blocked') {
    return 'The browser blocked the sign-in window. Use email, or allow pop-ups for localhost.';
  }
  if (code === 'auth/network-request-failed' || /Failed to fetch|ECONNREFUSED/i.test(raw)) {
    return 'Could not reach the Auth emulator. From the repo root run npm run dev (it starts the emulator on port 9099).';
  }
  return raw || 'Something went wrong';
}

function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  return raw;
}

export function Auth() {
  const [mode, setMode] = useState<Mode>(import.meta.env.DEV ? 'signup' : 'choose');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isLoggedIn, user, setUser } = useAuth();

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
    if (!auth) return;
    let cancelled = false;
    const pending = sessionStorage.getItem('ob_oauth');
    (async () => {
      if (pending) setLoading(true);
      try {
        const cred = await getRedirectResult(auth, browserPopupRedirectResolver);
        sessionStorage.removeItem('ob_oauth');
        if (cancelled || !cred) return;
        const info = getAdditionalUserInfo(cred);
        const ghName = info?.username || undefined;
        const idToken = await cred.user.getIdToken();
        const data = await syncWithBackend(
          idToken,
          ghName ? { github_username: ghName, github_url: `https://github.com/${ghName}` } : undefined
        );
        if (!cancelled) afterLogin(data.user.username, !!info?.isNewUser);
      } catch (err: any) {
        sessionStorage.removeItem('ob_oauth');
        if (!cancelled) setError(authErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    setError('');
    if (mode === 'signup' && !passwordOk(password)) {
      setError(PASSWORD_HINT);
      return;
    }
    setLoading(true);
    try {
      if (import.meta.env.DEV) {
        const { api } = await import('../lib/api');
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
      if (mode === 'signin') {
        cred = await signInWithEmailAndPassword(auth, email, password);
      } else {
        cred = await createUserWithEmailAndPassword(auth, email, password);
        if (username) {
          await updateProfile(cred.user, { displayName: username });
        }
      }
      const idToken = await cred.user.getIdToken();
      const data = await syncWithBackend(idToken);
      afterLogin(data.user.username, mode === 'signup');
    } catch (err: any) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGithub = async () => {
    if (!auth || !githubProvider) return;
    setError('');
    setLoading(true);
    try {
      sessionStorage.setItem('ob_oauth', '1');
      await signInWithRedirect(auth, githubProvider, browserPopupRedirectResolver);
    } catch (err: any) {
      setError(authErrorMessage(err));
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (!auth || !googleProvider) return;
    setError('');
    setLoading(true);
    try {
      sessionStorage.setItem('ob_oauth', '1');
      await signInWithRedirect(auth, googleProvider, browserPopupRedirectResolver);
    } catch (err: any) {
      setError(authErrorMessage(err));
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
          {import.meta.env.DEV && (
            <p className="text-[var(--muted)] text-sm mb-5 leading-relaxed">
              Use email and password here. GitHub/Google need Firebase Authentication enabled in the console.
            </p>
          )}
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
                {loading ? 'Redirecting to sign in…' : 'Continue with GitHub'}
              </button>
              <button
                onClick={handleGoogle}
                disabled={loading}
                className="btn-ghost w-full flex items-center justify-center gap-3 py-3 disabled:opacity-50"
              >
                Continue with Google
              </button>
              <button
                onClick={() => { setMode('signup'); setError(''); }}
                className="btn-ghost w-full py-3"
              >
                Create a new account
              </button>
              <button
                onClick={() => { setMode('signin'); setError(''); }}
                className="w-full py-3 text-sm text-[var(--muted)] hover:text-[var(--cream)] transition"
              >
                Sign in with email
              </button>
              <p className="text-xs text-[var(--muted)] pt-2 leading-relaxed">
                On this computer, email creates a local account. GitHub/Google only work after Firebase Authentication is enabled in the Firebase console.
              </p>
            </div>
          )}

          {(mode === 'signin' || mode === 'signup') && (
            <>
              <button
                type="button"
                onClick={() => { setMode('choose'); setError(''); }}
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
