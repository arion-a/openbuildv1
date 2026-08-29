import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowUpRight, Copy, Check, ExternalLink, Mail, MessageSquare, Star, Hammer, Lightbulb, Activity } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from '../components/Avatar';
import { ShareMenu } from '../components/ShareMenu';
import { swatchGradient } from '../lib/swatch';

interface MakerBuild {
  id: string;
  title: string;
  tagline: string | null;
  domain: string | null;
  tools_used?: string[] | null;
  upvotes?: number;
  live_url?: string | null;
  review_count?: number;
  created_at: string;
}

interface MakerIdea {
  id: string;
  title: string;
  body: string | null;
  upvotes: number;
  thread_count?: number;
  build_id?: string | null;
  build_title?: string | null;
}

interface ActivityItem {
  kind: string;
  created_at: string;
  ref_id: string;
  title: string;
  extra?: string | null;
}

interface MakerData {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  github_username: string | null;
  github_url: string | null;
  lovable_url: string | null;
  replit_url: string | null;
  bolt_url: string | null;
  created_at: string;
  tools?: string[];
  is_self?: boolean;
  following?: boolean;
  follower_count?: number;
  badges?: string[];
  stats: {
    builds: number;
    ideas: number;
    stars_received: number;
    reviews_received: number;
    avg_rating?: number;
    rating_count?: number;
  };
  top_build?: MakerBuild | null;
  builds: MakerBuild[];
  ideas: MakerIdea[];
  activity: ActivityItem[];
}

const BADGE_LABEL: Record<string, string> = {
  first_build: 'Shipped a build',
  first_idea: 'Posted an idea',
  five_builds: '5+ builds',
  five_stars: '5+ stars',
  twentyfive_stars: '25+ stars',
  reviewed_three: 'Well reviewed',
  shipped_this_week: 'Shipping this week',
};

function WorkLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="ob-chip hover:text-[var(--cream)] hover:border-[rgba(255,77,46,0.4)]"
    >
      {label} <ExternalLink size={10} />
    </a>
  );
}

function timeAgo(date: string) {
  const hours = Math.floor((Date.now() - new Date(date).getTime()) / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function activityHref(item: ActivityItem) {
  if (item.kind === 'star_idea' || item.kind === 'comment_idea') return `/ideastream/${item.ref_id}`;
  return `/buildlive/${item.ref_id}`;
}

function activityLabel(item: ActivityItem) {
  switch (item.kind) {
    case 'star_build':
      return 'Starred a build';
    case 'star_idea':
      return 'Starred an idea';
    case 'review':
      return `Reviewed${item.extra ? ` · ${item.extra}★` : ''}`;
    case 'comment_build':
      return 'Commented on a build';
    case 'comment_idea':
      return 'Commented on an idea';
    default:
      return 'Activity';
  }
}

type Tab = 'builds' | 'ideas' | 'activity';

export function Maker() {
  const { handle } = useParams<{ handle: string }>();
  const { user, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [maker, setMaker] = useState<MakerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('builds');
  const [copied, setCopied] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    if (!handle) return;
    setLoading(true);
    setError('');
    setTab('builds');
    api.getMaker(handle)
      .then((m) => {
        setMaker(m);
        setFollowing(!!m.following);
      })
      .catch((err) => setError(err.message || 'Not found'))
      .finally(() => setLoading(false));
  }, [handle]);

  const toggleFollow = async () => {
    if (!isLoggedIn()) {
      navigate(`/auth?next=${encodeURIComponent(`/u/${handle}`)}`);
      return;
    }
    if (!handle) return;
    setFollowBusy(true);
    try {
      const res = await api.toggleFollow(handle);
      setFollowing(res.following);
    } catch {
      /* ignore */
    } finally {
      setFollowBusy(false);
    }
  };

  const shareProfile = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this profile link', url);
    }
  };

  if (loading) return <div className="p-6 text-[var(--muted)]">Loading profile...</div>;
  if (error || !maker) return <div className="p-6 text-[var(--muted)]">{error || 'Not found'}</div>;

  const isSelf = isLoggedIn() && user?.username === maker.username;
  const workLinks = [
    maker.github_url && { href: maker.github_url, label: maker.github_username ? `GitHub @${maker.github_username}` : 'GitHub' },
    maker.lovable_url && { href: maker.lovable_url, label: 'Lovable' },
    maker.replit_url && { href: maker.replit_url, label: 'Replit' },
    maker.bolt_url && { href: maker.bolt_url, label: 'Bolt' },
  ].filter(Boolean) as { href: string; label: string }[];

  const memberSince = maker.created_at
    ? new Date(maker.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : '';

  const stats = maker.stats || { builds: maker.builds.length, ideas: maker.ideas.length, stars_received: 0, reviews_received: 0 };
  const tools = maker.tools || [];

  const tabBtn = (id: Tab, icon: ReactNode, label: string, count?: number) => (
    <button
      onClick={() => setTab(id)}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
        tab === id
          ? 'bg-[rgba(255,77,46,0.16)] text-[var(--cream)]'
          : 'text-[var(--muted)] hover:text-[var(--cream)]'
      }`}
    >
      {icon} {label}
      {typeof count === 'number' && <span className="text-xs opacity-70">{count}</span>}
    </button>
  );

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-10 py-10 md:py-14">
      <div className="flex items-start gap-5 mb-6">
        <Avatar src={maker.avatar_url} name={[maker.display_name, maker.username]} size="xl" />
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-4xl md:text-5xl leading-tight">{maker.display_name || maker.username}</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            @{maker.username}
            {memberSince && <span> · since {memberSince}</span>}
          </p>
          {maker.bio && <p className="text-sm text-[var(--muted)] mt-3 leading-relaxed">{maker.bio}</p>}
          {(workLinks.length > 0 || tools.length > 0) && (
            <div className="flex flex-wrap gap-2 mt-4">
              {workLinks.map((l) => (
                <WorkLink key={l.label} href={l.href} label={l.label} />
              ))}
              {tools.map((t) => (
                <span key={t} className="ob-chip">{t}</span>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0">
          <ShareMenu
            url={`${window.location.origin}/u/${maker.username}`}
            title={maker.display_name || maker.username}
            summary={maker.bio || `${maker.display_name || maker.username} builds with AI on OpenBuild.`}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[
          { n: stats.builds, l: 'Builds' },
          { n: stats.ideas, l: 'Ideas' },
          { n: stats.stars_received, l: 'Stars' },
          {
            n: (stats.rating_count ?? 0) > 0 ? Number(stats.avg_rating).toFixed(1) : '—',
            l: (stats.rating_count ?? 0) > 0 ? `Rating · ${stats.rating_count}` : 'Rating',
          },
          { n: maker.follower_count ?? 0, l: 'Followers' },
        ].map((s) => (
          <div key={s.l} className="ob-panel px-4 py-3 text-center">
            <p className="font-display text-2xl">{s.n}</p>
            <p className="text-xs text-[var(--muted)] mt-0.5">{s.l}</p>
          </div>
        ))}
      </div>

      {maker.badges && maker.badges.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {maker.badges.map((b) => (
            <span key={b} className="signal-pill">{BADGE_LABEL[b] || b}</span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-8">
        {isSelf ? (
          <>
            <button onClick={() => navigate('/publish?kind=build')} className="btn-ember px-4 py-2 text-sm">
              Post a build
            </button>
            <button onClick={() => navigate('/publish?kind=idea')} className="btn-ghost px-4 py-2 text-sm">
              Post an idea
            </button>
            <Link to="/settings" className="btn-ghost px-4 py-2 text-sm">
              Edit profile
            </Link>
          </>
        ) : (
          <>
            <button
              onClick={toggleFollow}
              disabled={followBusy}
              className={`${following ? 'btn-ghost' : 'btn-ember'} px-4 py-2 text-sm disabled:opacity-50`}
            >
              {following ? 'Following' : 'Follow'}
            </button>
            <button
              onClick={() =>
                isLoggedIn()
                  ? navigate(`/messages?to=${maker.username}`)
                  : navigate(`/auth?next=${encodeURIComponent(`/messages?to=${maker.username}`)}`)
              }
              className="btn-ghost inline-flex items-center gap-2 px-4 py-2 text-sm"
            >
              <Mail size={14} /> Message
            </button>
          </>
        )}
        <button onClick={shareProfile} className="btn-ghost inline-flex items-center gap-2 px-4 py-2 text-sm">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Link copied' : 'Share profile'}
        </button>
      </div>

      <div className="flex flex-wrap gap-1 mb-8 border-b border-[var(--line)] pb-3">
        {tabBtn('builds', <Hammer size={14} />, 'Builds', stats.builds)}
        {tabBtn('ideas', <Lightbulb size={14} />, 'Ideas', stats.ideas)}
        {tabBtn('activity', <Activity size={14} />, 'Activity', maker.activity?.length)}
      </div>

      {tab === 'builds' && maker.top_build && (
        <p className="text-xs text-[var(--gold)] font-semibold mb-3">
          Featured · {maker.top_build.title}
        </p>
      )}

      {tab === 'builds' && (
        maker.builds.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No builds yet.</p>
        ) : (
          <ul className="grid gap-4">
            {(maker.top_build
              ? [maker.top_build, ...maker.builds.filter((b) => b.id !== maker.top_build!.id)]
              : maker.builds
            ).map((b) => (
              <li key={b.id} className="ob-card overflow-hidden">
                <Link to={`/buildlive/${b.id}`} className="block">
                  <div className="h-24" style={{ background: swatchGradient(b.title) }} />
                  <div className="p-5">
                    <p className="font-display text-2xl leading-tight">{b.title}</p>
                    {b.tagline && <p className="text-sm text-[var(--muted)] mt-2 line-clamp-2">{b.tagline}</p>}
                    <div className="flex flex-wrap items-center gap-3 mt-4 text-xs font-semibold text-[var(--muted)]">
                      <span className="inline-flex items-center gap-1"><Star size={12} /> {b.upvotes || 0}</span>
                      <span>{b.review_count || 0} reviews</span>
                    </div>
                  </div>
                </Link>
                {b.live_url && (
                  <div className="px-5 pb-5">
                    <a
                      href={b.live_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-[var(--gold)] hover:text-[var(--cream)]"
                    >
                      Open demo <ArrowUpRight size={14} />
                    </a>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )
      )}

      {tab === 'ideas' && (
        maker.ideas.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No ideas yet.</p>
        ) : (
          <ul className="space-y-3">
            {maker.ideas.map((idea) => (
              <li key={idea.id}>
                <Link to={`/ideastream/${idea.id}`} className="ob-card block p-5">
                  <p className="font-display text-xl leading-tight">{idea.title}</p>
                  {idea.body && <p className="text-sm text-[var(--muted)] mt-2 line-clamp-2">{idea.body}</p>}
                  <div className="flex flex-wrap items-center gap-3 mt-3 text-xs font-semibold text-[var(--muted)]">
                    <span className="inline-flex items-center gap-1"><Star size={12} /> {idea.upvotes || 0}</span>
                    <span className="inline-flex items-center gap-1"><MessageSquare size={12} /> {idea.thread_count || 0}</span>
                    {idea.build_id && idea.build_title && (
                      <span
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(`/buildlive/${idea.build_id}`);
                        }}
                        className="text-[var(--ember)] hover:underline"
                      >
                        Shipped as {idea.build_title}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )
      )}

      {tab === 'activity' && (
        !maker.activity?.length ? (
          <p className="text-sm text-[var(--muted)]">No public activity yet.</p>
        ) : (
          <ul className="space-y-2">
            {maker.activity.map((item, i) => (
              <li key={`${item.kind}-${item.ref_id}-${item.created_at}-${i}`}>
                <Link to={activityHref(item)} className="ob-panel block px-4 py-3 hover:border-[rgba(255,77,46,0.35)]">
                  <p className="text-xs text-[var(--ember)] font-semibold">{activityLabel(item)}</p>
                  <p className="text-sm mt-1">{item.title}</p>
                  {item.extra && item.kind.startsWith('comment') && (
                    <p className="text-xs text-[var(--muted)] mt-1 line-clamp-2">{item.extra}</p>
                  )}
                  <p className="text-xs text-[var(--muted)] mt-1">{timeAgo(item.created_at)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
