import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Star } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from '../components/Avatar';
import { MakerLink } from '../components/MakerLink';
import { FilterBar } from '../components/FilterBar';
import { swatchGradient } from '../lib/swatch';

const BASE_SORTS = [
  { id: 'new', label: 'Newest' },
  { id: 'trending', label: 'Popular' },
  { id: 'top', label: 'Top rated' },
  { id: 'stars', label: 'Most starred' },
];

interface Project {
  id: string;
  title: string;
  tagline: string;
  domain?: string | null;
  media?: string[] | null;
  tools_used?: string[] | null;
  owner_name: string;
  owner_username?: string;
  live_url?: string | null;
  upvotes?: number;
  upvoted?: boolean;
  review_count?: number;
  avg_rating?: number;
  owner_avatar_url?: string;
}

export function BuildLive() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [facets, setFacets] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sort, setSort] = useState('new');
  const [domain, setDomain] = useState('');
  const [tool, setTool] = useState('');
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const ideaId = searchParams.get('idea');
  const sorts = isLoggedIn() ? [...BASE_SORTS, { id: 'following', label: 'Following' }] : BASE_SORTS;

  const domains = useMemo(
    () => [...new Set(facets.map((p) => p.domain).filter(Boolean) as string[])].sort(),
    [facets]
  );
  const tools = useMemo(
    () => [...new Set(facets.flatMap((p) => p.tools_used || []))].sort(),
    [facets]
  );

  // One unfiltered load to populate the filter dropdowns.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 8; i++) {
        try {
          const rows = await api.getProjects();
          if (!cancelled) setFacets(rows);
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 750));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const fetcher =
      sort === 'following'
        ? api.followingFeed('builds').then((r: any) => r.builds)
        : (() => {
            const qs = new URLSearchParams();
            if (sort !== 'new') qs.set('sort', sort);
            if (domain) qs.set('domain', domain);
            if (tool) qs.set('tool', tool);
            return api.getProjects(qs.toString());
          })();
    fetcher
      .then((rows: Project[]) => {
        if (cancelled) return;
        setProjects(rows);
        setLoadError('');
      })
      .catch((err: any) => {
        if (!cancelled) setLoadError(err.message || 'Could not load builds');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sort, domain, tool]);

  useEffect(() => {
    if (!ideaId) return;
    navigate(`/publish?kind=build&idea=${encodeURIComponent(ideaId)}`, { replace: true });
  }, [ideaId, navigate]);

  const handleVote = async (e: React.MouseEvent, projectId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn()) {
      navigate('/auth');
      return;
    }
    try {
      const res = await api.upvoteProject(projectId);
      setProjects(projects.map((p) => (p.id === projectId ? { ...p, upvotes: res.upvotes, upvoted: res.upvoted } : p)));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const goPublish = () => {
    if (!isLoggedIn()) {
      navigate(`/auth?next=${encodeURIComponent('/publish?kind=build')}`);
      return;
    }
    navigate('/publish?kind=build');
  };

  return (
    <div className="max-w-5xl mx-auto px-5 md:px-10 py-10 md:py-14">
      <div className="mb-6 md:mb-8">
        <h1 className="font-display text-4xl md:text-5xl leading-[0.95]">Builds</h1>
        <p className="text-[var(--muted)] max-w-lg text-sm mt-3 leading-relaxed">
          Live apps from people building with AI. Try one, star it, or post your own.
        </p>
      </div>

      <FilterBar
        sort={sort}
        onSort={setSort}
        sorts={sorts}
        domain={domain}
        onDomain={setDomain}
        domains={domains}
        tool={tool}
        onTool={setTool}
        tools={tools}
      />

      {loading ? (
        <p className="text-[var(--muted)]">Loading…</p>
      ) : loadError ? (
        <p className="text-[var(--muted)] text-sm">{loadError}</p>
      ) : projects.length === 0 ? (
        <div className="ob-card p-8 md:p-10">
          <p className="font-display text-2xl mb-2">{domain || tool ? 'Nothing here' : 'No builds yet'}</p>
          <p className="text-[var(--muted)] text-sm mb-6 max-w-md">
            {domain || tool ? 'Try a different filter.' : 'Post a live app and it will show up here.'}
          </p>
          <button onClick={goPublish} className="btn-ember px-5 py-2.5 text-sm">
            Post a build
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-5">
            {projects.map((project) => (
              <article key={project.id} className="ob-card overflow-hidden">
                <Link to={`/buildlive/${project.id}`} className="block">
                  {project.media && project.media[0] ? (
                    <div className="h-32 relative">
                      <img src={project.media[0]} alt="" className="h-32 w-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    </div>
                  ) : (
                    <div
                      className="h-32 relative"
                      style={{ background: swatchGradient(project.title) }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    </div>
                  )}
                  <div className="p-5 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-display text-2xl leading-tight">{project.title}</h2>
                      {(project.review_count ?? 0) > 0 && (
                        <span className="shrink-0 text-xs font-semibold text-[var(--gold)] mt-1">
                          ★ {Number(project.avg_rating).toFixed(1)}
                        </span>
                      )}
                    </div>
                    {project.tagline && (
                      <p className="text-[0.95rem] leading-relaxed text-[var(--cream)]/75 mt-2 line-clamp-2">{project.tagline}</p>
                    )}
                    {project.domain && (
                      <span className="ob-chip mt-3">{project.domain}</span>
                    )}
                  </div>
                </Link>
                <div className="px-5 pb-5 flex items-center justify-between gap-3">
                  <MakerLink username={project.owner_username} className="inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--cream)] min-w-0">
                    <Avatar src={project.owner_avatar_url} name={[project.owner_name, project.owner_username]} size="sm" />
                    <span className="truncate">{project.owner_name || project.owner_username || 'Maker'}</span>
                  </MakerLink>
                  <div className="flex items-center gap-3 text-xs font-semibold shrink-0">
                    <button
                      onClick={(e) => handleVote(e, project.id)}
                      className={`inline-flex items-center gap-1 ${project.upvoted ? 'text-[var(--ember)]' : 'text-[var(--muted)] hover:text-[var(--cream)]'}`}
                    >
                      <Star size={13} fill={project.upvoted ? 'currentColor' : 'none'} /> {project.upvotes || 0}
                    </button>
                    {project.live_url && (
                      <a
                        href={project.live_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-0.5 text-[var(--gold)] hover:text-[var(--cream)]"
                      >
                        Try it <ArrowUpRight size={12} />
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
      )}
    </div>
  );
}
