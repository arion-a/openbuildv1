import { config } from '../config/env.js';

const giteaFetch = async (path: string, options: RequestInit = {}) => {
  const url = `${config.gitea.url}/api/v1${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `token ${config.gitea.adminToken}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[gitea] ${res.status} ${path}: ${body.slice(0, 200)}`);
    let msg = `Git operation failed (${res.status})`;
    try { msg = JSON.parse(body).message || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
};

const giteaFetchWithToken = async (path: string, token: string, options: RequestInit = {}) => {
  const url = `${config.gitea.url}/api/v1${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `token ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[gitea] ${res.status} ${path}: ${body.slice(0, 200)}`);
    let msg = `Git operation failed (${res.status})`;
    try { msg = JSON.parse(body).message || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
};

export const gitService = {
  async createUser(username: string, email: string, password: string) {
    return giteaFetch('/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username,
        email,
        password,
        login_name: username,
        source_id: 0,
        must_change_password: false,
        visibility: 'public',
      }),
    });
  },

  async createAccessToken(username: string, password: string, tokenName: string) {
    const url = `${config.gitea.url}/api/v1/users/${username}/tokens`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      },
      body: JSON.stringify({ name: tokenName, scopes: ['write:repository', 'write:user'] }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gitea token error ${res.status}: ${body}`);
    }
    return res.json();
  },

  async createRepo(owner: string, name: string, description: string) {
    return giteaFetch(`/orgs/${owner}/repos`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        description,
        private: false,
        auto_init: true,
      }),
    });
  },

  async createUserRepo(token: string, name: string, description: string) {
    return giteaFetchWithToken('/user/repos', token, {
      method: 'POST',
      body: JSON.stringify({
        name,
        description,
        private: false,
        auto_init: true,
      }),
    });
  },

  async forkRepo(token: string, owner: string, repo: string, forkUser?: string) {
    const url = `/repos/${owner}/${repo}/forks`;
    const giteaUrl = `${config.gitea.url}/api/v1${url}`;
    const res = await fetch(giteaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `token ${token}`,
      },
      body: JSON.stringify({}),
    });
    if (res.ok) return res.json();
    if (res.status === 409 && forkUser) {
      // Fork already exists — return the existing repo info
      return giteaFetchWithToken(`/repos/${forkUser}/${repo}`, token);
    }
    const body = await res.text();
    throw new Error(`Gitea API error ${res.status}: ${body}`);
  },

  async createPullRequest(
    token: string,
    owner: string,
    repo: string,
    title: string,
    body: string,
    headBranch: string,
    baseBranch: string = 'main'
  ) {
    return giteaFetchWithToken(`/repos/${owner}/${repo}/pulls`, token, {
      method: 'POST',
      body: JSON.stringify({
        title,
        body,
        head: headBranch,
        base: baseBranch,
      }),
    });
  },

  async createFile(token: string, owner: string, repo: string, path: string, content: string, message: string) {
    const url = `${config.gitea.url}/api/v1/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `token ${token}`,
      },
      body: JSON.stringify({
        content: Buffer.from(content).toString('base64'),
        message,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 422) return; // file already exists, skip
      throw new Error(`Gitea create file error ${res.status}: ${body}`);
    }
    return res.json();
  },

  getCloneUrl(owner: string, repo: string) {
    return `${config.gitea.url}/${owner}/${repo}.git`;
  },
};
