import { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Settings, UserRound, Shield, Mail, Search, Bell } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { Avatar } from './Avatar';

function AccountMenu() {
  const navigate = useNavigate();
  const { user, logout, isLoggedIn } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!isLoggedIn()) {
    return (
      <Link to="/auth" className="text-sm font-semibold text-[var(--muted)] hover:text-[var(--cream)]">
        Sign in
      </Link>
    );
  }

  const go = (path: string) => {
    setShowMenu(false);
    navigate(path);
  };

  const item = 'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-[var(--muted)] hover:text-[var(--cream)] hover:bg-white/5';

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setShowMenu(!showMenu)}
        aria-haspopup="menu"
        aria-expanded={showMenu}
        className="rounded-full ring-1 ring-[var(--line)] hover:ring-[var(--ember)]/50 transition"
      >
        <Avatar src={user?.avatar_url} name={[user?.display_name, user?.username, user?.email]} size="md" />
      </button>
      {showMenu && (
        <div
          role="menu"
          className="absolute right-0 top-11 w-56 bg-[var(--surface)] border border-[var(--line)] rounded-2xl overflow-hidden z-50 shadow-xl"
        >
          <div className="px-3 py-2.5 border-b border-[var(--line)]">
            <p className="text-sm truncate">{user?.display_name || user?.username}</p>
            <p className="text-xs text-[var(--muted)] truncate">{user?.email}</p>
          </div>
          <button type="button" onClick={() => go('/account')} className={item}>
            <UserRound size={15} /> Account
          </button>
          <button type="button" onClick={() => go('/settings')} className={item}>
            <Settings size={15} /> Settings
          </button>
          <button type="button" onClick={() => go('/privacy')} className={item}>
            <Shield size={15} /> Privacy
          </button>
          <button type="button" onClick={() => go('/messages')} className={item}>
            <Mail size={15} /> Messages
          </button>
          <div className="border-t border-[var(--line)]">
            <button
              type="button"
              onClick={() => {
                setShowMenu(false);
                logout();
              }}
              className={item}
            >
              <LogOut size={15} /> Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function HeaderSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
      className="hidden sm:block flex-1 max-w-xs mx-auto"
    >
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
          aria-label="Search"
          className="w-full h-8 pl-8 pr-3 rounded-full bg-[#100e0c] border border-[var(--line)] text-sm text-[var(--cream)] outline-none focus:border-[var(--ember)]/60 placeholder:text-[#6f675c]"
        />
      </div>
    </form>
  );
}

function NotifBell() {
  const { isLoggedIn } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isLoggedIn()) return;
    let live = true;
    const tick = async () => {
      try {
        const [n, m] = await Promise.all([api.unreadNotifications(), api.unreadMessages()]);
        if (live) setCount((n?.count || 0) + (m?.count || 0));
      } catch {
        /* offline is fine */
      }
    };
    tick();
    const id = setInterval(tick, 45000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  if (!isLoggedIn()) return null;
  return (
    <Link to="/notifications" className="relative text-[var(--muted)] hover:text-[var(--cream)]" aria-label="Activity">
      <Bell size={18} />
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-1 text-[9px] font-bold bg-[var(--ember)] text-white rounded-full flex items-center justify-center">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  );
}

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const active = (path: string) => location.pathname.startsWith(path);

  const goPublish = () => {
    if (!isLoggedIn()) {
      navigate(`/auth?next=${encodeURIComponent('/publish')}`);
      return;
    }
    navigate('/publish');
  };

  const tab = (path: string) =>
    `text-sm font-semibold whitespace-nowrap transition-colors ${
      active(path) ? 'text-[var(--ember)]' : 'text-[var(--muted)] hover:text-[var(--cream)]'
    }`;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--bg)]/90 backdrop-blur-md px-4 md:px-8 h-14 flex items-center gap-3 md:gap-8">
        <Link to="/buildlive" className="font-display text-lg md:text-xl leading-none shrink-0">
          Open<span className="text-[var(--ember)]">Build</span>
        </Link>
        <nav className="flex items-center gap-3 md:gap-5 min-w-0">
          <Link to="/discover" className={tab('/discover')}>
            Discover
          </Link>
          <Link to="/buildlive" className={tab('/buildlive')}>
            Builds
          </Link>
          <Link to="/ideastream" className={tab('/ideastream')}>
            Ideas
          </Link>
          <Link to="/makers" className={tab('/makers')}>
            Builders
          </Link>
        </nav>
        <HeaderSearch />
        {import.meta.env.DEV && <p className="hidden md:block text-[10px] text-[var(--muted)]">local</p>}
        <button onClick={goPublish} className="btn-ember px-3 md:px-4 py-1.5 text-xs md:text-sm">
          Publish
        </button>
        <NotifBell />
        <AccountMenu />
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
