import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, Wrench, Target, Flame, MessageCircle, FileText, Plus, X, Upload, Loader2, CheckCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from '../components/Avatar';

interface Project {
  id: string;
  title: string;
  tagline: string;
  domain: string;
  tools_used: string[];
  potential_applications: string[];
  owner_name: string;
  owner_avatar_url?: string;
  contributor_count: string;
  status: string;
  stage?: string;
}

export function BuildLive() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.getProjects().then(setProjects).finally(() => setLoading(false));
  }, []);

  const handleCreated = (project: Project) => {
    setProjects([project, ...projects]);
    setShowCreate(false);
  };

  const handleJoin = async (e: React.MouseEvent, projectId: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const session = await api.joinProject(projectId);
      navigate(`/session/${session.session_id}`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const toggleExpand = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        {isLoggedIn() && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition shadow-lg shadow-blue-500/30"
          >
            <Plus size={16} /> Create Project
          </button>
        )}
      </div>

      {/* Trending Projects Row */}
      {projects.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Flame size={20} className="text-orange-400" />
            <h3 className="text-base font-bold text-white">Latest Trending Projects</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {projects.slice(0, 5).map((project, i) => {
              const stages: Record<string, { label: string; pct: number }> = { ideating: { label: 'Ideating', pct: 10 }, prototyping: { label: 'Prototyping', pct: 25 }, alpha: { label: 'Alpha', pct: 50 }, beta: { label: 'Beta', pct: 75 }, ga: { label: 'GA', pct: 100 } };
              const s = stages[project.stage || 'ideating'] || stages.ideating;
              return (
                <Link
                  key={project.id}
                  to={`/buildlive/${project.id}`}
                  className="group bg-slate-900/60 backdrop-blur-sm rounded-lg border border-blue-900/30 p-3 hover:shadow-lg hover:shadow-blue-900/20 transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-blue-400">#{i + 1}</span>
                    <span className="text-xs font-semibold text-cyan-400">{s.label}</span>
                  </div>
                  <p className="text-xs font-semibold text-gray-200 mb-2 group-hover:text-cyan-300 transition-colors line-clamp-1">
                    {project.title}
                  </p>
                  <div className="w-full bg-slate-950/60 rounded-full h-2 overflow-hidden border border-blue-900/30">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-cyan-500 h-full rounded-full shadow-lg shadow-blue-500/50 transition-all duration-500"
                      style={{ width: `${s.pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 mt-1 block">{s.pct}% complete</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Project Cards Grid */}
      {loading ? (
        <div className="text-slate-400">Loading projects...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/buildlive/${project.id}`}
              className="bg-slate-900/60 backdrop-blur-sm rounded-lg border border-blue-900/30 overflow-hidden hover:shadow-lg hover:shadow-blue-900/20 transition-all"
            >
              {/* Card Header */}
              <div className="p-4 border-b border-blue-900/30">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-cyan-300 mb-1">{project.title}</h3>
                    <div className="flex items-center gap-1.5">
                      <Avatar src={project.owner_avatar_url} name={project.owner_name} size="xs" />
                      <span className="text-xs text-gray-300">{project.owner_name}</span>
                    </div>
                  </div>
                  {project.status === 'live' && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-red-900/40 text-red-400 rounded-full border border-red-700/30">
                      <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-lg shadow-red-500/50" />
                      <span className="text-xs font-medium">Live</span>
                    </div>
                  )}
                </div>

                {/* Progress */}
                <div className="mt-3">
                  {(() => {
                    const stages: Record<string, { label: string; pct: number }> = { ideating: { label: 'Ideating', pct: 10 }, prototyping: { label: 'Prototyping', pct: 25 }, alpha: { label: 'Alpha', pct: 50 }, beta: { label: 'Beta', pct: 75 }, ga: { label: 'GA', pct: 100 } };
                    const s = stages[project.stage || 'ideating'] || stages.ideating;
                    return (
                      <>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs text-gray-400">{s.label}</span>
                          <span className="text-xs font-semibold text-cyan-400">{s.pct}%</span>
                        </div>
                        <div className="w-full bg-slate-950/60 rounded-full h-2 overflow-hidden border border-blue-900/30">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-cyan-500 h-full rounded-full shadow-lg shadow-blue-500/50 transition-all duration-500"
                            style={{ width: `${s.pct}%` }}
                          />
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Product Vision */}
              <div className="p-4 border-b border-blue-900/30">
                <div className="flex items-center gap-1.5 mb-2">
                  <Target size={14} className="text-cyan-400" />
                  <h4 className="text-xs font-bold text-gray-300">Product Vision</h4>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">
                  {project.tagline || 'A collaborative open-source project leveraging AI tools to build innovative solutions.'}
                </p>
              </div>

              {/* Contributors */}
              <div className="p-4 border-b border-blue-900/30">
                <div className="flex items-center gap-1.5 mb-2">
                  <Users size={14} className="text-blue-400" />
                  <h4 className="text-xs font-bold text-gray-300">Contributors</h4>
                  <span className="px-1.5 py-0.5 bg-blue-900/50 text-blue-300 text-xs font-semibold rounded border border-blue-700/30">
                    {project.contributor_count}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <span className="px-2 py-1 bg-slate-950/60 text-gray-300 text-xs rounded border border-blue-900/30">
                    {project.owner_name}
                  </span>
                  {parseInt(project.contributor_count) > 1 && (
                    <span className="px-2 py-1 bg-gray-800/60 text-gray-400 text-xs rounded border border-gray-700/30">
                      +{parseInt(project.contributor_count) - 1} more
                    </span>
                  )}
                </div>

                {/* Areas to Contribute */}
                {project.potential_applications.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-400 mb-1.5">Areas to Contribute:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {project.potential_applications.slice(0, expandedCards.has(project.id) ? undefined : 3).map((app) => (
                        <span key={app} className="px-2 py-1 bg-slate-950/60 text-cyan-300 text-xs rounded border border-blue-900/30 hover:bg-blue-900/20 transition-colors cursor-pointer">
                          {app}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Tools */}
              {expandedCards.has(project.id) && project.tools_used.length > 0 && (
                <div className="p-4 border-b border-blue-900/30">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Wrench size={14} className="text-cyan-400" />
                    <h4 className="text-xs font-bold text-gray-300">Tools Being Used</h4>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {project.tools_used.map((tool) => (
                      <span key={tool} className="px-2 py-1 bg-indigo-900/40 text-indigo-300 text-xs rounded border border-indigo-700/30 font-medium">
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="p-4 border-b border-blue-900/30">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={(e) => handleJoin(e, project.id)}
                    className="flex items-center justify-center gap-1 px-2 py-2 bg-blue-600 text-white rounded-md text-xs font-semibold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30"
                  >
                    <Users size={12} />Join
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    className="flex items-center justify-center gap-1 px-2 py-2 bg-cyan-600 text-white rounded-md text-xs font-semibold hover:bg-cyan-700 transition-colors shadow-lg shadow-cyan-500/30"
                  >
                    <MessageCircle size={12} />Ask
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/buildlive/${project.id}/pulls`); }}
                    className="flex items-center justify-center gap-1 px-2 py-2 bg-indigo-600 text-white rounded-md text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/30"
                  >
                    <FileText size={12} />PRs
                  </button>
                </div>
              </div>

              {/* Show More */}
              <div className="p-4">
                <button
                  onClick={(e) => toggleExpand(e, project.id)}
                  className="w-full text-xs text-cyan-400 hover:text-cyan-300 font-medium text-center"
                >
                  {expandedCards.has(project.id) ? 'Show Less' : 'Show More Details'}
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
    </div>
  );
}

function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: any) => void }) {
  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [domain, setDomain] = useState('');
  const [tools, setTools] = useState('');
  const [applications, setApplications] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdProject, setCreatedProject] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const project = await api.createProject({
        title: title.trim(),
        tagline: tagline.trim(),
        domain: domain.trim() || 'general',
        tools_used: tools.split(',').map(t => t.trim()).filter(Boolean),
        potential_applications: applications.split(',').map(a => a.trim()).filter(Boolean),
      });
      setCreatedProject(project);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !createdProject) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const result = await api.uploadProjectZip(createdProject.id, file);
      setUploadResult(`Uploaded ${result.uploaded} files`);
    } catch (err: any) {
      setUploadResult(`Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDone = () => {
    onCreated(createdProject);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-blue-900/50 rounded-xl w-full max-w-lg shadow-2xl shadow-blue-900/20">
        <div className="flex items-center justify-between p-5 border-b border-blue-900/30">
          <h2 className="text-lg font-bold text-white">{createdProject ? 'Upload Project Files' : 'Create Project'}</h2>
          <button onClick={createdProject ? handleDone : onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {!createdProject ? (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Project Title *</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. AI-Powered Code Reviewer"
                className="w-full px-3 py-2 bg-slate-950/60 border border-blue-900/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Product Vision</label>
              <input
                value={tagline}
                onChange={e => setTagline(e.target.value)}
                placeholder="A short description of what you're building"
                className="w-full px-3 py-2 bg-slate-950/60 border border-blue-900/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Domain</label>
              <input
                value={domain}
                onChange={e => setDomain(e.target.value)}
                placeholder="e.g. AI, Web3, DevTools, Healthcare"
                className="w-full px-3 py-2 bg-slate-950/60 border border-blue-900/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Tools (comma-separated)</label>
              <input
                value={tools}
                onChange={e => setTools(e.target.value)}
                placeholder="e.g. OpenCode, Claude, Python"
                className="w-full px-3 py-2 bg-slate-950/60 border border-blue-900/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Areas to Contribute (comma-separated)</label>
              <input
                value={applications}
                onChange={e => setApplications(e.target.value)}
                placeholder="e.g. Frontend, API Design, Testing"
                className="w-full px-3 py-2 bg-slate-950/60 border border-blue-900/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white transition">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !title.trim()}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 shadow-lg shadow-blue-500/30"
              >
                {submitting ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <CheckCircle size={16} />
              Project "{createdProject.title}" created!
            </div>

            <p className="text-sm text-gray-400">
              Upload a ZIP file with your initial project files. The directory structure will be preserved.
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-slate-800 border border-blue-900/30 text-slate-300 rounded-lg hover:bg-slate-700 transition disabled:opacity-50"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploading ? 'Uploading...' : 'Choose ZIP'}
              </button>
              {uploadResult && <span className="text-xs text-green-400">{uploadResult}</span>}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={handleUpload}
            />

            <div className="flex justify-end gap-3 pt-2 border-t border-blue-900/30">
              <button
                onClick={handleDone}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-lg shadow-blue-500/30"
              >
                {uploadResult ? 'Done' : 'Skip'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
