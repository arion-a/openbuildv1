import { useEffect, useState, useRef } from 'react';
import { Settings as SettingsIcon, Key, FileText, Save, CheckCircle, User, Camera, Loader2 } from 'lucide-react';
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


  if (loading) return <div className="p-6 text-slate-400">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <SettingsIcon size={22} className="text-cyan-400" />
          Settings
        </h1>
        <p className="text-sm text-slate-400 mt-1">Manage your profile and OpenCode configuration</p>
      </div>

      {/* Profile Section */}
      <div className="bg-slate-900/60 backdrop-blur-sm border border-blue-900/30 rounded-lg p-6 mb-6">
        <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
          <User size={14} className="text-cyan-400" /> Profile
        </h3>

        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="relative group">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-2xl font-bold">
                  {username?.[0]?.toUpperCase() || 'U'}
                </span>
              )}
            </div>
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
              <label className="text-xs text-gray-400 mb-1 block">Display Name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your display name (can have spaces)"
                className="w-full px-3 py-2 bg-slate-950/60 border border-blue-900/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="lowercase, no spaces (used for git)"
                className="w-full px-3 py-2 bg-slate-950/60 border border-blue-900/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm font-mono"
              />
              <p className="text-xs text-gray-600 mt-0.5">Letters, numbers, _ and - only. Used for git operations.</p>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Email</label>
              <input
                value={user?.email || ''}
                disabled
                className="w-full px-3 py-2 bg-slate-950/40 border border-blue-900/20 rounded-lg text-gray-500 text-sm cursor-not-allowed"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell others a bit about yourself..."
                className="w-full px-3 py-2 bg-slate-950/60 border border-blue-900/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 h-20 resize-none text-sm"
              />
            </div>
            <button
              onClick={handleProfileSave}
              disabled={profileSaving}
              className="px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50 shadow-lg shadow-blue-500/30"
            >
              {profileSaved ? 'Saved!' : profileSaving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>
      </div>

      {/* Git Credentials */}
      {giteaUrl && (
        <div className="bg-slate-900/60 backdrop-blur-sm border border-blue-900/30 rounded-lg p-6 mb-6">
          <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
            <Key size={14} className="text-cyan-400" /> Git Credentials
          </h3>
          <p className="text-xs text-gray-400 mb-3">Use these to access your repositories on the OpenBuild Git server.</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Git URL</label>
              <input value={giteaUrl} readOnly className="w-full px-3 py-2 bg-slate-950/40 border border-blue-900/20 rounded-lg text-gray-300 text-sm font-mono cursor-text" onClick={(e) => (e.target as HTMLInputElement).select()} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Username</label>
              <input value={username} readOnly className="w-full px-3 py-2 bg-slate-950/40 border border-blue-900/20 rounded-lg text-gray-300 text-sm font-mono cursor-text" onClick={(e) => (e.target as HTMLInputElement).select()} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Password</label>
              <div className="flex gap-2">
                <input value={giteaPassword} type="password" readOnly className="flex-1 px-3 py-2 bg-slate-950/40 border border-blue-900/20 rounded-lg text-gray-300 text-sm font-mono" />
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(giteaPassword); }}
                  className="px-3 py-2 bg-slate-800 border border-blue-900/30 rounded-lg text-xs text-slate-300 hover:bg-slate-700 transition"
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
        <div className="bg-slate-900/60 backdrop-blur-sm border border-blue-900/30 rounded-lg p-6">
          <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
            <FileText size={14} className="text-cyan-400" /> Custom Instructions
          </h3>

          <textarea
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            placeholder="Add instructions that OpenCode will follow in your sessions..."
            className="w-full px-4 py-3 bg-slate-950/60 border border-blue-900/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 h-32 resize-none"
          />
          <p className="text-xs text-gray-500 mt-2">These instructions are injected as AGENTS.md in your workspace.</p>
        </div>

        {/* Save */}
        <button
          type="submit"
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition disabled:opacity-50 shadow-lg shadow-blue-500/30"
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
