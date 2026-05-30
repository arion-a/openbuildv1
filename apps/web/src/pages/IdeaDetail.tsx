import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MessageSquare, Sparkles, Send } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from '../components/Avatar';

interface Thread {
  id: string;
  body: string;
  username: string;
  avatar_url?: string;
  created_at: string;
}

export function IdeaDetail() {
  const { id } = useParams<{ id: string }>();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarising, setSummarising] = useState(false);
  const [newReply, setNewReply] = useState('');
  const [loading, setLoading] = useState(true);
  const { user, isLoggedIn } = useAuth();

  useEffect(() => {
    if (id) {
      api.getThreads(id).then(setThreads).finally(() => setLoading(false));
    }
  }, [id]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !newReply.trim()) return;
    const thread = await api.postThread(id, { body: newReply });
    setThreads([...threads, thread]);
    setNewReply('');
  };

  const handleSummarise = async () => {
    if (!id) return;
    setSummarising(true);
    try {
      const res = await api.summarise(id);
      setSummary(res.summary);
    } finally {
      setSummarising(false);
    }
  };

  const formatTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'just now';
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-lg p-5 mb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare size={18} className="text-blue-500" />
            Discussion ({threads.length})
          </h2>
          {isLoggedIn() && threads.length > 0 && (
            <button
              onClick={handleSummarise}
              disabled={summarising}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition disabled:opacity-50 border border-purple-200"
            >
              <Sparkles size={14} />
              {summarising ? 'Summarising...' : 'Summarise'}
            </button>
          )}
        </div>
      </div>

      {/* AI Summary */}
      {summary && (
        <div className="bg-white rounded-lg shadow-lg p-5 mb-4 border-l-4 border-purple-400">
          <h4 className="text-sm font-semibold text-purple-600 mb-2 flex items-center gap-2">
            <Sparkles size={14} /> AI Summary
          </h4>
          <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{summary}</div>
        </div>
      )}

      {/* Threads */}
      {loading ? (
        <div className="text-gray-400">Loading discussion...</div>
      ) : (
        <div className="space-y-3 mb-4">
          {threads.map((thread) => (
            <div key={thread.id} className="bg-white rounded-lg shadow-lg p-5">
              <div className="flex items-center gap-3 mb-3">
                <Avatar src={thread.avatar_url} name={thread.username} size="md" />
                <div>
                  <span className="text-sm font-semibold text-gray-900">{thread.username}</span>
                  <span className="text-xs text-gray-500 ml-2">{formatTime(thread.created_at)}</span>
                </div>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{thread.body}</p>
            </div>
          ))}
          {threads.length === 0 && (
            <div className="bg-white rounded-lg shadow-lg p-8 text-center">
              <MessageSquare size={32} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No discussions yet. Be the first to contribute!</p>
            </div>
          )}
        </div>
      )}

      {/* Reply form */}
      {isLoggedIn() && (
        <div className="bg-white rounded-lg shadow-lg p-4">
          <form onSubmit={handleReply} className="flex items-center gap-3">
            <Avatar src={user?.avatar_url} name={user?.username} size="md" />
            <input
              value={newReply}
              onChange={(e) => setNewReply(e.target.value)}
              placeholder="Share your thoughts..."
              className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 text-sm"
            />
            <button
              type="submit"
              className="px-4 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition shadow-md shadow-blue-500/20"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
