import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Hammer, History, ImagePlus, Loader2, Mail, MessageSquare, Pencil, Save, Send, Sparkles, ThumbsUp, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from '../components/Avatar';
import { MakerLink } from '../components/MakerLink';
import { Gallery } from '../components/Gallery';
import { RichText } from '../components/RichText';
import { HistoryPanel } from '../components/HistoryPanel';
import { imageUploadEnabled, uploadImages } from '../lib/uploadImage';

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
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', body: '', domain: '' });
  const [editMedia, setEditMedia] = useState<string[]>([]);
  const [mediaBusy, setMediaBusy] = useState(false);
  const editMediaInput = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const { user, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const isOwner = idea && user && user.username === idea.author_username;

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

  const startEdit = () => {
    if (!idea) return;
    setEditForm({ title: idea.title || '', body: idea.body || '', domain: idea.domain || '' });
    setEditMedia(Array.isArray(idea.media) ? idea.media : []);
    setEditing(true);
  };

  const addEditScreenshots = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setMediaBusy(true);
    try {
      const uploaded = await uploadImages(files.slice(0, 12 - editMedia.length));
      setEditMedia((prev) => [...prev, ...uploaded.map((u) => u.url)].slice(0, 12));
    } catch (err: any) {
      alert(err.message || 'Could not add those images.');
    } finally {
      setMediaBusy(false);
    }
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await api.updateIdea(id, {
        title: editForm.title,
        body: editForm.body,
        domain: editForm.domain,
        media: editMedia,
      });
      setIdea((prev) => (prev ? { ...prev, ...updated } : prev));
      setEditing(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await api.deleteIdea(id);
      navigate('/ideastream', { replace: true });
    } catch (err: any) {
      alert(err.message || 'Could not delete this idea.');
      setDeleting(false);
    }
  };

  const toggleHistory = async () => {
    if (!id) return;
    const next = !showHistory;
    setShowHistory(next);
    if (next && history.length === 0) {
      setHistoryLoading(true);
      try {
        setHistory(await api.getIdeaHistory(id));
      } catch {
        setHistory([]);
      } finally {
        setHistoryLoading(false);
      }
    }
  };

  if (loading) return <p className="max-w-3xl mx-auto p-6 text-[var(--muted)]">Loading…</p>;
  if (notFound || !idea) return <p className="max-w-3xl mx-auto p-6 text-[var(--muted)]">Idea not found.</p>;

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-10 py-10 md:py-14 space-y-5">
      <div className="ob-panel p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
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
          {isOwner && !editing && (
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={startEdit} className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
                <Pencil size={12} /> Edit
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:text-red-300"
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>
          )}
          {editing && (
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={handleSave} disabled={saving} className="btn-ember inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50">
                <Save size={12} /> {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
                <X size={12} /> Cancel
              </button>
            </div>
          )}
        </div>

        {confirmDelete && (
          <div className="ob-panel p-4 mb-4 border border-red-400/40 space-y-3">
            <p className="text-sm">
              Delete this idea? It disappears from every feed immediately. This can't be undone from here — an admin would need direct database access to bring it back, though the record is kept internally for the audit history.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="btn-ghost px-4 py-2 text-sm text-red-400 hover:text-red-300 border-red-400/60 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Yes, delete it'}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="btn-ghost px-4 py-2 text-sm">
                Cancel
              </button>
            </div>
          </div>
        )}

        {editing ? (
          <div className="space-y-3">
            <input
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              className="ob-input title-plain text-xl"
              placeholder="The idea, in a line"
            />
            <textarea
              value={editForm.body}
              onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
              className="ob-input h-28 resize-none text-sm"
              placeholder="Who is this for, and how would it work?"
            />
            <input
              value={editForm.domain}
              onChange={(e) => setEditForm({ ...editForm, domain: e.target.value })}
              className="ob-input text-sm"
              placeholder="Domain — productivity, devtools, finance, …"
            />
            {imageUploadEnabled() && (
              <div className="space-y-2">
                <span className="text-xs text-[var(--muted)]">Sketches or references</span>
                <div className="flex flex-wrap items-center gap-2">
                  {editMedia.map((url, i) => (
                    <div key={url} className="relative">
                      <img src={url} alt={`image ${i + 1}`} className="h-16 w-16 rounded-lg object-cover border border-[var(--line)]" />
                      <button
                        type="button"
                        onClick={() => setEditMedia(editMedia.filter((_, j) => j !== i))}
                        className="absolute -top-1.5 -right-1.5 bg-[var(--bg)] border border-[var(--line)] rounded-full p-0.5 text-[var(--muted)] hover:text-[var(--cream)]"
                        aria-label="Remove image"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                  {editMedia.length < 12 && (
                    <button
                      type="button"
                      onClick={() => editMediaInput.current?.click()}
                      disabled={mediaBusy}
                      className="h-16 w-16 rounded-lg border border-dashed border-[var(--line)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--cream)] hover:border-[var(--ember)]/50 disabled:opacity-50"
                      aria-label="Add images"
                    >
                      {mediaBusy ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                    </button>
                  )}
                </div>
                <input ref={editMediaInput} type="file" accept="image/*" multiple className="hidden" onChange={addEditScreenshots} />
              </div>
            )}
          </div>
        ) : (
          <>
            <h1 className="title-plain text-2xl md:text-3xl">{idea.title}</h1>
            {idea.body && (
              <RichText text={idea.body} className="text-sm text-[var(--muted)] mt-3 leading-relaxed" />
            )}
            {(idea.media || []).length > 0 && (
              <div className="mt-4">
                <Gallery images={idea.media as string[]} title={idea.title} />
              </div>
            )}
          </>
        )}

        {!editing && (
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
        )}
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

      {isOwner && (
        <button
          onClick={toggleHistory}
          className="mt-2 text-xs text-[var(--muted)] hover:text-[var(--cream)] inline-flex items-center gap-1"
        >
          <History size={12} /> {showHistory ? 'Hide edit history' : 'Edit history'}
        </button>
      )}

      {isOwner && showHistory && (
        <div className="mt-4">
          {historyLoading ? <p className="text-xs text-[var(--muted)]">Loading…</p> : <HistoryPanel entries={history} />}
        </div>
      )}
    </div>
  );
}
