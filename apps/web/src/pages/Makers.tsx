import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Avatar } from '../components/Avatar';

interface MakerCard {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  stats: {
    builds: number;
    ideas: number;
    stars_received: number;
    reviews_received: number;
    shipped_this_week: number;
  };
}

type Sort = 'newest' | 'starred' | 'shipped';

export function Makers() {
  const [sort, setSort] = useState<Sort>('newest');
  const [makers, setMakers] = useState<MakerCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api.getMakers(sort)
      .then(setMakers)
      .catch((err) => setError(err.message || 'Could not load builders'))
      .finally(() => setLoading(false));
  }, [sort]);

  const chip = (id: Sort, label: string) => (
    <button
      onClick={() => setSort(id)}
      className={sort === id ? 'btn-ember px-4 py-1.5 text-xs' : 'btn-ghost px-4 py-1.5 text-xs'}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-5xl mx-auto px-5 md:px-10 py-10 md:py-14">
      <h1 className="font-display text-4xl md:text-5xl leading-[0.95] mb-3">
        Builders
      </h1>
      <p className="text-[var(--muted)] text-sm max-w-md mb-8 leading-relaxed">
        People on OpenBuild and what they’ve posted.
      </p>

      <div className="flex flex-wrap gap-2 mb-8">
        {chip('newest', 'Newest')}
        {chip('starred', 'Most starred')}
        {chip('shipped', 'Shipped this week')}
      </div>

      {loading ? (
        <p className="text-[var(--muted)]">Loading…</p>
      ) : error ? (
        <p className="text-[var(--muted)] text-sm">{error}</p>
      ) : makers.length === 0 ? (
        <div className="ob-card p-10 text-center">
          <p className="font-display text-3xl mb-2">No builders yet</p>
          <p className="text-[var(--muted)] text-sm">Publish a build or idea and you’ll show up here.</p>
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-4">
          {makers.map((m) => (
            <li key={m.username}>
              <Link to={`/u/${m.username}`} className="ob-card block p-5">
                <div className="flex items-start gap-3">
                  <Avatar src={m.avatar_url} name={[m.display_name, m.username]} size="lg" />
                  <div className="min-w-0">
                    <p className="font-display text-xl truncate">{m.display_name || m.username}</p>
                    <p className="text-xs text-[var(--muted)]">@{m.username}</p>
                    {m.bio && <p className="text-sm text-[var(--muted)] mt-2 line-clamp-2">{m.bio}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 mt-4 text-xs font-semibold text-[var(--muted)]">
                  <span>{m.stats.builds} builds</span>
                  <span>{m.stats.stars_received} stars</span>
                  <span>{m.stats.reviews_received} reviews</span>
                  {sort === 'shipped' && m.stats.shipped_this_week > 0 && (
                    <span className="text-[var(--ember)]">{m.stats.shipped_this_week} this week</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
