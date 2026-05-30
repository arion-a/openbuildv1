import { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, Eye, Share2, Users, LogOut, Settings } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from './Avatar';

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isLoggedIn } = useAuth();
  const active = (path: string) => location.pathname.startsWith(path);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-slate-900/80 backdrop-blur-sm border-b border-blue-900/50 sticky top-0 z-10 shadow-lg shadow-blue-900/20">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/50">
                  <Sparkles size={16} className="text-white" />
                </div>
                <span className="text-xs text-gray-500">OpenBuild</span>
              </div>
              <h1 className="text-2xl font-bold text-white">
                {active('/ideastream') ? 'IdeaStream' : 'BuildLive'}
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {active('/ideastream')
                  ? 'Because ideas die in isolation'
                  : 'Build, Shape and Lead'}
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2 bg-slate-800/50 backdrop-blur-sm rounded-lg p-1 border border-blue-900/30">
                <Link
                  to="/buildlive"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    active('/buildlive')
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/50'
                      : 'text-blue-200 hover:text-white'
                  }`}
                >
                  BuildLive
                </Link>
                <Link
                  to="/ideastream"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    active('/ideastream')
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/50'
                      : 'text-blue-200 hover:text-white'
                  }`}
                >
                  IdeaStream
                </Link>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-blue-300">
                  <Eye size={16} className="text-blue-400" />
                  <span className="text-xs font-medium">See</span>
                </div>
                <div className="flex items-center gap-1.5 text-cyan-300">
                  <Share2 size={16} className="text-cyan-400" />
                  <span className="text-xs font-medium">Share</span>
                </div>
                <div className="flex items-center gap-1.5 text-indigo-300">
                  <Users size={16} className="text-indigo-400" />
                  <span className="text-xs font-medium">Collaborate</span>
                </div>
              </div>
            </div>

            {/* Avatar / Auth */}
            <div className="relative" ref={menuRef}>
              {isLoggedIn() ? (
                <>
                  <button
                    onClick={() => setShowMenu(!showMenu)}
                    className="hover:ring-2 hover:ring-cyan-400/50 transition rounded-full"
                  >
                    <Avatar src={user?.avatar_url} name={user?.username} size="md" />
                  </button>

                  {showMenu && (
                    <div className="absolute right-0 top-12 w-56 bg-slate-900 border border-blue-900/50 rounded-lg shadow-2xl shadow-black/40 overflow-hidden z-50">
                      {/* User info */}
                      <div className="px-4 py-3 border-b border-blue-900/30">
                        <p className="text-sm font-semibold text-white">{user?.display_name || user?.username}</p>
                        <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                      </div>

                      {/* Menu items */}
                      <div className="py-1">
                        <button
                          onClick={() => { setShowMenu(false); navigate('/settings'); }}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:bg-blue-900/20 hover:text-white transition"
                        >
                          <Settings size={14} /> Settings
                        </button>
                        <button
                          onClick={() => { setShowMenu(false); logout(); }}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-900/20 hover:text-red-300 transition"
                        >
                          <LogOut size={14} /> Log out
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <Link
                  to="/auth"
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition shadow-lg shadow-blue-500/30"
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
