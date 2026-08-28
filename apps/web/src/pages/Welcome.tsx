import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Check, Loader2 } from 'lucide-react';
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

export function Welcome() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatar, setAvatar] = useState(user?.avatar_url || '');
  const [uploading, setUploading] = useState(false);
  const [makers, setMakers] = useState<MakerCard[]>([]);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api
      .getMakers('starred')
      .then((rows: MakerCard[]) => setMakers(rows.filter((m) => m.username !== user?.username).slice(0, 5)))
      .catch(() => setMakers([]));
  }, []);

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

  const follow = async (username: string) => {
    setFollowed((f) => ({ ...f, [username]: true }));
    await api.toggleFollow(username).catch(() => setFollowed((f) => ({ ...f, [username]: false })));
  };

  return (
    <div className="max-w-lg mx-auto px-5 py-12 md:py-16">
      <p className="label-kicker mb-2">Welcome</p>
      <h1 className="font-display text-4xl mb-2">You’re in.</h1>
      <p className="text-[var(--muted)] text-sm mb-8">Three quick things and you’re set up.</p>

      <div className="space-y-4">
        <section className="ob-panel p-5">
          <p className="text-sm font-semibold mb-3">1 · Add a photo</p>
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
                  {uploading ? <Loader2 size={18} className="text-white animate-spin" /> : <Camera size={18} className="text-white" />}
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
          <p className="text-sm font-semibold mb-3">2 · Put something up</p>
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
          <p className="text-sm font-semibold mb-3">3 · Follow a few builders</p>
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
                    {followed[m.username] ? <><Check size={12} /> Following</> : 'Follow'}
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
