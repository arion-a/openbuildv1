import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Users, Wrench, Target, GitFork, GitPullRequest, Pencil, Save, X, Milestone } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from '../components/Avatar';

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', tagline: '', domain: '', tools_used: '', potential_applications: '', stage: '' });
  const { isLoggedIn, user } = useAuth();
  const navigate = useNavigate();
  const isOwner = project && user && project.owner_id === user.id;

  useEffect(() => {
    if (id) api.getProject(id).then(setProject).finally(() => setLoading(false));
  }, [id]);

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

  const STAGES = [
    { key: 'ideating', label: 'Ideating', pct: 10 },
    { key: 'prototyping', label: 'Prototyping', pct: 25 },
    { key: 'alpha', label: 'Alpha', pct: 50 },
    { key: 'beta', label: 'Beta', pct: 75 },
    { key: 'ga', label: 'GA', pct: 100 },
  ];

  const currentStage = STAGES.find(s => s.key === (project?.stage || 'ideating')) || STAGES[0];

  const startEdit = () => {
    setEditForm({
      title: project.title,
      tagline: project.tagline || '',
      domain: project.domain || '',
      tools_used: (project.tools_used || []).join(', '),
      potential_applications: (project.potential_applications || []).join(', '),
      stage: project.stage || 'ideating',
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
        domain: editForm.domain,
        tools_used: editForm.tools_used.split(',').map(t => t.trim()).filter(Boolean),
        potential_applications: editForm.potential_applications.split(',').map(a => a.trim()).filter(Boolean),
        stage: editForm.stage,
      });
      setProject({ ...project, ...updated });
      setEditing(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-slate-400">Loading...</div>;
  if (!project) return <div className="p-6 text-slate-400">Project not found</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-slate-900/60 backdrop-blur-sm border border-blue-900/30 rounded-lg overflow-hidden">
        <div className="p-8">
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                {editing ? (
                  <input
                    value={editForm.domain}
                    onChange={e => setEditForm({ ...editForm, domain: e.target.value })}
                    placeholder="Domain"
                    className="px-2 py-0.5 text-xs bg-slate-950/60 border border-blue-900/30 rounded-full text-blue-300 focus:outline-none focus:border-cyan-500 w-32"
                  />
                ) : (
                  <span className="px-2 py-0.5 text-xs bg-blue-900/50 text-blue-300 rounded-full border border-blue-700/30">{project.domain}</span>
                )}
                {project.status === 'live' && (
                  <div className="flex items-center gap-1 px-2 py-0.5 bg-red-900/40 text-red-400 rounded-full border border-red-700/30">
                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-xs font-medium">Live</span>
                  </div>
                )}
              </div>
              {editing ? (
                <input
                  value={editForm.title}
                  onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                  className="text-2xl font-bold text-white bg-slate-950/60 border border-blue-900/30 rounded-lg px-3 py-1 w-full focus:outline-none focus:border-cyan-500"
                />
              ) : (
                <h1 className="text-2xl font-bold text-white">{project.title}</h1>
              )}
              {editing ? (
                <input
                  value={editForm.tagline}
                  onChange={e => setEditForm({ ...editForm, tagline: e.target.value })}
                  placeholder="Product vision / tagline"
                  className="mt-2 text-sm text-gray-400 bg-slate-950/60 border border-blue-900/30 rounded-lg px-3 py-1 w-full focus:outline-none focus:border-cyan-500"
                />
              ) : (
                <p className="text-gray-400 mt-2">{project.tagline}</p>
              )}
            </div>
            <div className="flex items-center gap-2 ml-4">
              {isOwner && !editing && (
                <button
                  onClick={startEdit}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-blue-900/30 text-slate-400 rounded-lg hover:border-blue-700 hover:text-white transition"
                >
                  <Pencil size={14} /> Edit
                </button>
              )}
              {editing && (
                <>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                  >
                    <Save size={14} /> {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-blue-900/30 text-slate-400 rounded-lg hover:text-white transition"
                  >
                    <X size={14} /> Cancel
                  </button>
                </>
              )}
              {isLoggedIn() && !editing && (
                <>
                  <Link
                    to={`/buildlive/${id}/pulls`}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-blue-900/30 text-blue-300 rounded-lg hover:border-blue-700 hover:text-white transition whitespace-nowrap"
                  >
                    <GitPullRequest size={14} />
                    Pull Requests
                  </Link>
                  <button
                    onClick={handleJoin}
                    disabled={joining}
                    className="inline-flex items-center gap-2 px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 shadow-lg shadow-blue-500/30 whitespace-nowrap"
                  >
                    <GitFork size={14} />
                    {joining ? 'Starting...' : 'Join & Build'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Vision */}
          {!editing && (
            <div className="mb-6 p-4 bg-slate-950/40 rounded-lg border border-blue-900/20">
              <h3 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                <Target size={14} className="text-cyan-400" /> Product Vision
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">{project.tagline}</p>
            </div>
          )}

          {/* Tools */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
              <Wrench size={14} className="text-cyan-400" /> Tools Being Used
            </h3>
            {editing ? (
              <input
                value={editForm.tools_used}
                onChange={e => setEditForm({ ...editForm, tools_used: e.target.value })}
                placeholder="Comma-separated tools"
                className="w-full px-3 py-2 bg-slate-950/60 border border-blue-900/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                {project.tools_used.map((tool: string) => (
                  <span key={tool} className="px-3 py-1 text-sm bg-indigo-900/40 text-indigo-300 rounded-lg border border-indigo-700/30 font-medium">{tool}</span>
                ))}
              </div>
            )}
          </div>

          {/* Applications */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
              <Target size={14} className="text-cyan-400" /> Areas to Contribute
            </h3>
            {editing ? (
              <input
                value={editForm.potential_applications}
                onChange={e => setEditForm({ ...editForm, potential_applications: e.target.value })}
                placeholder="Comma-separated areas"
                className="w-full px-3 py-2 bg-slate-950/60 border border-blue-900/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                {project.potential_applications.map((app: string) => (
                  <span key={app} className="px-3 py-1 text-sm bg-slate-950/60 text-cyan-300 rounded-lg border border-blue-900/30">{app}</span>
                ))}
              </div>
            )}
          </div>

          {/* Roadmap / Stage */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
              <Milestone size={14} className="text-cyan-400" /> Project Roadmap
            </h3>
            {editing ? (
              <div className="flex gap-2 flex-wrap">
                {STAGES.map(s => (
                  <button
                    key={s.key}
                    onClick={() => setEditForm({ ...editForm, stage: s.key })}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                      editForm.stage === s.key
                        ? 'bg-cyan-600/30 border-cyan-500 text-cyan-300'
                        : 'bg-slate-950/60 border-blue-900/30 text-slate-400 hover:border-blue-700'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-cyan-300 font-medium">{currentStage.label}</span>
                  <span className="text-xs text-slate-500">{currentStage.pct}%</span>
                </div>
                <div className="h-2 bg-slate-950/60 rounded-full border border-blue-900/20 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-600 to-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${currentStage.pct}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2">
                  {STAGES.map(s => (
                    <div key={s.key} className="flex flex-col items-center">
                      <div className={`w-2 h-2 rounded-full ${
                        s.pct <= currentStage.pct ? 'bg-cyan-400' : 'bg-slate-700'
                      }`} />
                      <span className={`text-[10px] mt-1 ${
                        s.key === currentStage.key ? 'text-cyan-300' : 'text-slate-600'
                      }`}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Contributors */}
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
              <Users size={14} className="text-blue-400" /> Contributors ({project.contributors?.length || 0})
            </h3>
            <div className="flex flex-wrap gap-3">
              {project.contributors?.map((c: any) => (
                <div key={c.user_id} className="flex items-center gap-2 px-3 py-1.5 bg-slate-950/60 rounded-lg border border-blue-900/30">
                  <Avatar src={c.avatar_url} name={c.username} size="sm" />
                  <span className="text-sm text-gray-300">{c.username}</span>
                  <span className="text-xs text-gray-600">{c.role}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
