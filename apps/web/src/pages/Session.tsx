import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle, Loader2, ExternalLink, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { auth } from '../lib/firebase';

export function Session() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState('');
  const [iframeReady, setIframeReady] = useState(false);
  const [token, setToken] = useState('');
  const [terminalUrl, setTerminalUrl] = useState('');

  useEffect(() => {
    auth?.currentUser?.getIdToken().then(t => setToken(t));
  }, []);

  useEffect(() => {
    if (!id || !token) return;
    let retries = 0;
    const maxRetries = 15;

    const getSessionUrl = (sessionId: string, rawUrl: string) => {
      if (window.location.hostname === 'localhost') {
        return rawUrl;
      }
      // Extract root domain (e.g., build.paritoshraj.com → paritoshraj.com)
      const parts = window.location.hostname.split('.');
      const baseDomain = parts.slice(-2).join('.');
      return `${window.location.protocol}//s-${sessionId}.${baseDomain}`;
    };

    const poll = async () => {
      try {
        const session = await api.getSession(id);
        setSessionInfo(session);
        if (session.status === 'running' && session.web_terminal_url) {
          const url = getSessionUrl(id, session.web_terminal_url);
          setTerminalUrl(url);
          await waitForContainerReady(url);
          setLoading(false);
        } else if (session.status === 'failed') {
          setError('Session failed to start. Please try again.');
          setLoading(false);
        } else if (retries < maxRetries) {
          retries++;
          setTimeout(poll, 2000);
        } else {
          setError('Session failed to start. Please try again.');
          setLoading(false);
        }
      } catch {
        if (retries < maxRetries) {
          retries++;
          setTimeout(poll, 2000);
        } else {
          setError('Failed to load session.');
          setLoading(false);
        }
      }
    };

    const waitForContainerReady = async (_url: string) => {
      // Session subdomain requires auth, so we can't probe from the parent origin.
      // Just wait a couple seconds for the container to be ready.
      await new Promise(r => setTimeout(r, 3000));
    };

    poll();
  }, [id, token]);

  const handleComplete = async () => {
    if (!id) return;
    setCompleting(true);
    try {
      await api.completeSession(id);
      setTimeout(() => navigate('/buildlive'), 2000);
    } catch (err: any) {
      setError(`Failed to complete: ${err.message}`);
    } finally {
      setCompleting(false);
    }
  };

  const handleAbandon = async () => {
    if (!id || !confirm('Close this session? All unsaved changes will be lost.')) return;
    try {
      await api.abandonSession(id);
      navigate('/buildlive');
    } catch (err: any) {
      setError(`Failed to close: ${err.message}`);
    }
  };

  const openInNewTab = () => {
    if (terminalUrl) {
      window.open(token ? `${terminalUrl}?token=${token}` : terminalUrl, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 size={32} className="animate-spin text-[var(--ember)] mx-auto" />
          <p className="text-[var(--muted)]">Starting OpenCode session...</p>
          <p className="text-[var(--muted)] text-sm">Cloning repository and booting environment</p>
        </div>
      </div>
    );
  }

  if (error && !sessionInfo?.web_terminal_url) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-red-400">{error}</p>
          <button onClick={() => navigate('/buildlive')} className="text-[var(--muted)] hover:text-[var(--cream)]">
            Back to projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--line)] bg-[var(--bg-2)]">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[var(--ember)]" />
          <span className="text-sm">
            {sessionInfo?.fork_repo_name || 'Session'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openInNewTab}
            className="btn-ghost flex items-center gap-1 px-3 py-1.5 text-xs"
          >
            <ExternalLink size={12} /> Open in tab
          </button>
          <button
            onClick={handleAbandon}
            className="flex items-center gap-2 px-4 py-1.5 text-sm bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition"
          >
            <XCircle size={14} /> Close Session
          </button>
          <button
            onClick={handleComplete}
            disabled={completing}
            className="flex items-center gap-2 px-4 py-1.5 text-sm bg-green-500/10 text-green-400 rounded-lg hover:bg-green-500/20 transition disabled:opacity-50"
          >
            <CheckCircle size={14} />
            {completing ? 'Creating PR...' : 'Complete & Create PR'}
          </button>
        </div>
      </div>

      {/* OpenCode Web UI embedded */}
      <div className="flex-1 relative">
        {!iframeReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-main)]">
            <div className="text-center space-y-3">
              <Loader2 size={24} className="animate-spin text-[var(--ember)] mx-auto" />
              <p className="text-[var(--muted)] text-sm">Loading OpenCode interface...</p>
            </div>
          </div>
        )}
        <iframe
          src={token ? `${terminalUrl}?token=${token}` : terminalUrl}
          className="w-full h-full border-0"
          onLoad={() => setIframeReady(true)}
          allow="clipboard-read; clipboard-write"
          title="OpenCode Session"
        />
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
