import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle, ImagePlus, Loader2, Upload, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { imageUploadEnabled, uploadImages } from '../lib/uploadImage';

type Kind = 'build' | 'idea';

interface Publication {
  id: string;
  kind: Kind;
  status: 'draft' | 'published';
  title: string;
  body: string | null;
  description: string | null;
  media: string[] | null;
  domain: string | null;
  live_url: string | null;
  how_to_replicate: string | null;
  tools_used: string[] | null;
  source_idea_id: string | null;
  project_id: string | null;
  idea_id: string | null;
  updated_at: string;
}

export function Publish() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const kindParam = searchParams.get('kind') === 'idea' ? 'idea' : searchParams.get('kind') === 'build' ? 'build' : null;
  const sourceIdea = searchParams.get('idea');

  const [kind, setKind] = useState<Kind | null>(kindParam);
  const [mine, setMine] = useState<Publication[]>([]);
  const [pubId, setPubId] = useState<string | null>(id || null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [description, setDescription] = useState('');
  const [media, setMedia] = useState<string[]>([]);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [domain, setDomain] = useState('');
  const [liveUrl, setLiveUrl] = useState('');
  const [howTo, setHowTo] = useState('');
  const [tools, setTools] = useState('');
  const [applications, setApplications] = useState('');
  const [sourceIdeaId, setSourceIdeaId] = useState(sourceIdea || '');
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [ideaId, setIdeaId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!!id);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoggedIn()) {
      const next = `/publish${id ? `/${id}` : ''}${window.location.search}`;
      navigate(`/auth?next=${encodeURIComponent(next)}`);
    }
  }, [isLoggedIn, id, navigate]);

  useEffect(() => {
    api.listPublications().then(setMine).catch(() => setMine([]));
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.getPublication(id)
      .then((p: Publication) => {
        setPubId(p.id);
        setKind(p.kind);
        setTitle(p.title || '');
        setBody(p.body || '');
        setDescription(p.description || '');
        setMedia(Array.isArray(p.media) ? p.media : []);
        setDomain(p.domain || '');
        setLiveUrl(p.live_url || '');
        setHowTo(p.how_to_replicate || '');
        setTools((p.tools_used || []).join(', '));
        setSourceIdeaId(p.source_idea_id || '');
        setStatus(p.status);
        setProjectId(p.project_id);
        setIdeaId(p.idea_id);
      })
      .catch(() => setError('Draft not found'))
      .finally(() => setLoading(false));
  }, [id]);

  const payload = () => ({
    kind: kind as Kind,
    title: title.trim(),
    body: body.trim(),
    description: kind === 'build' ? description.trim() || null : null,
    media,
    domain: domain.trim() || null,
    live_url: liveUrl.trim() || null,
    how_to_replicate: kind === 'build' ? howTo.trim() || null : null,
    tools_used: tools.split(',').map((t) => t.trim()).filter(Boolean),
    potential_applications:
      kind === 'build' ? applications.split(',').map((t) => t.trim()).filter(Boolean) : [],
    source_idea_id: sourceIdeaId || null,
  });

  const addScreenshots = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setMediaBusy(true);
    setError('');
    try {
      const uploaded = await uploadImages(files.slice(0, 12 - media.length));
      setMedia((prev) => [...prev, ...uploaded.map((u) => u.url)].slice(0, 12));
    } catch (err: any) {
      setError(err.message || 'Could not add those images.');
    } finally {
      setMediaBusy(false);
    }
  };

  const saveDraft = async () => {
    if (!kind) return;
    setSaving(true);
    setError('');
    try {
      const saved = pubId
        ? await api.updatePublication(pubId, payload())
        : await api.createPublication(payload());
      setPubId(saved.id);
      setStatus(saved.status);
      if (!id) navigate(`/publish/${saved.id}`, { replace: true });
      const list = await api.listPublications();
      setMine(list);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const publishNow = async () => {
    if (!kind) return;
    setSaving(true);
    setError('');
    try {
      let result: any;
      if (!pubId) {
        result = await api.createPublication({ ...payload(), publish: true });
      } else {
        if (status === 'draft') await api.updatePublication(pubId, payload());
        result = await api.publishPublication(pubId);
      }
      const p = result.publication || result;
      setPubId(p.id);
      setStatus(p.status);
      setProjectId(p.project_id);
      setIdeaId(p.idea_id);
      navigate(`/publish/${p.id}`, { replace: true });
      setMine(await api.listPublications());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeDraft = async (draftId: string) => {
    await api.deletePublication(draftId);
    setMine(await api.listPublications());
    if (pubId === draftId) navigate('/publish', { replace: true });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const result = await api.uploadProjectZip(projectId, file);
      setUploadResult(`Uploaded ${result.uploaded} files`);
    } catch (err: any) {
      setUploadResult(err.message);
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <p className="max-w-3xl mx-auto p-6 text-[var(--muted)]">Loading…</p>;

  const published = status === 'published';
  const liveHref = projectId ? `/buildlive/${projectId}` : ideaId ? `/ideastream/${ideaId}` : null;

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-10 py-10 md:py-14 space-y-8">
      <div>
        <h1 className="font-display text-4xl">Publish</h1>
      </div>
      {!kind && (
        <div className="grid sm:grid-cols-2 gap-4">
          <button
            onClick={() => setKind('build')}
            className="ob-card text-left p-6"
          >
            <p className="font-display text-2xl">I built something</p>
            <p className="text-sm text-[var(--muted)] mt-2">A live app. Shows on Builds.</p>
          </button>
          <button
            onClick={() => setKind('idea')}
            className="ob-card text-left p-6"
          >
            <p className="font-display text-2xl">I have an idea</p>
            <p className="text-sm text-[var(--muted)] mt-2">A thought to share. Shows on Ideas.</p>
          </button>
        </div>
      )}

      {kind && !published && (
        <form
          onSubmit={(e) => { e.preventDefault(); publishNow(); }}
          className="ob-panel p-6 space-y-4"
        >
          <p className="text-sm text-[var(--muted)]">{kind === 'build' ? 'Publish a build' : 'Publish an idea'}</p>

          <label className="block space-y-1">
            <span className="text-xs text-[var(--muted)]">{kind === 'build' ? 'What you built' : 'The idea, in a line'}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === 'build' ? 'e.g. Mealplan' : 'e.g. A CRM that’s just a really good text file'}
              maxLength={300}
              className="ob-input"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-[var(--muted)]">
              {kind === 'build' ? 'One line — what it does and who it’s for' : 'Who is this for, and how would it work?'}
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={kind === 'build' ? 'Weekly meals from what’s in your fridge — snap a photo, get a plan.' : 'Plain text. What problem it solves, roughly how.'}
              className={kind === 'build' ? 'ob-input h-16 resize-none' : 'ob-input h-28 resize-none'}
            />
          </label>

          {kind === 'build' && (
            <label className="block space-y-1">
              <span className="text-xs text-[var(--muted)]">The story — what it does, why you made it, how it went. Light Markdown is fine.</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="I kept rebuilding the same meal spreadsheet, so…"
                className="ob-input h-40 resize-none"
              />
            </label>
          )}

          {imageUploadEnabled() && (
            <div className="space-y-2">
              <span className="text-xs text-[var(--muted)]">
                {kind === 'build' ? 'Screenshots' : 'Sketches or references (optional)'} — first one is the cover
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {media.map((url, i) => (
                  <div key={url} className="relative">
                    <img
                      src={url}
                      alt={`screenshot ${i + 1}`}
                      className="h-16 w-16 rounded-lg object-cover border border-[var(--line)]"
                    />
                    <button
                      type="button"
                      onClick={() => setMedia(media.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 bg-[var(--bg)] border border-[var(--line)] rounded-full p-0.5 text-[var(--muted)] hover:text-[var(--cream)]"
                      aria-label="Remove image"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
                {media.length < 12 && (
                  <button
                    type="button"
                    onClick={() => mediaInputRef.current?.click()}
                    disabled={mediaBusy}
                    className="h-16 w-16 rounded-lg border border-dashed border-[var(--line)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--cream)] hover:border-[var(--ember)]/50 disabled:opacity-50"
                    aria-label="Add screenshots"
                  >
                    {mediaBusy ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                  </button>
                )}
              </div>
              <input
                ref={mediaInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={addScreenshots}
              />
            </div>
          )}

          {kind === 'build' && (
            <>
              <label className="block space-y-1">
                <span className="text-xs text-[var(--muted)]">Where people can try it</span>
                <input
                  value={liveUrl}
                  onChange={(e) => setLiveUrl(e.target.value)}
                  placeholder="https://"
                  className="ob-input"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-[var(--muted)]">Built with</span>
                <input
                  value={tools}
                  onChange={(e) => setTools(e.target.value)}
                  placeholder="Cursor, Lovable, Supabase, …"
                  className="ob-input"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-[var(--muted)]">How to replicate (optional) — the prompts or steps that got you here</span>
                <textarea
                  value={howTo}
                  onChange={(e) => setHowTo(e.target.value)}
                  placeholder="Started from a Lovable template, then…"
                  className="ob-input h-24 resize-none"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-[var(--muted)]">Also useful for (optional) — comma separated</span>
                <input
                  value={applications}
                  onChange={(e) => setApplications(e.target.value)}
                  placeholder="meal prep, grocery budgeting"
                  className="ob-input"
                />
              </label>
            </>
          )}

          <label className="block space-y-1">
            <span className="text-xs text-[var(--muted)]">Domain{kind === 'idea' ? ' (optional)' : ''}</span>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="productivity, devtools, finance, …"
              maxLength={100}
              className="ob-input"
            />
          </label>

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => { if (!id) setKind(null); }} className="px-4 py-2 text-[var(--muted)] hover:text-[var(--cream)] text-sm">
              Back
            </button>
            <button type="button" onClick={saveDraft} disabled={saving} className="btn-ghost px-4 py-2 text-sm disabled:opacity-50">
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim() || (kind === 'idea' && !body.trim())}
              className="btn-ember px-5 py-2 text-sm disabled:opacity-50"
            >
              {saving ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </form>
      )}

      {published && (
        <div className="ob-panel p-6 space-y-4">
          <p className="flex items-center gap-2 text-[var(--gold)] text-sm">
            <CheckCircle size={16} /> Published: {title}
          </p>
          {liveHref && (
            <Link to={liveHref} className="text-sm text-[var(--muted)] hover:text-[var(--cream)]">
              Open it →
            </Link>
          )}
          {projectId && (
            <div className="space-y-2">
              <p className="text-sm text-[var(--muted)]">Got a zip of the code? You can add it here.</p>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="btn-ghost inline-flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploading ? 'Uploading…' : 'Add zip'}
              </button>
              {uploadResult && <span className="text-xs text-green-400 ml-2">{uploadResult}</span>}
              <input ref={fileRef} type="file" accept=".zip" className="hidden" onChange={handleUpload} />
            </div>
          )}
        </div>
      )}

      <section>
        <h3 className="text-sm font-semibold mb-3">Yours</h3>
        {mine.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nothing posted yet.</p>
        ) : (
          <ul className="space-y-2">
            {mine.map((p) => (
              <li key={p.id} className="ob-panel flex items-center justify-between gap-3 px-4 py-3">
                <Link to={`/publish/${p.id}`} className="min-w-0">
                  <p className="text-sm truncate">{p.title || 'Untitled draft'}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {p.kind} · {p.status}
                  </p>
                </Link>
                {p.status === 'draft' && (
                  <button onClick={() => removeDraft(p.id)} className="text-xs text-red-400 hover:text-red-300">
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
