import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api } from '../lib/api';

const VALUE = [
  {
    head: 'Two minutes to post.',
    body: 'A live link, a few screenshots, and how you actually built it.',
  },
  {
    head: 'Signal, not vanity.',
    body: 'Stars, honest reviews, and the occasional “can I pay for this?”',
  },
  {
    head: 'Get discovered.',
    body: 'Search, domains, trending — someone with your exact problem is looking right now.',
  },
];

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
      <div className="relative z-[1] min-h-screen flex flex-col px-6 py-8 md:px-14 md:py-12 max-w-3xl mx-auto">
        <Link to="/" className="font-display text-2xl shrink-0">
          Open<span className="text-[var(--ember)]">Build</span>
        </Link>

        <div className="flex-1 flex flex-col justify-center py-14 md:py-10">
          <p className="label-kicker mb-4">Opening up this week</p>

          <h1 className="font-display text-4xl sm:text-5xl md:text-[3.5rem] leading-[0.98] [text-wrap:balance]">
            You shipped it.<br />
            Now let it get found.
          </h1>

          <p className="mt-6 text-[var(--cream)]/80 text-base md:text-lg leading-relaxed max-w-xl">
            OpenBuild is a home for what you make with AI. Post the app or the idea — people try it,
            star it, review it, and message you when they want more. No more links dying in a group chat.
          </p>

          <ul className="mt-9 space-y-4">
            {VALUE.map((v, i) => (
              <li key={v.head} className="flex gap-3.5">
                <span className="font-display text-[var(--ember)] text-sm leading-6 shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <p className="text-[0.95rem] leading-relaxed">
                  <span className="text-[var(--cream)] font-semibold">{v.head}</span>{' '}
                  <span className="text-[var(--cream)]/70">{v.body}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="shrink-0 space-y-5 pb-2">
          <Link
            to="/auth?mode=signup"
            className="btn-ember inline-flex items-center gap-2 px-7 py-3.5 text-sm"
          >
            Create your account <ArrowRight size={16} />
          </Link>

          <div className="pt-1">
            {status === 'done' ? (
              <p className="text-[var(--cream)] text-sm">
                You’re on the list — we’ll email you the moment it opens.
              </p>
            ) : (
              <form onSubmit={join} className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <span className="text-sm text-[var(--muted)] sm:mr-1">Rather wait for the crowd?</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="ob-input sm:max-w-[15rem] py-2 text-sm"
                  autoComplete="email"
                />
                <button
                  type="submit"
                  disabled={status === 'saving'}
                  className="btn-ghost px-4 py-2 text-sm disabled:opacity-50"
                >
                  {status === 'saving' ? 'One sec…' : 'Join the waitlist'}
                </button>
              </form>
            )}
            {status === 'error' && <p className="text-sm text-red-400 mt-2">{message}</p>}
          </div>

          <p className="text-sm text-[var(--muted)]">
            Already have an account?{' '}
            <Link
              to="/auth?next=/buildlive"
              className="text-[var(--cream)] underline underline-offset-4 hover:text-[var(--ember)]"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
