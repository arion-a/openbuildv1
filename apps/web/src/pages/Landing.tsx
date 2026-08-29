import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

// The landing uses Manrope (not the Syne display face) for a smoother, calmer read.
const headline: React.CSSProperties = {
  fontFamily: '"Manrope", system-ui, sans-serif',
  fontWeight: 800,
  letterSpacing: '-0.02em',
};

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

      <Link
        to="/"
        className="absolute top-7 left-7 md:top-9 md:left-10 z-[1] font-display text-xl"
      >
        Open<span className="text-[var(--ember)]">Build</span>
      </Link>

      <div className="relative z-[1] min-h-screen flex flex-col items-center justify-center text-center px-6 py-16">
        <p className="text-sm text-[var(--muted)] mb-2.5">
          The unified interface for AI-built products
        </p>
        <p className="label-kicker mb-7">Opening soon</p>

        <h1
          style={headline}
          className="text-[2.4rem] sm:text-5xl md:text-[3.5rem] leading-[1.08] [text-wrap:balance] max-w-[20ch]"
        >
          You built it. Now how do people find it?
        </h1>

        <div className="mt-7 space-y-4 text-[var(--cream)]/75 text-base md:text-[1.05rem] leading-[1.75] max-w-[52ch]">
          <p>
            Millions of AI products ship every month. Most of them live scattered across dead
            links, or vanish into a group chat, a Twitter thread.
          </p>
          <p>
            OpenBuild gives your builds a real page — one people can find, try, review, and reach
            you through.
          </p>
        </div>

        <div className="mt-10 w-full max-w-sm">
          {status === 'done' ? (
            <p className="text-[var(--cream)] text-sm">
              You’re on the list — we’ll email you the moment it opens.
            </p>
          ) : (
            <form onSubmit={join} className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="ob-input text-sm text-center sm:text-left"
                autoComplete="email"
              />
              <button
                type="submit"
                disabled={status === 'saving'}
                className="btn-ember px-6 py-3 text-sm whitespace-nowrap disabled:opacity-50"
              >
                {status === 'saving' ? 'One sec…' : 'Join the waitlist'}
              </button>
            </form>
          )}
          {status === 'error' && <p className="text-sm text-red-400 mt-2">{message}</p>}
        </div>

        <div className="mt-6 flex items-center gap-3 text-sm text-[var(--muted)]">
          <Link
            to="/auth?mode=signup"
            className="text-[var(--cream)] underline underline-offset-4 hover:text-[var(--ember)]"
          >
            Create your page
          </Link>
          <span aria-hidden>·</span>
          <Link to="/auth?mode=signin&next=/buildlive" className="hover:text-[var(--cream)]">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
