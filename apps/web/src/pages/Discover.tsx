import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, MessageSquare, Star } from 'lucide-react';
import { api } from '../lib/api';
import { Avatar } from '../components/Avatar';
import { MakerLink } from '../components/MakerLink';
import { swatchGradient } from '../lib/swatch';

interface Build {
  id: string;
  title: string;
  tagline: string | null;
  domain: string | null;
  media?: string[] | null;
  live_url?: string | null;
  avg_rating?: number;
  review_count?: number;
  owner_name: string;
  owner_username?: string;
  owner_avatar_url?: string;
}
interface Idea {
  id: string;
  title: string;
  body: string | null;
  domain: string | null;
  thread_count?: string | number;
  author: string;
  author_username?: string;
  author_avatar_url?: string;
}

export function Discover() {
  const [builds, setBuilds] = useState<Build[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getProjects('sort=trending&limit=40'),
      api.getIdeas('sort=trending&limit=40'),
    ])
      .then(([b, i]) => {
        setBuilds(b);
        setIdeas(i);
      })
      .finally(() => setLoading(false));
  }, []);

  const domains = useMemo(
    () =>
      [
        ...new Set(
          [...builds, ...ideas].map((x) => x.domain).filter(Boolean) as string[]
        ),
      ].sort(),
    [builds, ideas]
  );

  const b = domain ? builds.filter((x) => x.domain === domain) : builds;
  const i = domain ? ideas.filter((x) => x.domain === domain) : ideas;

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-10 py-10 md:py-14">
      <h1 className="font-display text-4xl md:text-5xl leading-[0.95]">Discover</h1>
      <p className="text-[var(--cream)]/70 text-[0.95rem] mt-3 mb-7 max-w-lg leading-relaxed">
        Find something to use — or something worth building. Sorted by what people are actually engaging with.
      </p>

      <div className="flex flex-wrap gap-2 mb-8">
        <button
          onClick={() => setDomain('')}
          className={domain === '' ? 'btn-ember px-3.5 py-1.5 text-xs' : 'btn-ghost px-3.5 py-1.5 text-xs'}
        >
          Everything
        </button>
        {domains.map((d) => (
          <button
            key={d}
            onClick={() => setDomain(d)}
            className={domain === d ? 'btn-ember px-3.5 py-1.5 text-xs' : 'btn-ghost px-3.5 py-1.5 text-xs'}
          >
            {d}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-[var(--muted)]">Loading…</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-x-10 gap-y-10">
          <section>
            <p className="label-kicker mb-4">Try these</p>
            {b.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Nothing here yet.</p>
            ) : (
              <div className="space-y-4">
                {b.map((x) => (
                  <div key={x.id} className="ob-card p-5">
                    <Link to={`/buildlive/${x.id}`} className="flex gap-4">
                      <div
                        className="shrink-0 h-16 w-24 rounded-lg bg-cover bg-center"
                        style={
                          x.media?.[0]
                            ? { backgroundImage: `url(${x.media[0]})` }
                            : { background: swatchGradient(x.title) }
                        }
                      />
                      <div className="min-w-0">
                        <p className="title-plain text-lg">{x.title}</p>
                        {x.tagline && (
                          <p className="text-[0.95rem] leading-relaxed text-[var(--cream)]/75 line-clamp-2 mt-1">{x.tagline}</p>
                        )}
                      </div>
                    </Link>
                    <div className="flex items-center justify-between mt-4 text-xs">
                      <MakerLink
                        username={x.owner_username}
                        className="inline-flex items-center gap-1.5 text-[var(--muted)] hover:text-[var(--cream)]"
                      >
                        <Avatar src={x.owner_avatar_url} name={[x.owner_name, x.owner_username]} size="xs" />
                        {x.owner_name}
                      </MakerLink>
                      <div className="flex items-center gap-3 font-semibold">
                        {(x.review_count ?? 0) > 0 && (
                          <span className="text-[var(--gold)] inline-flex items-center gap-1">
                            <Star size={11} fill="currentColor" /> {Number(x.avg_rating).toFixed(1)}
                          </span>
                        )}
                        {x.live_url && (
                          <a
                            href={x.live_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[var(--gold)] hover:text-[var(--cream)] inline-flex items-center gap-0.5"
                          >
                            Try it <ArrowUpRight size={12} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <p className="label-kicker gold mb-4">Wanted</p>
            {i.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No open ideas here yet.</p>
            ) : (
              <div className="space-y-4">
                {i.map((x) => (
                  <Link key={x.id} to={`/ideastream/${x.id}`} className="ob-card block p-5">
                    <p className="title-plain text-lg">{x.title}</p>
                    {x.body && (
                      <p className="text-[0.95rem] leading-relaxed text-[var(--cream)]/75 line-clamp-2 mt-1.5">{x.body}</p>
                    )}
                    <div className="flex items-center gap-3 mt-4 text-xs text-[var(--muted)]">
                      <span className="inline-flex items-center gap-1.5">
                        <Avatar src={x.author_avatar_url} name={[x.author, x.author_username]} size="xs" />
                        {x.author}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare size={11} /> {x.thread_count || 0}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
