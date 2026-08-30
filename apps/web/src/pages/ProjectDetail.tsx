import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ExternalLink, Pencil, Save, X, Star, Send, GitFork, ImagePlus, Loader2, Mail, Download } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from '../components/Avatar';
import { MakerLink } from '../components/MakerLink';
import { Gallery } from '../components/Gallery';
import { RichText } from '../components/RichText';
import { ShareMenu } from '../components/ShareMenu';
import { imageUploadEnabled, uploadImages } from '../lib/uploadImage';

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
    description: '',
    domain: '',
    live_url: '',
    tools_used: '',
    how_to_replicate: '',
    applications: '',
  });
  const [editMedia, setEditMedia] = useState<string[]>([]);
  const [mediaBusy, setMediaBusy] = useState(false);
  const editMediaInput = useRef<HTMLInputElement>(null);
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
      description: project.description || '',
      domain: project.domain || '',
      live_url: project.live_url || '',
      tools_used: (project.tools_used || []).join(', '),
      how_to_replicate: project.how_to_replicate || '',
      applications: (project.potential_applications || []).join(', '),
    });
    setEditMedia(Array.isArray(project.media) ? project.media : []);
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
      const updated = await api.updateProject(id, {
        title: editForm.title,
        tagline: editForm.tagline,
        description: editForm.description,
        domain: editForm.domain,
        live_url: editForm.live_url,
        tools_used: editForm.tools_used.split(',').map((t) => t.trim()).filter(Boolean),
        how_to_replicate: editForm.how_to_replicate,
        potential_applications: editForm.applications.split(',').map((t) => t.trim()).filter(Boolean),
        media: editMedia,
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
              className="ob-input title-plain text-2xl"
            />
          ) : (
            <h1 className="title-plain text-3xl md:text-4xl">{project.title}</h1>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-sm text-[var(--muted)]">
            <MakerLink username={project.owner_username} className="inline-flex items-center gap-2 hover:text-[var(--cream)]">
              <Avatar src={project.owner_avatar_url} name={[project.owner_name, project.owner_username]} size="xs" />
              {project.owner_name}
            </MakerLink>
            {project.domain && <span className="ob-chip">{project.domain}</span>}
            {project.created_at && (
              <span className="text-xs">
                {new Date(project.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>
        {editing ? (
          <div className="flex gap-2 shrink-0">
            <button onClick={handleSave} disabled={saving} className="btn-ember inline-flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-50">
              <Save size={14} /> {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} className="btn-ghost inline-flex items-center gap-1.5 px-4 py-2 text-sm">
              <X size={14} /> Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <ShareMenu
              url={`${window.location.origin}/buildlive/${project.id}`}
              title={project.title}
              summary={project.tagline || undefined}
            />
            {isOwner && (
              <button onClick={startEdit} className="btn-ghost inline-flex items-center gap-1.5 px-4 py-2 text-sm">
                <Pencil size={14} /> Edit
              </button>
            )}
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
        <div className="space-y-3 mb-8">
          <label className="block space-y-1">
            <span className="text-xs text-[var(--muted)]">The story</span>
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              placeholder="What it does, why you made it, how it went."
              className="ob-input h-40 resize-none"
            />
          </label>
          <input
            value={editForm.domain}
            onChange={(e) => setEditForm({ ...editForm, domain: e.target.value })}
            placeholder="Domain — productivity, devtools, …"
            className="ob-input"
          />
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
          <label className="block space-y-1">
            <span className="text-xs text-[var(--muted)]">How to replicate</span>
            <textarea
              value={editForm.how_to_replicate}
              onChange={(e) => setEditForm({ ...editForm, how_to_replicate: e.target.value })}
              placeholder="The prompts or steps that got you here."
              className="ob-input h-24 resize-none"
            />
          </label>
          <input
            value={editForm.applications}
            onChange={(e) => setEditForm({ ...editForm, applications: e.target.value })}
            placeholder="Also useful for — comma separated"
            className="ob-input"
          />
          {imageUploadEnabled() && (
            <div className="space-y-2">
              <span className="text-xs text-[var(--muted)]">Screenshots — first is the cover</span>
              <div className="flex flex-wrap items-center gap-2">
                {editMedia.map((url, i) => (
                  <div key={url} className="relative">
                    <img src={url} alt={`screenshot ${i + 1}`} className="h-16 w-16 rounded-lg object-cover border border-[var(--line)]" />
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
                    aria-label="Add screenshots"
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
          {(project.media || []).length > 0 && (
            <div className="mb-8">
              <Gallery images={project.media} title={project.title} />
            </div>
          )}

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
            {!isOwner && project.owner_username && isLoggedIn() && (
              <button
                onClick={() => navigate(`/messages?to=${project.owner_username}`)}
                className="btn-ghost inline-flex items-center gap-2 px-4 py-2 text-sm"
              >
                <Mail size={14} /> Message
              </button>
            )}
            {project.git_url && (
              <a
                href={`${String(project.git_url).replace(/\/$/, '')}/archive/main.zip`}
                className="btn-ghost inline-flex items-center gap-2 px-4 py-2 text-sm"
                title="Download the working product as a zip"
              >
                <Download size={14} /> Download
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

          {project.description && (
            <RichText text={project.description} className="text-[var(--cream)]/90 leading-relaxed mb-10 text-[15px]" />
          )}

          {project.how_to_replicate && (
            <div className="mb-10">
              <h3 className="font-display text-2xl mb-2">How it was made</h3>
              <RichText text={project.how_to_replicate} className="text-[var(--muted)] leading-relaxed text-[15px]" />
            </div>
          )}

          {(project.potential_applications || []).length > 0 && (
            <div className="mb-10">
              <p className="label-kicker mb-2">Also good for</p>
              <div className="flex flex-wrap gap-2">
                {project.potential_applications.map((a: string) => (
                  <span key={a} className="ob-chip">{a}</span>
                ))}
              </div>
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

      <div className="mt-8 flex items-center gap-4">
        {isLoggedIn() && (
          <button
            onClick={handleJoin}
            disabled={joining}
            className="text-xs text-[var(--muted)] hover:text-[var(--cream)] inline-flex items-center gap-1"
          >
            <GitFork size={12} /> {joining ? 'Starting…' : 'Open workspace'}
          </button>
        )}
        {isLoggedIn() && !isOwner && (
          <button
            onClick={async () => {
              const detail = window.prompt('Report this build — what’s wrong? (optional)');
              if (detail === null) return;
              try {
                await api.report({ kind: 'build', ref_id: id, detail: detail || undefined });
                alert('Thanks — the team will take a look.');
              } catch (err: any) {
                alert(err.message || 'Could not send that.');
              }
            }}
            className="text-xs text-[var(--muted)] hover:text-[var(--cream)]"
          >
            Report
          </button>
        )}
      </div>
    </div>
  );
}
