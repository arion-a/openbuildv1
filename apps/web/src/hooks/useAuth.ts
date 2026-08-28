import { create } from 'zustand';
import {
  auth,
  onAuthStateChanged,
  signOut,
  type User as FirebaseUser,
} from '../lib/firebase';

interface User {
  id: string;
  username: string;
  display_name?: string;
  email: string;
  avatar_url?: string;
  bio?: string;
  github_username?: string | null;
  github_url?: string | null;
  lovable_url?: string | null;
  replit_url?: string | null;
  bolt_url?: string | null;
  created_at?: string;
}

function readStoredUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

interface AuthState {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setFirebaseUser: (user: FirebaseUser | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => Promise<void>;
  isLoggedIn: () => boolean;
  getIdToken: () => Promise<string | null>;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: readStoredUser(),
  firebaseUser: null,
  loading: !!auth,
  setUser: (user) => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
    set({ user });
  },
  setFirebaseUser: (firebaseUser) => set({ firebaseUser }),
  setLoading: (loading) => set({ loading }),
  logout: async () => {
    if (auth) await signOut(auth);
    localStorage.removeItem('user');
    localStorage.removeItem('ob_jwt');
    set({ user: null, firebaseUser: null });
  },
  isLoggedIn: () => !!get().firebaseUser || !!get().user || !!localStorage.getItem('ob_jwt'),
  getIdToken: async () => {
    const jwt = localStorage.getItem('ob_jwt');
    if (jwt) return jwt;
    const fbUser = get().firebaseUser;
    if (!fbUser) return null;
    return fbUser.getIdToken();
  },
}));

if (auth) {
  onAuthStateChanged(auth, async (firebaseUser) => {
    const state = useAuth.getState();
    state.setFirebaseUser(firebaseUser);

    if (firebaseUser) {
      const token = await firebaseUser.getIdToken();
      try {
        const BASE = (typeof import.meta.env.VITE_API_URL === 'string' && import.meta.env.VITE_API_URL.trim())
          ? import.meta.env.VITE_API_URL.trim().replace(/\/$/, '')
          : '/api';
        const res = await fetch(`${BASE}/auth/firebase`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          state.setUser({
            id: data.user.id,
            username: data.user.username,
            display_name: data.user.display_name,
            email: data.user.email,
            avatar_url: data.user.avatar_url,
            bio: data.user.bio,
            github_username: data.user.github_username,
            github_url: data.user.github_url,
            lovable_url: data.user.lovable_url,
            replit_url: data.user.replit_url,
            bolt_url: data.user.bolt_url,
          });
        }
      } catch {
        // Backend not available — keep firebase user, clear local user
      }
    } else if (!localStorage.getItem('ob_jwt')) {
      state.setUser(null);
    }
    state.setLoading(false);
  });
}
