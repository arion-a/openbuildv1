import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { api } from '../lib/api';
import { Avatar } from '../components/Avatar';
import { MakerLink } from '../components/MakerLink';
import { swatchGradient } from '../lib/swatch';

interface Results {
  q: string;
  builds: Array<{ id: string; title: string; tagline: string | null; domain: string | null; media: string[] | null; owner_name: string; owner_username: string }>;
  ideas: Array<{ id: string; title: string; body: string | null; domain: string | null; author: string; author_username: string }>;
  makers: Array<{ username: string; display_name: string; avatar_url: string | null; bio: string | null }>;
}

export function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const [input, setInput] = useState(q);
  const [res, setRes] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInput(q);
    if (q.trim().length < 2) {
      setRes(null);
      return;
    }
    setLoading(true);
    let live = true;
    api
      .search(q)
      .then((r) => live && setRes(r))
      .catch(() => live && setRes({ q, builds: [], ideas: [], makers: [] }))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [q]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setParams(input.trim() ? { q: input.trim() } : {});
  };

  const total = res ? res.builds.length + res.ideas.length + res.makers.length : 0;

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-10 py-10 md:py-14">
      <form onSubmit={submit} className="relative mb-8">
        <SearchIcon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none" />
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search builds, ideas, builders…"
          className="ob-input"
          style={{ paddingLeft: '2.75rem' }}
        />
      </form>

      {q.trim().length < 2 ? (
        <p className="text-[var(--muted)] text-sm">Type at least two characters.</p>
      ) : loading ? (
        <p className="text-[var(--muted)] text-sm">Searching…</p>
      ) : total === 0 ? (
        <p className="text-[var(--muted)] text-sm">Nothing matches “{q}”.</p>
      ) : (
        <div className="space-y-10">
          {res!.builds.length > 0 && (
            <section>
              <p className="label-kicker mb-3">Builds</p>
              <div className="space-y-3">
                {res!.builds.map((b) => (
                  <Link key={b.id} to={`/buildlive/${b.id}`} className="ob-card flex gap-4 p-4 items-center">
                    <div
                      className="shrink-0 h-14 w-20 rounded-lg bg-cover bg-center"
                      style={b.media?.[0] ? { backgroundImage: `url(${b.media[0]})` } : { background: swatchGradient(b.title) }}
                    />
                    <div className="min-w-0">
                      <p className="font-display text-lg leading-tight">{b.title}</p>
                      {b.tagline && <p className="text-sm text-[var(--muted)] line-clamp-1">{b.tagline}</p>}
                      <p className="text-xs text-[var(--muted)] mt-0.5">
                        {b.owner_name}
                        {b.domain ? ` · ${b.domain}` : ''}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {res!.ideas.length > 0 && (
            <section>
              <p className="label-kicker mb-3">Ideas</p>
              <div className="space-y-3">
                {res!.ideas.map((i) => (
                  <Link key={i.id} to={`/ideastream/${i.id}`} className="ob-card block p-4">
                    <p className="font-display text-lg leading-tight">{i.title}</p>
                    {i.body && <p className="text-sm text-[var(--muted)] line-clamp-2 mt-1">{i.body}</p>}
                    <p className="text-xs text-[var(--muted)] mt-1">
                      {i.author}
                      {i.domain ? ` · ${i.domain}` : ''}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {res!.makers.length > 0 && (
            <section>
              <p className="label-kicker mb-3">Builders</p>
              <div className="space-y-3">
                {res!.makers.map((m) => (
                  <MakerLink key={m.username} username={m.username} className="ob-card flex items-center gap-3 p-4">
                    <Avatar src={m.avatar_url} name={[m.display_name, m.username]} size="md" />
                    <div className="min-w-0">
                      <p className="font-display text-lg leading-tight">{m.display_name}</p>
                      <p className="text-xs text-[var(--muted)]">@{m.username}</p>
                      {m.bio && <p className="text-sm text-[var(--muted)] line-clamp-1 mt-0.5">{m.bio}</p>}
                    </div>
                  </MakerLink>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
