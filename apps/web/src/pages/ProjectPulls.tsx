import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { GitPullRequest, GitMerge, X, ChevronDown, ChevronRight, FileCode, AlertTriangle, ExternalLink } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

interface PullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  author: string;
  created_at: string;
  head: string;
  base: string;
  mergeable: boolean;
  html_url: string;
}

interface DiffFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string;
}

export function ProjectPulls() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [pulls, setPulls] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPR, setSelectedPR] = useState<number | null>(null);
  const [diff, setDiff] = useState<DiffFile[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [project, setProject] = useState<any>(null);
  const isOwner = project && user && project.owner_id === user.id;

  useEffect(() => {
    if (!id) return;
    api.getProject(id).then(setProject).catch(() => {});
    api.getProjectPulls(id).then(setPulls).finally(() => setLoading(false));
  }, [id]);

  const viewDiff = async (prNumber: number) => {
    if (selectedPR === prNumber) {
      setSelectedPR(null);
      setDiff([]);
      return;
    }
    setSelectedPR(prNumber);
    setDiffLoading(true);
    try {
      const files = await api.getPullDiff(id!, prNumber);
      setDiff(files);
    } catch {
      setDiff([]);
    } finally {
      setDiffLoading(false);
    }
  };

  const handleMerge = async (prNumber: number) => {
    if (!confirm('Merge this pull request?')) return;
    setMerging(true);
    try {
      await api.mergePull(id!, prNumber);
      setPulls(pulls.filter(p => p.number !== prNumber));
      setSelectedPR(null);
      setDiff([]);
    } catch (err: any) {
      alert(`Merge failed: ${err.message}`);
    } finally {
      setMerging(false);
    }
  };

  const handleClose = async (prNumber: number) => {
    if (!confirm('Close this pull request without merging?')) return;
    try {
      await api.closePull(id!, prNumber);
      setPulls(pulls.filter(p => p.number !== prNumber));
      setSelectedPR(null);
      setDiff([]);
    } catch (err: any) {
      alert(`Close failed: ${err.message}`);
    }
  };

  if (loading) return <div className="p-6 text-slate-400">Loading pull requests...</div>;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to={`/buildlive/${id}`} className="text-sm text-slate-500 hover:text-slate-300 mb-1 block">
            &larr; Back to project
          </Link>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <GitPullRequest size={20} className="text-cyan-400" />
            Pull Requests
            {project && <span className="text-slate-500 font-normal text-base">for {project.title}</span>}
          </h1>
        </div>
      </div>

      {pulls.length === 0 ? (
        <div className="bg-[var(--bg-card)] border border-slate-800 rounded-xl p-8 text-center">
          <GitPullRequest size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No open pull requests</p>
          <p className="text-slate-600 text-sm mt-1">PRs from contributors will show up here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pulls.map((pr) => (
            <div key={pr.id} className="bg-[var(--bg-card)] border border-slate-800 rounded-xl overflow-hidden">
              {/* PR Header */}
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => viewDiff(pr.number)}>
                  <GitPullRequest size={16} className="text-green-400" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{pr.title}</span>
                      <span className="text-slate-600 text-sm">#{pr.number}</span>
                      <a
                        href={pr.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-slate-500 hover:text-cyan-400 transition"
                        title="View on Gitea"
                      >
                        <ExternalLink size={12} />
                      </a>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {pr.author} wants to merge into {pr.base} from {pr.head}
                      <span className="ml-2">{new Date(pr.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {selectedPR === pr.number ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronRight size={16} className="text-slate-500" />}
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {pr.mergeable === false && (
                    <span className="flex items-center gap-1 px-2 py-1 text-xs bg-yellow-500/10 text-yellow-400 rounded-lg border border-yellow-500/20">
                      <AlertTriangle size={12} /> Conflicts
                    </span>
                  )}
                  {isOwner && (
                    <>
                      <button
                        onClick={() => handleMerge(pr.number)}
                        disabled={merging || pr.mergeable === false}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-500/10 text-green-400 rounded-lg hover:bg-green-500/20 transition disabled:opacity-50"
                        title={pr.mergeable === false ? 'Cannot merge: has conflicts' : 'Merge this PR'}
                      >
                        <GitMerge size={14} /> Merge
                      </button>
                      <button
                        onClick={() => handleClose(pr.number)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition"
                      >
                        <X size={14} /> Close
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* PR Body */}
              {selectedPR === pr.number && pr.body && (
                <div className="px-4 pb-3 text-sm text-slate-400 border-t border-slate-800/50 pt-3">
                  {pr.body}
                </div>
              )}

              {/* Diff */}
              {selectedPR === pr.number && (
                <div className="border-t border-slate-800">
                  {diffLoading ? (
                    <div className="p-4 text-slate-500 text-sm">Loading diff...</div>
                  ) : diff.length === 0 ? (
                    <div className="p-4 text-slate-500 text-sm">No file changes</div>
                  ) : (
                    <div className="divide-y divide-slate-800/50">
                      {diff.map((file) => (
                        <DiffFileView key={file.filename} file={file} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DiffFileView({ file }: { file: DiffFile }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <div
        className="px-4 py-2 flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-800/30"
        onClick={() => setExpanded(!expanded)}
      >
        <FileCode size={14} className="text-slate-500" />
        <span className="text-slate-300 font-mono text-xs">{file.filename}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          file.status === 'added' ? 'bg-green-500/10 text-green-400' :
          file.status === 'deleted' ? 'bg-red-500/10 text-red-400' :
          'bg-yellow-500/10 text-yellow-400'
        }`}>{file.status}</span>
        <span className="text-xs text-green-400">+{file.additions}</span>
        <span className="text-xs text-red-400">-{file.deletions}</span>
      </div>
      {expanded && file.patch && (
        <pre className="px-4 pb-3 text-xs font-mono overflow-x-auto leading-relaxed">
          {file.patch.split('\n').map((line, i) => (
            <div
              key={i}
              className={
                line.startsWith('+') ? 'text-green-400 bg-green-500/5' :
                line.startsWith('-') ? 'text-red-400 bg-red-500/5' :
                line.startsWith('@@') ? 'text-cyan-400' :
                'text-slate-500'
              }
            >
              {line}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}
