import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Loader2 } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY;

async function uploadToImgbb(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Image upload failed');
  const data = await res.json();
  return data.data.display_url;
}

export function Account() {
  const { user, setUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .me()
      .then((profile) => {
        setAvatarUrl(profile.avatar_url || '');
        setBio(profile.bio || '');
        setDisplayName(profile.display_name || '');
        setUsername(profile.username || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Keep photos under 5MB.');
      return;
    }
    setUploadingAvatar(true);
    try {
      const url = await uploadToImgbb(file);
      setAvatarUrl(url);
      await api.updateProfile({ avatar_url: url });
      setUser({ ...user!, avatar_url: url });
    } catch (err: any) {
      alert(err.message || 'Couldn’t update photo.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await api.updateProfile({
        bio,
        display_name: displayName || undefined,
        username: username !== user?.username ? username : undefined,
      });
      setUser({ ...user!, bio, username: updated.username, display_name: updated.display_name });
      setUsername(updated.username);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-[var(--muted)]">Loading…</div>;

  return (
    <div className="max-w-2xl mx-auto px-5 md:px-10 py-10 md:py-14">
      <div className="mb-8">
        <p className="label-kicker mb-3">You</p>
        <h1 className="font-display text-4xl">Account</h1>
        <p className="text-sm text-[var(--muted)] mt-1">How you show up here.</p>
      </div>

      <div className="ob-panel p-6">
        <div className="flex items-start gap-6">
          <div className="relative group">
            <Avatar src={avatarUrl} name={[displayName, username, user?.email]} size="xl" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
            >
              {uploadingAvatar ? (
                <Loader2 size={20} className="text-white animate-spin" />
              ) : (
                <Camera size={20} className="text-white" />
              )}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How people should know you"
                className="ob-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Handle</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="yourhandle"
                className="ob-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Email</label>
              <input value={user?.email || ''} disabled className="ob-input text-sm cursor-not-allowed opacity-60" />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">About</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="A line or two about you"
                className="ob-input h-20 resize-none text-sm"
              />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button onClick={handleSave} disabled={saving} className="btn-ember px-4 py-2 text-xs disabled:opacity-50">
                {saved ? 'Saved' : saving ? 'Saving…' : 'Save'}
              </button>
              {username && (
                <Link to={`/u/${username}`} className="text-sm text-[var(--muted)] hover:text-[var(--cream)]">
                  View page
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
