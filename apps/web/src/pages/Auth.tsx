import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  auth,
  googleProvider,
  githubProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';

export function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();

  useEffect(() => {
    if (isLoggedIn()) navigate('/buildlive');
  }, [isLoggedIn()]);

  const syncWithBackend = async (idToken: string) => {
    const res = await fetch('/api/auth/firebase', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Backend error' }));
      throw new Error(err.message || 'Failed to sync with backend');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let cred;
      if (isLogin) {
        cred = await signInWithEmailAndPassword(auth, email, password);
      } else {
        cred = await createUserWithEmailAndPassword(auth, email, password);
        if (username) {
          await updateProfile(cred.user, { displayName: username });
        }
      }
      const idToken = await cred.user.getIdToken();
      await syncWithBackend(idToken);
      navigate('/buildlive');
    } catch (err: any) {
      setError(err.message?.replace('Firebase: ', '') || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleSocial = async (provider: typeof googleProvider | typeof githubProvider) => {
    setError('');
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, provider);
      const idToken = await cred.user.getIdToken();
      await syncWithBackend(idToken);
      navigate('/buildlive');
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.message?.replace('Firebase: ', '') || 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">OpenBuild</h1>
          <p className="text-slate-400 mt-2">Because ideas die in isolation</p>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl p-8 border border-slate-800">
          <div className="flex mb-6 bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 text-sm rounded-md transition ${isLogin ? 'bg-cyan-500 text-white' : 'text-slate-400'}`}
            >
              Sign In
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 text-sm rounded-md transition ${!isLogin ? 'bg-cyan-500 text-white' : 'text-slate-400'}`}
            >
              Sign Up
            </button>
          </div>

          {/* Social login */}
          <div className="space-y-2 mb-6">
            <button
              onClick={() => handleSocial(googleProvider)}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white hover:border-slate-600 transition disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
            <button
              onClick={() => handleSocial(githubProvider)}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white hover:border-slate-600 transition disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="white" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              Continue with GitHub
            </button>
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[var(--bg-card)] px-3 text-slate-500">or continue with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-cyan-500 text-white font-medium rounded-lg hover:bg-cyan-400 transition disabled:opacity-50"
            >
              {loading ? '...' : isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
