import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from '../components/Avatar';
import { MakerLink } from '../components/MakerLink';
import { FilterBar } from '../components/FilterBar';

const BASE_SORTS = [
  { id: 'new', label: 'Newest' },
  { id: 'trending', label: 'Popular' },
  { id: 'top', label: 'Most voted' },
  { id: 'discussed', label: 'Most discussed' },
];

interface Idea {
  id: string;
  title: string;
  body: string;
  domain?: string | null;
  media?: string[] | null;
  upvotes: number;
  upvoted?: boolean;
  thread_count: string | number;
  author: string;
  author_username?: string;
  author_avatar_url?: string;
  created_at: string;
}

function timeAgo(date: string) {
  const hours = Math.floor((Date.now() - new Date(date).getTime()) / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function IdeaStream() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [facets, setFacets] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sort, setSort] = useState('new');
  const [domain, setDomain] = useState('');
  const { user, isLoggedIn } = useAuth();
  const navigate = useNavigate();

  const domains = useMemo(
    () => [...new Set(facets.map((i) => i.domain).filter(Boolean) as string[])].sort(),
    [facets]
  );

  useEffect(() => {
    api.getIdeas().then(setFacets).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const fetcher =
      sort === 'following'
        ? api.followingFeed('ideas').then((r: any) => r.ideas)
        : (() => {
            const qs = new URLSearchParams();
            if (sort !== 'new') qs.set('sort', sort);
            if (domain) qs.set('domain', domain);
            return api.getIdeas(qs.toString());
          })();
    fetcher
      .then((rows: Idea[]) => {
        if (!cancelled) {
          setIdeas(rows);
          setLoadError('');
        }
      })
      .catch((err: any) => {
        if (!cancelled) setLoadError(err.message || 'Could not load ideas');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sort, domain]);

  const handleUpvote = async (e: React.MouseEvent, ideaId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn()) {
      navigate('/auth');
      return;
    }
    try {
      const res = await api.upvote(ideaId);
      setIdeas(ideas.map((i) => (i.id === ideaId ? { ...i, upvotes: res.upvotes, upvoted: res.upvoted } : i)));
    } catch {}
  };

  const goPublishIdea = () => {
    if (!isLoggedIn()) {
      navigate(`/auth?next=${encodeURIComponent('/publish?kind=idea')}`);
      return;
    }
    navigate('/publish?kind=idea');
  };

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-10 py-10 md:py-14">
      <h1 className="font-display text-4xl md:text-5xl leading-[0.95] mb-3">
        Ideas
      </h1>
      <p className="text-[var(--muted)] text-sm max-w-md mb-6 leading-relaxed">
        Early thoughts. Star or comment if you’d use it.
      </p>

      <button
        onClick={goPublishIdea}
        className="ob-card w-full flex items-center gap-3 px-4 py-4 text-left mb-6"
      >
        <Avatar src={user?.avatar_url} name={[user?.display_name, user?.username, user?.email]} size="md" />
        <span className="text-[var(--muted)]">What’s the idea?</span>
      </button>

      <FilterBar
        sort={sort}
        onSort={setSort}
        sorts={isLoggedIn() ? [...BASE_SORTS, { id: 'following', label: 'Following' }] : BASE_SORTS}
        domain={domain}
        onDomain={setDomain}
        domains={domains}
      />

      {loading ? (
        <p className="text-[var(--muted)]">Loading…</p>
      ) : loadError ? (
        <p className="text-[var(--muted)] text-sm">{loadError}</p>
      ) : ideas.length === 0 ? (
        <div className="ob-card p-10 text-center">
          <p className="font-display text-2xl mb-2">No ideas yet</p>
          <p className="text-[var(--muted)] text-sm">Post one if you want feedback before you build.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {ideas.map((idea) => (
            <article key={idea.id} className="ob-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <MakerLink username={idea.author_username}>
                  <Avatar src={idea.author_avatar_url} name={idea.author || idea.author_username} size="sm" />
                </MakerLink>
                <MakerLink username={idea.author_username} className="text-sm font-semibold hover:text-[var(--ember)]">
                  {idea.author || idea.author_username}
                </MakerLink>
                <span className="text-xs text-[var(--muted)]">{timeAgo(idea.created_at)}</span>
                {idea.domain && <span className="ob-chip">{idea.domain}</span>}
              </div>
              <Link to={`/ideastream/${idea.id}`} className="block">
                <div className="flex gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="title-plain text-xl md:text-2xl hover:text-[var(--ember)] transition-colors">{idea.title}</h2>
                    {idea.body && <p className="text-[0.95rem] leading-relaxed text-[var(--cream)]/75 mt-2 line-clamp-3">{idea.body}</p>}
                  </div>
                  {idea.media && idea.media[0] && (
                    <img src={idea.media[0]} alt="" className="shrink-0 h-20 w-20 rounded-lg object-cover border border-[var(--line)]" />
                  )}
                </div>
              </Link>
              <div className="flex items-center gap-4 mt-4 text-xs font-semibold text-[var(--muted)]">
                <button
                  onClick={(e) => handleUpvote(e, idea.id)}
                  className={idea.upvoted ? 'text-[var(--ember)]' : 'hover:text-[var(--cream)]'}
                >
                  ↑ {idea.upvotes || 0}
                </button>
                <Link to={`/ideastream/${idea.id}`} className="hover:text-[var(--cream)]">
                  {idea.thread_count || 0} comments
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
