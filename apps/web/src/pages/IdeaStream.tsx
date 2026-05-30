import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, TrendingUp, Users, Flame, Brain, Plus, Sparkles, ThumbsUp } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from '../components/Avatar';

interface Collaborator {
  username: string;
  avatar_url: string | null;
}

interface Idea {
  id: string;
  title: string;
  body: string;
  domain: string;
  tags: string[];
  upvotes: number;
  upvoted?: boolean;
  thread_count: string;
  author: string;
  author_avatar_url?: string;
  collaborators: Collaborator[];
  created_at: string;
}

interface TrendingIdea {
  idea_id: string;
  title: string;
  domain: string;
  score: number;
  author: string;
}

export function IdeaStream() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [trending, setTrending] = useState<TrendingIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewIdea, setShowNewIdea] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const { user, isLoggedIn } = useAuth();

  useEffect(() => {
    Promise.all([api.getIdeas(), api.getTrending()])
      .then(([ideas, trending]) => { setIdeas(ideas); setTrending(trending); })
      .finally(() => setLoading(false));
  }, []);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    const idea = await api.createIdea({ title: newTitle, body: newBody, domain: newDomain });
    setIdeas([{ ...idea, collaborators: [] }, ...ideas]);
    setShowNewIdea(false);
    setNewTitle(''); setNewBody(''); setNewDomain('');
  };

  const handleUpvote = async (e: React.MouseEvent, ideaId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn()) return;
    try {
      const res = await api.upvote(ideaId);
      setIdeas(ideas.map(i => i.id === ideaId ? { ...i, upvotes: res.upvotes, upvoted: res.upvoted } : i));
    } catch {}
  };

  const formatTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'just now';
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">
      {/* Main feed */}
      <div className="flex-1 space-y-4">

        {/* New idea form */}
        {showNewIdea ? (
          <form onSubmit={handlePost} className="bg-white rounded-lg p-5 mb-4 shadow-lg">
            <input
              placeholder="What's on your mind? Share your bit..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 mb-3"
            />
            <textarea
              placeholder="Describe your idea..."
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 mb-3 h-24 resize-none"
            />
            <div className="flex gap-3">
              <input
                placeholder="Domain (e.g. AlphaFold DB, Enterprise AI)"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 text-sm"
              />
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 shadow-md shadow-blue-500/20">
                Post
              </button>
              <button type="button" onClick={() => setShowNewIdea(false)} className="px-4 py-2 text-gray-500 text-sm hover:text-gray-700">
                Cancel
              </button>
            </div>
          </form>
        ) : isLoggedIn() && (
          <div className="bg-white rounded-lg p-4 mb-4 shadow-lg flex items-center gap-3">
            <Avatar src={user?.avatar_url} name={user?.username} size="lg" />
            <button
              onClick={() => setShowNewIdea(true)}
              className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-400 text-left text-sm hover:border-blue-300 transition"
            >
              What's on your mind? Share your bit
            </button>
          </div>
        )}

        {/* Ideas list */}
        {loading ? (
          <div className="text-slate-400">Loading ideas...</div>
        ) : (
          <div className="space-y-4">
            {ideas.map((idea) => (
              <div
                key={idea.id}
                className="bg-white rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-all"
              >
                {/* Thread header */}
                <div className="p-5 border-b border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar src={idea.author_avatar_url} name={idea.author} size="lg" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">{idea.author}</span>
                          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-600 text-xs font-semibold rounded">OP</span>
                        </div>
                        <span className="text-xs text-gray-500">{formatTime(idea.created_at)}</span>
                      </div>
                    </div>
                    {parseInt(idea.thread_count) > 3 && (
                      <div className="flex items-center gap-1.5 text-red-500">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-xs font-semibold">Live</span>
                      </div>
                    )}
                  </div>

                  <Link to={`/ideastream/${idea.id}`} className="block mt-4">
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                      <Brain size={16} className="text-orange-500" />
                      Thread: "{idea.title}"
                    </h3>
                  </Link>

                  {/* Domain */}
                  <div className="mt-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-600 text-xs font-medium rounded-full border border-blue-100">
                      <Sparkles size={10} />
                      Domain: {idea.domain || 'general'}
                    </span>
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-6 mt-4 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 text-gray-500">
                      <MessageSquare size={14} className="text-gray-400" />
                      <span className="font-bold text-gray-900">{idea.thread_count}</span>
                      <span className="text-xs">discussions</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-500">
                      <Users size={14} className="text-gray-400" />
                      <span className="font-bold text-gray-900">{idea.collaborators.length}</span>
                      <span className="text-xs">contributors</span>
                    </div>
                  </div>
                </div>

                {/* Collaborating + quotes */}
                {idea.body && (
                  <div className="p-5 border-b border-gray-100">
                    {idea.collaborators.length > 0 && (
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-xs text-gray-500">Collaborating:</span>
                        <div className="flex -space-x-1.5">
                          {idea.collaborators.slice(0, 7).map((c) => (
                            <Avatar key={c.username} src={c.avatar_url} name={c.username} size="sm" className="border-2 border-white" />
                          ))}
                        </div>
                        {idea.collaborators.length > 7 && (
                          <span className="text-xs font-medium text-gray-500">+{idea.collaborators.length - 7}</span>
                        )}
                      </div>
                    )}

                    {/* Quoted ideas */}
                    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                      <div className="flex items-start gap-2">
                        <span className="text-blue-500 mt-0.5">&rarr;</span>
                        <div>
                          <p className="text-sm text-gray-700">"{idea.body}"</p>
                          <span className="text-xs text-gray-400 mt-1 block">by {idea.author}</span>
                        </div>
                      </div>
                    </div>
                    {parseInt(idea.thread_count) > 1 && (
                      <Link to={`/ideastream/${idea.id}`} className="text-xs text-blue-500 hover:text-blue-600 font-medium mt-3 block">
                        Show {parseInt(idea.thread_count) - 1} more ideas...
                      </Link>
                    )}
                  </div>
                )}

                {/* Live discussion indicator */}
                {parseInt(idea.thread_count) > 3 && (
                  <div className="px-5 py-2.5 border-b border-gray-100 flex items-center gap-2">
                    <MessageSquare size={12} className="text-gray-400" />
                    <span className="text-xs text-gray-400 italic">Live discussion happening...</span>
                  </div>
                )}

                {/* Action buttons */}
                <div className="px-5 py-3 flex items-center gap-3">
                  <button
                    onClick={(e) => handleUpvote(e, idea.id)}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2.5 border rounded-lg text-sm font-medium transition-colors ${
                      idea.upvoted
                        ? 'border-blue-300 bg-blue-50 text-blue-600'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-blue-300 hover:text-blue-600'
                    }`}
                  >
                    <ThumbsUp size={14} /> {idea.upvotes}
                  </button>
                  <Link
                    to={`/ideastream/${idea.id}`}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20"
                  >
                    <MessageSquare size={14} /> Discuss
                  </Link>
                  <Link
                    to={`/ideastream/${idea.id}`}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-500 text-white rounded-lg text-sm font-semibold hover:bg-cyan-600 transition-colors shadow-md shadow-cyan-500/20"
                  >
                    <Plus size={14} /> Add Idea
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sidebar - Trending */}
      <aside className="w-72 hidden lg:block space-y-6">
        <div className="bg-slate-900/60 backdrop-blur-sm border border-blue-900/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Flame size={16} className="text-orange-400" />
            <h3 className="text-sm font-bold text-white">Top 10 Trending Ideas</h3>
          </div>
          <div className="space-y-3">
            {trending.slice(0, 10).map((t, i) => (
              <Link
                key={t.idea_id}
                to={`/ideastream/${t.idea_id}`}
                className="flex items-start gap-2 group"
              >
                <span className="text-xs font-bold text-blue-400 mt-0.5">#{i + 1}</span>
                <div className="flex-1">
                  <p className="text-xs text-gray-300 group-hover:text-cyan-300 transition-colors line-clamp-1">
                    {t.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500">{t.domain}</span>
                    <span className="text-xs font-semibold text-orange-400">{Math.floor(t.score)}</span>
                  </div>
                </div>
              </Link>
            ))}
            {trending.length === 0 && (
              <p className="text-xs text-gray-500">No trending ideas yet. Be the first!</p>
            )}
          </div>
        </div>

        {/* Explore domains */}
        <div className="bg-slate-900/60 backdrop-blur-sm border border-blue-900/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} className="text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Explore Domains</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['AlphaFold DB', 'Enterprise AI', 'NLP & Health', 'Biotech', 'Climate', 'EdTech'].map((d) => (
              <span key={d} className="px-2 py-1 text-xs bg-slate-950/60 text-cyan-300 rounded border border-blue-900/30 hover:bg-blue-900/20 cursor-pointer transition-colors">
                {d}
              </span>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
