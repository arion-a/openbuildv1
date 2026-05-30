import { auth, onAuthStateChanged } from './firebase';

const BASE = import.meta.env.VITE_API_URL ?? '/api';

function waitForAuth(): Promise<typeof auth.currentUser> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}

async function request(path: string, options: RequestInit = {}) {
  const user = await waitForAuth();
  const token = user ? await user.getIdToken() : null;

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
    throw new Error(err.message || res.statusText);
  }
  return res.json();
}

export const api = {
  // Auth
  syncFirebase: () => request('/auth/firebase', { method: 'POST' }),
  me: () => request('/auth/me'),
  updateProfile: (data: { avatar_url?: string; bio?: string; username?: string; display_name?: string }) =>
    request('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),

  // Projects (BuildLive)
  getProjects: (params?: string) => request(`/projects${params ? `?${params}` : ''}`),
  getProject: (id: string) => request(`/projects/${id}`),
  createProject: (data: any) => request('/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id: string, data: any) => request(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  uploadProjectZip: async (projectId: string, file: File) => {
    const user = await waitForAuth();
    const token = user ? await user.getIdToken() : null;
    const formData = new FormData();
    formData.append('file', file);
    const BASE = import.meta.env.VITE_API_URL ?? '/api';
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
  createIdea: (data: any) => request('/ideas', { method: 'POST', body: JSON.stringify(data) }),
  getThreads: (ideaId: string) => request(`/ideas/${ideaId}/threads`),
  postThread: (ideaId: string, data: { body: string; parent_id?: string }) =>
    request(`/ideas/${ideaId}/threads`, { method: 'POST', body: JSON.stringify(data) }),
  upvote: (ideaId: string) => request(`/ideas/${ideaId}/upvote`, { method: 'POST' }),
  summarise: (ideaId: string) => request(`/ideas/${ideaId}/summarise`, { method: 'POST' }),

  // Trending
  getTrending: () => request('/trending'),
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
