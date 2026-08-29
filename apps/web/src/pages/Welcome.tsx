import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Check, Loader2, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from '../components/Avatar';
import { imageUploadEnabled, uploadImage } from '../lib/uploadImage';

interface MakerCard {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30);

export function Welcome() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  // --- handle ---
  const [handle, setHandle] = useState(user?.username || '');
  const [handleState, setHandleState] = useState<
    'idle' | 'checking' | 'ok' | 'bad' | 'saving' | 'saved'
  >('idle');
  const [handleHint, setHandleHint] = useState('');
  const checkSeq = useRef(0);

  useEffect(() => {
    const h = handle.trim();
    if (!h || h === user?.username) {
      setHandleState('idle');
      setHandleHint('');
      return;
    }
    if (h.length < 2) {
      setHandleState('bad');
      setHandleHint('A little longer.');
      return;
    }
    const seq = ++checkSeq.current;
    setHandleState('checking');
    setHandleHint('');
    const t = setTimeout(async () => {
      try {
        const r = await api.checkUsername(h);
        if (seq !== checkSeq.current) return;
        if (r.available) {
          setHandleState('ok');
          setHandleHint(`openbuild.world/u/${r.normalized} is yours`);
        } else {
          setHandleState('bad');
          setHandleHint(r.reason || 'Taken.');
        }
      } catch {
        if (seq === checkSeq.current) setHandleState('idle');
      }
    }, 350);
    return () => clearTimeout(t);
  }, [handle, user?.username]);

  const saveHandle = async () => {
    setHandleState('saving');
    try {
      const updated = await api.updateProfile({ username: handle.trim() });
      if (user) setUser({ ...user, username: updated.username });
      setHandle(updated.username);
      setHandleState('saved');
      setHandleHint(`You’re @${updated.username}`);
    } catch (err: any) {
      setHandleState('bad');
      setHandleHint(err.message || 'Could not save that.');
    }
  };

  // --- avatar ---
  const [avatar, setAvatar] = useState(user?.avatar_url || '');
  const [uploading, setUploading] = useState(false);

  const onAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadImage(file);
      setAvatar(url);
      await api.updateProfile({ avatar_url: url });
      if (user) setUser({ ...user, avatar_url: url });
    } catch (err: any) {
      alert(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  // --- follow ---
  const [makers, setMakers] = useState<MakerCard[]>([]);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api
      .getMakers('starred')
      .then((rows: MakerCard[]) => setMakers(rows.filter((m) => m.username !== user?.username).slice(0, 5)))
      .catch(() => setMakers([]));
  }, []);

  const follow = async (username: string) => {
    setFollowed((f) => ({ ...f, [username]: true }));
    await api.toggleFollow(username).catch(() => setFollowed((f) => ({ ...f, [username]: false })));
  };

  return (
    <div className="max-w-lg mx-auto px-5 py-12 md:py-16">
      <p className="label-kicker mb-2">Welcome</p>
      <h1 className="font-display text-4xl mb-2">You’re in.</h1>
      <p className="text-[var(--muted)] text-sm mb-8">A few quick things and you’re set up.</p>

      <div className="space-y-4">
        <section className="ob-panel p-5">
          <p className="text-sm font-semibold mb-1">1 · Pick your handle</p>
          <p className="text-xs text-[var(--muted)] mb-3">
            It’s your profile link and how people find you. Any name you like — change it any time.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] text-sm">@</span>
              <input
                value={handle}
                onChange={(e) => {
                  setHandle(normalize(e.target.value));
                  setHandleState('idle');
                }}
                placeholder="yourname"
                className="ob-input text-sm"
                style={{ paddingLeft: '1.75rem' }}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <button
              onClick={saveHandle}
              disabled={handleState !== 'ok'}
              className="btn-ember px-4 py-2 text-sm disabled:opacity-40"
            >
              {handleState === 'saving' ? '…' : handleState === 'saved' ? 'Saved' : 'Save'}
            </button>
          </div>
          <p className="text-xs mt-2 h-4 flex items-center gap-1">
            {handleState === 'checking' && <span className="text-[var(--muted)]">checking…</span>}
            {handleState === 'ok' && (
              <span className="text-[var(--gold)] flex items-center gap-1">
                <Check size={12} /> {handleHint}
              </span>
            )}
            {(handleState === 'bad') && (
              <span className="text-red-400 flex items-center gap-1">
                <X size={12} /> {handleHint}
              </span>
            )}
            {handleState === 'saved' && (
              <span className="text-[var(--gold)] flex items-center gap-1">
                <Check size={12} /> {handleHint}
              </span>
            )}
          </p>
        </section>

        <section className="ob-panel p-5">
          <p className="text-sm font-semibold mb-3">2 · Add a photo</p>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar src={avatar} name={[user?.display_name, user?.username, user?.email]} size="lg" />
              {imageUploadEnabled() && (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="absolute inset-0 rounded-full bg-black/50 opacity-0 hover:opacity-100 transition flex items-center justify-center"
                  aria-label="Upload photo"
                >
                  {uploading ? (
                    <Loader2 size={18} className="text-white animate-spin" />
                  ) : (
                    <Camera size={18} className="text-white" />
                  )}
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onAvatar} />
            </div>
            <p className="text-xs text-[var(--muted)]">
              {imageUploadEnabled() ? 'Optional, but people trust a face.' : 'Set one later in Settings.'}
            </p>
          </div>
        </section>

        <section className="ob-panel p-5">
          <p className="text-sm font-semibold mb-3">3 · Put something up</p>
          <div className="flex gap-2">
            <button onClick={() => navigate('/publish?kind=build')} className="btn-ember px-4 py-2 text-sm">
              Post a build
            </button>
            <button onClick={() => navigate('/publish?kind=idea')} className="btn-ghost px-4 py-2 text-sm">
              Post an idea
            </button>
          </div>
        </section>

        <section className="ob-panel p-5">
          <p className="text-sm font-semibold mb-3">4 · Follow a few builders</p>
          {makers.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">No one to suggest yet.</p>
          ) : (
            <div className="space-y-2">
              {makers.map((m) => (
                <div key={m.username} className="flex items-center gap-3">
                  <Avatar src={m.avatar_url} name={[m.display_name, m.username]} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{m.display_name || m.username}</p>
                    {m.bio && <p className="text-xs text-[var(--muted)] truncate">{m.bio}</p>}
                  </div>
                  <button
                    onClick={() => follow(m.username)}
                    disabled={followed[m.username]}
                    className={`${followed[m.username] ? 'btn-ghost' : 'btn-ember'} px-3 py-1.5 text-xs inline-flex items-center gap-1`}
                  >
                    {followed[m.username] ? (
                      <>
                        <Check size={12} /> Following
                      </>
                    ) : (
                      'Follow'
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <button onClick={() => navigate('/discover')} className="btn-ember w-full mt-8 py-3 text-sm">
        Start looking around
      </button>
    </div>
  );
}
