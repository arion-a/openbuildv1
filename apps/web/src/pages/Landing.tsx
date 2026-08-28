import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export function Landing() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('saving');
    setMessage('');
    try {
      await api.joinWaitlist(email.trim());
      setStatus('done');
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message || 'That didn’t go through.');
    }
  };

  return (
    <div className="ob-enter">
      <div className="ob-enter-glow" aria-hidden />
      <div className="relative z-[1] min-h-screen flex flex-col justify-between px-6 py-8 md:px-14 md:py-12 max-w-3xl mx-auto">
        <Link to="/" className="font-display text-2xl">
          Open<span className="text-[var(--ember)]">Build</span>
        </Link>

        <div className="py-12 md:py-0">
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl leading-[0.95] mb-8">
            You made a thing.<br />
            Then what?
          </h1>
          <div className="space-y-4 text-[var(--muted)] text-base md:text-lg leading-relaxed max-w-xl">
            <p>
              You finish something in Cursor or Lovable, send the link around, and it kind of dies in the chat.
            </p>
            <p>
              This is a place for the actual app. People can try it, star it, leave a note if they used it. Your page is just your work, sitting somewhere it won’t get buried.
            </p>
            <p>Ideas can live here too, if you’re still chewing on one.</p>
          </div>
        </div>

        <div className="space-y-4 pb-4">
          {status === 'done' ? (
            <p className="text-[var(--cream)]">You’re on the list. We’ll write when it’s time.</p>
          ) : (
            <form onSubmit={join} className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="ob-input sm:max-w-xs"
                autoComplete="email"
              />
              <button type="submit" disabled={status === 'saving'} className="btn-ember px-6 py-3 text-sm disabled:opacity-50">
                {status === 'saving' ? 'One sec…' : 'Join the waitlist'}
              </button>
            </form>
          )}
          {status === 'error' && <p className="text-sm text-red-400">{message}</p>}
          <p className="text-sm text-[var(--muted)]">
            Already in?{' '}
            <Link to="/auth?next=/buildlive" className="text-[var(--cream)] underline underline-offset-4 hover:text-[var(--ember)]">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
