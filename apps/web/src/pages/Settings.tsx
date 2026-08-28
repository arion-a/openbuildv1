import { useEffect, useState, useRef } from 'react';
import { Key, FileText, Save, CheckCircle, User, Camera, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from '../components/Avatar';

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

export function Settings() {
  const { user, setUser } = useAuth();
  const [customInstructions, setCustomInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Profile state
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [giteaUrl, setGiteaUrl] = useState('');
  const [giteaPassword, setGiteaPassword] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [lovableUrl, setLovableUrl] = useState('');
  const [replitUrl, setReplitUrl] = useState('');
  const [boltUrl, setBoltUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      api.getSettings().catch(() => null),
      api.me().catch(() => null),
    ]).then(([settings, profile]) => {
      if (settings) {
        setCustomInstructions(settings.custom_instructions || '');
      }
      if (profile) {
        setAvatarUrl(profile.avatar_url || '');
        setBio(profile.bio || '');
        setDisplayName(profile.display_name || '');
        setUsername(profile.username || '');
        setGiteaUrl(profile.gitea_url || '');
        setGiteaPassword(profile.gitea_password || '');
        setGithubUrl(profile.github_url || '');
        setLovableUrl(profile.lovable_url || '');
        setReplitUrl(profile.replit_url || '');
        setBoltUrl(profile.bolt_url || '');
      }
    }).finally(() => setLoading(false));
  }, []);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5MB');
      return;
    }

    setUploadingAvatar(true);
    try {
      const url = await uploadToImgbb(file);
      setAvatarUrl(url);
      await api.updateProfile({ avatar_url: url });
      setUser({ ...user!, avatar_url: url });
    } catch (err: any) {
      alert('Failed to upload: ' + err.message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleProfileSave = async () => {
    setProfileSaving(true);
    setProfileSaved(false);
    try {
      const updated = await api.updateProfile({
        bio,
        display_name: displayName || undefined,
        username: username !== user?.username ? username : undefined,
        github_url: githubUrl || undefined,
        lovable_url: lovableUrl || undefined,
        replit_url: replitUrl || undefined,
        bolt_url: boltUrl || undefined,
      });
      setUser({ ...user!, bio, username: updated.username, display_name: updated.display_name });
      setUsername(updated.username);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await api.updateSettings({
        custom_instructions: customInstructions || undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };


  if (loading) return <div className="p-6 text-[var(--muted)]">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto px-5 md:px-10 py-10 md:py-14">
      <div className="mb-8">
        <p className="label-kicker mb-3">You</p>
        <h1 className="font-display text-4xl">Settings</h1>
        <p className="text-sm text-[var(--muted)] mt-1">Links and session prefs.</p>
      </div>

      {/* Profile Section */}
      <div className="ob-panel p-6 mb-6">
        <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
          <User size={14} className="text-[var(--ember)]" /> Profile
        </h3>

        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="relative group">
            <Avatar src={avatarUrl} name={[displayName, username, user?.email]} size="xl" />
            <button
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>

          {/* Profile fields */}
          <div className="flex-1 space-y-3">
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Display Name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How people should know you"
                className="ob-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="yourhandle"
                className="ob-input text-sm"
              />
              <p className="text-xs text-[var(--muted)] mt-0.5">Letters, numbers, _ and -.</p>
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Email</label>
              <input
                value={user?.email || ''}
                disabled
                className="ob-input text-sm cursor-not-allowed opacity-60"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell others a bit about yourself..."
                className="ob-input h-20 resize-none text-sm"
              />
            </div>
            <button
              onClick={handleProfileSave}
              disabled={profileSaving}
              className="btn-ember px-4 py-2 text-xs disabled:opacity-50"
            >
              {profileSaved ? 'Saved!' : profileSaving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>
      </div>

      <div className="ob-panel p-6 mb-6">
        <h3 className="text-sm font-medium mb-2">Where you build</h3>
        <p className="text-xs text-[var(--muted)] mb-4">
          Optional links on your page.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[var(--muted)] mb-1 block">GitHub</label>
            <input
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="https://github.com/yourname"
              className="ob-input text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] mb-1 block">Lovable</label>
            <input
              value={lovableUrl}
              onChange={(e) => setLovableUrl(e.target.value)}
              placeholder="https://lovable.dev/..."
              className="ob-input text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] mb-1 block">Replit</label>
            <input
              value={replitUrl}
              onChange={(e) => setReplitUrl(e.target.value)}
              placeholder="https://replit.com/@yourname"
              className="ob-input text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] mb-1 block">Bolt</label>
            <input
              value={boltUrl}
              onChange={(e) => setBoltUrl(e.target.value)}
              placeholder="https://bolt.new/..."
              className="ob-input text-sm"
            />
          </div>
        </div>
        <button
          onClick={handleProfileSave}
          disabled={profileSaving}
          className="btn-ember mt-4 px-4 py-2 text-xs disabled:opacity-50"
        >
          {profileSaved ? 'Saved!' : profileSaving ? 'Saving...' : 'Save work links'}
        </button>
      </div>

      {/* Git Credentials */}
      {giteaUrl && (
        <div className="ob-panel p-6 mb-6">
          <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
            <Key size={14} className="text-[var(--ember)]" /> Git Credentials
          </h3>
          <p className="text-xs text-[var(--muted)] mb-3">For your repos, if you use them.</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Git URL</label>
              <input value={giteaUrl} readOnly className="ob-input text-sm font-mono cursor-text" onClick={(e) => (e.target as HTMLInputElement).select()} />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Username</label>
              <input value={username} readOnly className="ob-input text-sm font-mono cursor-text" onClick={(e) => (e.target as HTMLInputElement).select()} />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Password</label>
              <div className="flex gap-2">
                <input value={giteaPassword} type="password" readOnly className="ob-input flex-1 text-sm font-mono" />
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(giteaPassword); }}
                  className="btn-ghost px-3 py-2 text-xs"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OpenCode Settings */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* Custom Instructions */}
        <div className="ob-panel p-6">
          <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
            <FileText size={14} className="text-[var(--ember)]" /> Custom Instructions
          </h3>

          <textarea
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            placeholder="Anything you want sessions to keep in mind…"
            className="ob-input h-32 resize-none"
          />
        </div>

        {/* Save */}
        <button
          type="submit"
          disabled={saving}
          className="btn-ember w-full flex items-center justify-center gap-2 px-4 py-3 disabled:opacity-50"
        >
          {saved ? (
            <><CheckCircle size={16} /> Saved!</>
          ) : (
            <><Save size={16} /> {saving ? 'Saving...' : 'Save OpenCode Settings'}</>
          )}
        </button>
      </form>
    </div>
  );
}
