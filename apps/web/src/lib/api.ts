import { auth, onAuthStateChanged } from './firebase';

const BASE = (typeof import.meta.env.VITE_API_URL === 'string' && import.meta.env.VITE_API_URL.trim())
  ? import.meta.env.VITE_API_URL.trim().replace(/\/$/, '')
  : '/api';

function waitForAuth(): Promise<{ getIdToken: () => Promise<string> } | null> {
  const a = auth;
  if (!a) return Promise.resolve(null);
  if (a.currentUser) return Promise.resolve(a.currentUser);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (user: { getIdToken: () => Promise<string> } | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsub();
      resolve(user);
    };
    const unsub = onAuthStateChanged(a, (user) => finish(user));
    const timer = setTimeout(() => finish(a.currentUser ?? null), 2000);
  });
}

function getStoredJwt(): string | null {
  try {
    return localStorage.getItem('ob_jwt');
  } catch {
    return null;
  }
}

async function getAuthToken(): Promise<string | null> {
  const jwt = getStoredJwt();
  if (jwt) return jwt;
  const user = await waitForAuth();
  return user ? user.getIdToken() : null;
}

async function request(path: string, options: RequestInit = {}) {
  const token = await getAuthToken();

  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string>) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    const msg = err.message || err.error || res.statusText;
    if (res.status === 502 || res.status === 503 || /bad gateway/i.test(msg)) {
      throw new Error('API is not running. From the repo root run npm run dev, wait until the api is ready, then try again.');
    }
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  // Auth
  syncFirebase: () => request('/auth/firebase', { method: 'POST' }),
  localAuth: (data: { email: string; password: string; display_name?: string; mode: 'signin' | 'signup' }) =>
    request('/auth/local', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request('/auth/me'),
  checkUsername: (u: string) => request(`/auth/username-available?u=${encodeURIComponent(u)}`),
  updateProfile: (data: {
    avatar_url?: string;
    bio?: string;
    username?: string;
    display_name?: string;
    github_url?: string;
    lovable_url?: string;
    replit_url?: string;
    bolt_url?: string;
  }) => request('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
  getMaker: (username: string) => request(`/makers/${encodeURIComponent(username)}`),
  getMakers: (sort?: string) => request(`/makers${sort ? `?sort=${encodeURIComponent(sort)}` : ''}`),

  // Projects (BuildLive)
  getProjects: (params?: string) => request(`/projects${params ? `?${params}` : ''}`),
  getProject: (id: string) => request(`/projects/${id}`),
  createProject: (data: any) => request('/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id: string, data: any) => request(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  upvoteProject: (id: string) => request(`/projects/${id}/upvote`, { method: 'POST' }),
  getProjectThreads: (id: string) => request(`/projects/${id}/threads`),
  postProjectThread: (id: string, data: { body: string }) =>
    request(`/projects/${id}/threads`, { method: 'POST', body: JSON.stringify(data) }),
  getProjectReviews: (id: string) => request(`/projects/${id}/reviews`),
  postProjectReview: (id: string, data: { rating: number; body?: string }) =>
    request(`/projects/${id}/reviews`, { method: 'POST', body: JSON.stringify(data) }),
  uploadProjectZip: async (projectId: string, file: File) => {
    const token = await getAuthToken();
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE}/projects/${projectId}/upload`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.json();
  },

  // Sessions (Join)
  joinProject: (projectId: string) => request(`/sessions/join/${projectId}`, { method: 'POST' }),
  getSession: (id: string) => request(`/sessions/${id}`),
  completeSession: (id: string) => request(`/sessions/${id}/complete`, { method: 'POST' }),
  abandonSession: (id: string) => request(`/sessions/${id}`, { method: 'DELETE' }),

  // Ideas (IdeaStream)
  getIdeas: (params?: string) => request(`/ideas${params ? `?${params}` : ''}`),
  getIdea: (id: string) => request(`/ideas/${id}`),
  createIdea: (data: any) => request('/ideas', { method: 'POST', body: JSON.stringify(data) }),
  getThreads: (ideaId: string) => request(`/ideas/${ideaId}/threads`),
  postThread: (ideaId: string, data: { body: string; parent_id?: string }) =>
    request(`/ideas/${ideaId}/threads`, { method: 'POST', body: JSON.stringify(data) }),
  upvote: (ideaId: string) => request(`/ideas/${ideaId}/upvote`, { method: 'POST' }),
  summarise: (ideaId: string) => request(`/ideas/${ideaId}/summarise`, { method: 'POST' }),

  listPublications: () => request('/publications'),
  getPublication: (id: string) => request(`/publications/${id}`),
  createPublication: (data: any) => request('/publications', { method: 'POST', body: JSON.stringify(data) }),
  updatePublication: (id: string, data: any) => request(`/publications/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  publishPublication: (id: string) => request(`/publications/${id}/publish`, { method: 'POST' }),
  deletePublication: (id: string) => request(`/publications/${id}`, { method: 'DELETE' }),

  joinWaitlist: (email: string) => request('/waitlist', { method: 'POST', body: JSON.stringify({ email }) }),

  // Search
  search: (q: string, type: 'all' | 'builds' | 'ideas' | 'makers' = 'all') =>
    request(`/search?q=${encodeURIComponent(q)}${type !== 'all' ? `&type=${type}` : ''}`),

  // Messages
  getMessageThreads: () => request('/messages'),
  getConversation: (username: string) => request(`/messages/${encodeURIComponent(username)}`),
  sendMessage: (username: string, body: string) =>
    request(`/messages/${encodeURIComponent(username)}`, { method: 'POST', body: JSON.stringify({ body }) }),
  unreadMessages: () => request('/messages/unread-count'),

  // Notifications
  getNotifications: () => request('/notifications'),
  unreadNotifications: () => request('/notifications/unread-count'),
  markNotificationsRead: () => request('/notifications/read', { method: 'POST', body: JSON.stringify({}) }),

  // Follows
  toggleFollow: (username: string) => request(`/follows/${encodeURIComponent(username)}`, { method: 'POST' }),
  followingFeed: (kind?: 'builds' | 'ideas') => request(`/follows/feed${kind ? `?kind=${kind}` : ''}`),

  // Moderation
  report: (data: { kind: string; ref_id?: string; reason?: string; detail?: string }) =>
    request('/report', { method: 'POST', body: JSON.stringify(data) }),

  // Trending
  getTrending: () => request('/trending'),
  getTrendingBuilds: (limit = 10) => request(`/trending/builds?limit=${limit}`),
  getDomains: () => request('/trending/domains'),

  // Settings
  getSettings: () => request('/settings'),
  updateSettings: (data: any) => request('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  getSettingsStatus: () => request('/settings/status'),

  // Pull Requests
  getProjectPulls: (projectId: string) => request(`/pulls/project/${projectId}`),
  getPullDiff: (projectId: string, number: number) => request(`/pulls/project/${projectId}/${number}/diff`),
  mergePull: (projectId: string, number: number) => request(`/pulls/project/${projectId}/${number}/merge`, { method: 'POST' }),
  closePull: (projectId: string, number: number) => request(`/pulls/project/${projectId}/${number}/close`, { method: 'POST' }),
};
