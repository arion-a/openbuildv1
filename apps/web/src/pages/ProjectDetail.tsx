import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ExternalLink, Pencil, Save, X, Star, Send, GitFork } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from '../components/Avatar';
import { MakerLink } from '../components/MakerLink';

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<any>(null);
  const [threads, setThreads] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [comment, setComment] = useState('');
  const [reviewBody, setReviewBody] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewing, setReviewing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [joining, setJoining] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    tagline: '',
    live_url: '',
    tools_used: '',
  });
  const { isLoggedIn, user } = useAuth();
  const navigate = useNavigate();
  const isOwner = project && user && project.owner_id === user.id;
  const sourceUrl = project?.git_url || (project?.repo_name ? `http://localhost:3000/${project.repo_name}` : null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.getProject(id),
      api.getProjectThreads(id).catch(() => []),
      api.getProjectReviews(id).catch(() => []),
    ])
      .then(([p, t, r]) => {
        setProject(p);
        setThreads(t);
        setReviews(r);
        if (p?.my_review) {
          setReviewRating(p.my_review.rating);
          setReviewBody(p.my_review.body || '');
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const startEdit = () => {
    setEditForm({
      title: project.title || '',
      tagline: project.tagline || '',
      live_url: project.live_url || '',
      tools_used: (project.tools_used || []).join(', '),
    });
    setEditing(true);
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await api.updateProject(id, {
        title: editForm.title,
        tagline: editForm.tagline,
        live_url: editForm.live_url,
        tools_used: editForm.tools_used.split(',').map((t) => t.trim()).filter(Boolean),
      });
      setProject({ ...project, ...updated });
      setEditing(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleVote = async () => {
    if (!id || !isLoggedIn()) {
      navigate('/auth');
      return;
    }
    try {
      const res = await api.upvoteProject(id);
      setProject({ ...project, upvotes: res.upvotes, upvoted: res.upvoted });
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !isLoggedIn()) {
      navigate('/auth');
      return;
    }
    setReviewing(true);
    try {
      const saved = await api.postProjectReview(id, { rating: reviewRating, body: reviewBody.trim() });
      setReviews([saved, ...reviews.filter((r) => r.handle !== user?.username && r.user_id !== user?.id)]);
      setProject({
        ...project,
        my_review: saved,
        review_count: reviews.some((r) => r.handle === user?.username || r.user_id === user?.id)
          ? project.review_count
          : (project.review_count || 0) + 1,
      });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setReviewing(false);
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !comment.trim()) return;
    try {
      const thread = await api.postProjectThread(id, { body: comment.trim() });
      setThreads([...threads, thread]);
      setComment('');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleJoin = async () => {
    if (!id) return;
    setJoining(true);
    try {
      const session = await api.joinProject(id);
      navigate(`/session/${session.session_id}`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setJoining(false);
    }
  };

  if (loading) return <div className="p-6 text-[var(--muted)]">Loading...</div>;
  if (!project || project.error) return <div className="p-6 text-[var(--muted)]">Build not found</div>;

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-10 py-10 md:py-14">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          {editing ? (
            <input
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              className="ob-input font-display text-2xl"
            />
          ) : (
            <h1 className="font-display text-4xl md:text-5xl leading-tight">{project.title}</h1>
          )}
          <MakerLink username={project.owner_username} className="inline-flex items-center gap-2 mt-3 text-sm text-[var(--muted)] hover:text-[var(--cream)]">
            <Avatar src={project.owner_avatar_url} name={[project.owner_name, project.owner_username]} size="xs" />
            {project.owner_name}
          </MakerLink>
        </div>
        {isOwner && !editing && (
          <button onClick={startEdit} className="btn-ghost inline-flex items-center gap-1.5 px-4 py-2 text-sm">
            <Pencil size={14} /> Edit
          </button>
        )}
        {editing && (
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="btn-ember inline-flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-50">
              <Save size={14} /> {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} className="btn-ghost inline-flex items-center gap-1.5 px-4 py-2 text-sm">
              <X size={14} /> Cancel
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <input
          value={editForm.tagline}
          onChange={(e) => setEditForm({ ...editForm, tagline: e.target.value })}
          placeholder="One-line description"
          className="ob-input mb-4"
        />
      ) : (
        project.tagline && <p className="text-[var(--muted)] mb-6 text-lg">{project.tagline}</p>
      )}

      {editing ? (
        <div className="space-y-3 mb-6">
          <input
            value={editForm.live_url}
            onChange={(e) => setEditForm({ ...editForm, live_url: e.target.value })}
            placeholder="Demo URL"
            className="ob-input"
          />
          <input
            value={editForm.tools_used}
            onChange={(e) => setEditForm({ ...editForm, tools_used: e.target.value })}
            placeholder="Lovable, Bolt, …"
            className="ob-input"
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-8">
            {project.live_url && (
              <a
                href={project.live_url}
                target="_blank"
                rel="noreferrer"
                className="btn-ember inline-flex items-center gap-2 px-4 py-2 text-sm"
              >
                <ExternalLink size={14} /> Try it
              </a>
            )}
            <button
              onClick={handleVote}
              className={`btn-ghost inline-flex items-center gap-2 px-4 py-2 text-sm ${
                project.upvoted ? 'border-[var(--ember)] text-[var(--ember)]' : ''
              }`}
            >
              <Star size={14} fill={project.upvoted ? 'currentColor' : 'none'} /> Star {project.upvotes || 0}
            </button>
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost inline-flex items-center gap-2 px-4 py-2 text-sm"
              >
                Source
              </a>
            )}
          </div>

          {(project.tools_used || []).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-8">
              {project.tools_used.map((tool: string) => (
                <span key={tool} className="ob-chip">
                  {tool}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      <div className="mb-10">
        <h3 className="font-display text-2xl mb-2">Reviews</h3>
        <p className="text-sm text-[var(--muted)] mb-4">
          {project.review_count || 0} review{(project.review_count || 0) === 1 ? '' : 's'}
          {project.avg_rating > 0 && ` · ${Number(project.avg_rating).toFixed(1)} average`}
        </p>
        {isLoggedIn() && user?.id !== project.owner_id && (
          <form onSubmit={handleReview} className="ob-panel p-4 mb-4 space-y-3">
            <p className="text-xs font-semibold text-[var(--muted)]">
              {project.my_review ? 'Your review' : 'Leave a review'}
            </p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setReviewRating(n)}
                  className={`p-1 ${n <= reviewRating ? 'text-[var(--gold)]' : 'text-[var(--muted)]'}`}
                  aria-label={`${n} stars`}
                >
                  <Star size={18} fill={n <= reviewRating ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
            <textarea
              value={reviewBody}
              onChange={(e) => setReviewBody(e.target.value)}
              placeholder="What did you think?"
              className="ob-input h-20 resize-none"
              maxLength={2000}
            />
            <button type="submit" disabled={reviewing} className="btn-ember px-4 py-2 text-sm disabled:opacity-50">
              {reviewing ? 'Saving…' : project.my_review ? 'Update review' : 'Post review'}
            </button>
          </form>
        )}
        {!isLoggedIn() && (
          <Link to="/auth" className="text-sm text-[var(--muted)] hover:text-[var(--cream)] block mb-4">
            Sign in to review
          </Link>
        )}
        <div className="space-y-3">
          {reviews.map((rev) => (
            <div key={rev.id} className="ob-panel p-4">
              <div className="flex items-center gap-2 mb-2">
                <MakerLink username={rev.handle} className="inline-flex items-center gap-2">
                  <Avatar src={rev.avatar_url} name={rev.username} size="sm" />
                  <span className="text-sm">{rev.username}</span>
                </MakerLink>
                <span className="text-xs text-[var(--gold)]">{rev.rating}★</span>
              </div>
              {rev.body && <p className="text-sm text-[var(--muted)] whitespace-pre-wrap">{rev.body}</p>}
            </div>
          ))}
          {reviews.length === 0 && <p className="text-sm text-[var(--muted)]">No reviews yet.</p>}
        </div>
      </div>

      <h3 className="font-display text-2xl mb-4">Comments</h3>
      <div className="space-y-3 mb-4">
        {threads.map((thread) => (
          <div key={thread.id} className="ob-panel p-4">
            <MakerLink username={thread.handle} className="inline-flex items-center gap-2 mb-2">
              <Avatar src={thread.avatar_url} name={thread.username} size="sm" />
              <span className="text-sm">{thread.username}</span>
            </MakerLink>
            <p className="text-sm text-[var(--muted)] whitespace-pre-wrap">{thread.body}</p>
          </div>
        ))}
        {threads.length === 0 && <p className="text-sm text-[var(--muted)]">No comments yet.</p>}
      </div>

      {isLoggedIn() ? (
        <form onSubmit={handleComment} className="flex gap-2">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Comment"
            className="ob-input flex-1"
          />
          <button type="submit" className="btn-ember px-4 py-2">
            <Send size={16} />
          </button>
        </form>
      ) : (
        <Link to="/auth" className="text-sm text-[var(--muted)] hover:text-[var(--cream)]">Sign in to comment</Link>
      )}

      {isLoggedIn() && (
        <button
          onClick={handleJoin}
          disabled={joining}
          className="mt-8 text-xs text-[var(--muted)] hover:text-[var(--cream)] inline-flex items-center gap-1"
        >
          <GitFork size={12} /> {joining ? 'Starting…' : 'Open workspace'}
        </button>
      )}
    </div>
  );
}
