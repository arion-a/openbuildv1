import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Avatar } from '../components/Avatar';

interface Note {
  id: string;
  type: string;
  ref_kind: string | null;
  ref_id: string | null;
  ref_title: string | null;
  read_at: string | null;
  created_at: string;
  actor_username: string | null;
  actor_name: string | null;
  actor_avatar_url: string | null;
}

const VERB: Record<string, string> = {
  star_build: 'starred your build',
  review_build: 'reviewed your build',
  comment_build: 'commented on your build',
  star_idea: 'upvoted your idea',
  comment_idea: 'commented on your idea',
  message: 'sent you a message',
  follow: 'followed you',
};

function href(n: Note): string {
  if (n.type === 'message' && n.actor_username) return `/messages?to=${n.actor_username}`;
  if (n.type === 'follow' && n.actor_username) return `/u/${n.actor_username}`;
  if (n.ref_kind === 'build' && n.ref_id) return `/buildlive/${n.ref_id}`;
  if (n.ref_kind === 'idea' && n.ref_id) return `/ideastream/${n.ref_id}`;
  return '#';
}

function ago(d: string) {
  const h = Math.floor((Date.now() - +new Date(d)) / 3.6e6);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function Notifications() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getNotifications()
      .then(setNotes)
      .catch(() => setNotes([]))
      .finally(() => setLoading(false));
    api.markNotificationsRead().catch(() => {});
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-5 md:px-10 py-10 md:py-14">
      <div className="mb-6">
        <p className="label-kicker mb-2">You</p>
        <h1 className="font-display text-4xl">Activity</h1>
      </div>

      {loading ? (
        <p className="text-[var(--muted)]">Loading…</p>
      ) : notes.length === 0 ? (
        <div className="ob-panel p-10 text-center">
          <p className="text-[var(--muted)]">Nothing yet.</p>
          <p className="text-sm text-[var(--muted)] mt-2">Stars, reviews, comments and messages show up here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <Link
              key={n.id}
              to={href(n)}
              className={`ob-panel flex items-center gap-3 p-3.5 ${n.read_at ? '' : 'border-[var(--ember)]/40'}`}
            >
              <Avatar src={n.actor_avatar_url} name={[n.actor_name, n.actor_username]} size="sm" />
              <p className="text-sm flex-1 min-w-0">
                <span className="font-semibold">{n.actor_name || 'Someone'}</span>{' '}
                <span className="text-[var(--muted)]">{VERB[n.type] || 'did something'}</span>
                {n.ref_title && <span className="text-[var(--muted)]"> · {n.ref_title}</span>}
              </p>
              <span className="text-xs text-[var(--muted)] shrink-0">{ago(n.created_at)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
