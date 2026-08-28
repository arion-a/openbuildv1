import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle, Loader2, Upload } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

type Kind = 'build' | 'idea';

interface Publication {
  id: string;
  kind: Kind;
  status: 'draft' | 'published';
  title: string;
  body: string | null;
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
  const [liveUrl, setLiveUrl] = useState('');
  const [howTo, setHowTo] = useState('');
  const [tools, setTools] = useState('');
  const [sourceIdeaId, setSourceIdeaId] = useState(sourceIdea || '');
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
    live_url: liveUrl.trim() || null,
    how_to_replicate: howTo.trim() || null,
    tools_used: tools.split(',').map((t) => t.trim()).filter(Boolean),
    source_idea_id: sourceIdeaId || null,
  });

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
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === 'build' ? 'What you built' : 'What’s the idea?'}
            maxLength={300}
            className="ob-input"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={kind === 'build' ? 'What it does, who it’s for' : 'Who is this for, and how would it work?'}
            className="ob-input h-28 resize-none"
          />
          {kind === 'build' && (
            <>
              <input
                value={liveUrl}
                onChange={(e) => setLiveUrl(e.target.value)}
                placeholder="https://"
                className="ob-input"
              />
              <input
                value={tools}
                onChange={(e) => setTools(e.target.value)}
                placeholder="Cursor, Lovable, …"
                className="ob-input"
              />
            </>
          )}
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
