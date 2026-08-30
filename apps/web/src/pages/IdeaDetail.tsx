import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Hammer, Mail, MessageSquare, Send, Sparkles, ThumbsUp } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from '../components/Avatar';
import { MakerLink } from '../components/MakerLink';
import { Gallery } from '../components/Gallery';
import { RichText } from '../components/RichText';

interface Idea {
  id: string;
  title: string;
  body: string;
  domain?: string | null;
  media?: string[] | null;
  upvotes: number;
  upvoted?: boolean;
  author: string;
  author_username?: string;
  author_avatar_url?: string;
  created_at: string;
  build?: { id: string; title: string } | null;
}

interface Thread {
  id: string;
  body: string;
  username: string;
  handle?: string;
  avatar_url?: string;
  created_at: string;
}

function timeAgo(date: string) {
  const hours = Math.floor((Date.now() - new Date(date).getTime()) / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function IdeaDetail() {
  const { id } = useParams<{ id: string }>();
  const [idea, setIdea] = useState<Idea | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarising, setSummarising] = useState(false);
  const [newReply, setNewReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const { user, isLoggedIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getIdea(id), api.getThreads(id).catch(() => [])])
      .then(([loaded, t]) => {
        setIdea(loaded);
        setThreads(t);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  const handleVote = async () => {
    if (!id || !isLoggedIn()) {
      navigate('/auth');
      return;
    }
    try {
      const res = await api.upvote(id);
      setIdea((prev) => (prev ? { ...prev, upvotes: res.upvotes, upvoted: res.upvoted } : prev));
    } catch {}
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !newReply.trim()) return;
    if (!isLoggedIn()) {
      navigate('/auth');
      return;
    }
    const thread = await api.postThread(id, { body: newReply.trim() });
    setThreads([...threads, thread]);
    setNewReply('');
  };

  const handleSummarise = async () => {
    if (!id) return;
    setSummarising(true);
    try {
      const res = await api.summarise(id);
      setSummary(res.summary);
    } finally {
      setSummarising(false);
    }
  };

  const handleBuiltThis = () => {
    if (!id) return;
    if (!isLoggedIn()) {
      navigate(`/auth?next=${encodeURIComponent(`/publish?kind=build&idea=${id}`)}`);
      return;
    }
    navigate(`/publish?kind=build&idea=${encodeURIComponent(id)}`);
  };

  if (loading) return <p className="max-w-3xl mx-auto p-6 text-[var(--muted)]">Loading…</p>;
  if (notFound || !idea) return <p className="max-w-3xl mx-auto p-6 text-[var(--muted)]">Idea not found.</p>;

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-10 py-10 md:py-14 space-y-5">
      <div className="ob-panel p-6">
        <div className="flex items-center gap-3 mb-4">
          <MakerLink username={idea.author_username}>
            <Avatar src={idea.author_avatar_url} name={idea.author || idea.author_username} size="md" />
          </MakerLink>
          <div>
            <MakerLink username={idea.author_username} className="text-sm font-semibold hover:text-[var(--ember)]">
              {idea.author || idea.author_username}
            </MakerLink>
            <span className="text-xs text-[var(--muted)] ml-2">{timeAgo(idea.created_at)}</span>
            {idea.domain && <span className="ob-chip ml-2 align-middle">{idea.domain}</span>}
          </div>
        </div>
        <h1 className="title-plain text-2xl md:text-3xl">{idea.title}</h1>
        {idea.body && (
          <RichText text={idea.body} className="text-sm text-[var(--muted)] mt-3 leading-relaxed" />
        )}
        {(idea.media || []).length > 0 && (
          <div className="mt-4">
            <Gallery images={idea.media as string[]} title={idea.title} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-6">
          <button
            onClick={handleVote}
            className={`btn-ghost flex items-center gap-1.5 px-4 py-2 text-xs ${
              idea.upvoted ? 'text-[var(--ember)] border-[var(--ember)]' : ''
            }`}
          >
            <ThumbsUp size={12} /> Vote {idea.upvotes || 0}
          </button>
          {idea.build ? (
            <Link
              to={`/buildlive/${idea.build.id}`}
              className="btn-ember flex items-center gap-1.5 px-4 py-2 text-xs"
            >
              <Hammer size={12} /> Built: {idea.build.title}
            </Link>
          ) : (
            <button
              onClick={handleBuiltThis}
              className="btn-ember flex items-center gap-1.5 px-4 py-2 text-xs"
            >
              <Hammer size={12} /> I built this
            </button>
          )}
          {idea.author_username && user?.username !== idea.author_username && isLoggedIn() && (
            <button
              onClick={() => navigate(`/messages?to=${idea.author_username}`)}
              className="btn-ghost flex items-center gap-1.5 px-4 py-2 text-xs"
            >
              <Mail size={12} /> Message
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <h2 className="font-display text-xl flex items-center gap-2">
          <MessageSquare size={16} /> Comments ({threads.length})
        </h2>
        {isLoggedIn() && threads.length > 0 && (
          <button
            onClick={handleSummarise}
            disabled={summarising}
            className="text-xs text-[var(--muted)] hover:text-[var(--cream)] disabled:opacity-50"
          >
            <Sparkles size={10} className="inline mr-1" />
            {summarising ? 'Summarising…' : 'Summarise'}
          </button>
        )}
      </div>

      {summary && (
        <div className="ob-panel p-4">
          <p className="label-kicker mb-2">AI summary</p>
          <p className="text-sm whitespace-pre-wrap">{summary}</p>
        </div>
      )}

      <div className="space-y-3">
        {threads.map((thread) => (
          <div key={thread.id} className="ob-panel p-4">
            <div className="flex items-center gap-3 mb-2">
              <MakerLink username={thread.handle}>
                <Avatar src={thread.avatar_url} name={thread.username} size="sm" />
              </MakerLink>
              <MakerLink username={thread.handle} className="text-sm font-semibold hover:text-[var(--ember)]">
                {thread.username}
              </MakerLink>
              <span className="text-xs text-[var(--muted)]">{timeAgo(thread.created_at)}</span>
            </div>
            <p className="text-sm text-[var(--muted)] leading-relaxed">{thread.body}</p>
          </div>
        ))}
        {threads.length === 0 && (
          <p className="text-sm text-[var(--muted)] text-center py-6">No comments yet.</p>
        )}
      </div>

      {isLoggedIn() ? (
        <form onSubmit={handleReply} className="ob-panel p-4 flex items-center gap-3">
          <Avatar src={user?.avatar_url} name={[user?.display_name, user?.username, user?.email]} size="md" />
          <input
            value={newReply}
            onChange={(e) => setNewReply(e.target.value)}
            placeholder="Comment…"
            className="ob-input flex-1"
          />
          <button type="submit" className="btn-ember p-2.5">
            <Send size={16} />
          </button>
        </form>
      ) : (
        <button onClick={() => navigate('/auth')} className="w-full py-3 text-sm text-[var(--muted)] hover:text-[var(--cream)]">
          Log in to comment
        </button>
      )}

      {isLoggedIn() && user?.username !== idea.author_username && (
        <button
          onClick={async () => {
            const detail = window.prompt('Report this idea — what’s wrong? (optional)');
            if (detail === null) return;
            try {
              await api.report({ kind: 'idea', ref_id: idea.id, detail: detail || undefined });
              alert('Thanks — the team will take a look.');
            } catch (err: any) {
              alert(err.message || 'Could not send that.');
            }
          }}
          className="mt-6 text-xs text-[var(--muted)] hover:text-[var(--cream)]"
        >
          Report
        </button>
      )}
    </div>
  );
}
