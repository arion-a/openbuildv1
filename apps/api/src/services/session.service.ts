import Docker from 'dockerode';
import { config, decrypt } from '../config/env.js';
import { pool } from '../db/pool.js';
import { gitService } from './git.service.js';

const docker = new Docker({ socketPath: config.docker.socket });

export const sessionService = {
  async createSession(userId: string, projectId: string, userGiteaToken: string) {
    const projectRes = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    const project = projectRes.rows[0];
    if (!project) throw new Error('Project not found');

    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userRes.rows[0];

    // Fetch user's OpenCode settings
    const settingsRes = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [userId]);
    const settings = settingsRes.rows[0];

    const rawApiKey = settings?.api_key_encrypted || settings?.api_key_legacy;
    if (!rawApiKey) {
      throw new Error('No API key configured. Set it in your OpenCode settings.');
    }
    const apiKey = decrypt(rawApiKey);
    const provider = settings?.provider || 'anthropic';

    const [repoOwner, repoName] = project.repo_name.split('/');
    const fork = await gitService.forkRepo(userGiteaToken, repoOwner, repoName, user.username);
    const forkCloneUrl = gitService.getCloneUrl(user.username, repoName);

    // Replace localhost with host.docker.internal for container access
    const containerGiteaUrl = config.gitea.url.replace('localhost', 'host.docker.internal');
    const containerCloneUrl = forkCloneUrl.replace('localhost', 'host.docker.internal');

    const upstreamCloneUrl = gitService.getCloneUrl(repoOwner, repoName).replace('localhost', 'host.docker.internal');

    const envVars = [
      `GITEA_URL=${containerGiteaUrl}`,
      `REPO_CLONE_URL=${containerCloneUrl}`,
      `UPSTREAM_CLONE_URL=${upstreamCloneUrl}`,
      `USER_TOKEN=${userGiteaToken}`,
      `USER_NAME=${user.username}`,
      `USER_EMAIL=${user.email}`,
      `OPENCODE_PROVIDER=${provider}`,
    ];

    // Set the provider-specific API key env var
    const providerEnvMap: Record<string, string> = {
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      google: 'GOOGLE_API_KEY',
      groq: 'GROQ_API_KEY',
      mistral: 'MISTRAL_API_KEY',
      deepseek: 'DEEPSEEK_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
    };
    const keyEnvName = providerEnvMap[provider] || 'ANTHROPIC_API_KEY';
    envVars.push(`${keyEnvName}=${apiKey}`);

    // Inject user's OpenCode configuration
    if (settings?.model) {
      envVars.push(`OPENCODE_MODEL=${settings.model}`);
    }
    if (settings?.claude_md) {
      envVars.push(`OPENCODE_INSTRUCTIONS=${settings.claude_md}`);
    }
    if (settings?.settings_json) {
      envVars.push(`OPENCODE_CONFIG_JSON=${JSON.stringify(settings.settings_json)}`);
    }
    if (settings?.custom_instructions) {
      envVars.push(`OPENCODE_CUSTOM_INSTRUCTIONS=${settings.custom_instructions}`);
    }

    const container = await docker.createContainer({
      Image: config.docker.sessionImage,
      Env: envVars,
      ExposedPorts: { '7681/tcp': {} },
      HostConfig: {
        Memory: 2 * 1024 * 1024 * 1024,
        NanoCpus: 1_000_000_000,
        NetworkMode: 'bridge',
        PortBindings: { '7681/tcp': [{ HostPort: '0' }] },
        ExtraHosts: ['host.docker.internal:host-gateway'],
      },
    });

    await container.start();
    const inspect = await container.inspect();
    const hostPort = inspect.NetworkSettings.Ports['7681/tcp']?.[0]?.HostPort;
    const terminalUrl = `http://localhost:${hostPort}`;

    const sessionRes = await pool.query(
      `INSERT INTO sessions (user_id, project_id, container_id, fork_repo_name, status, web_terminal_url)
       VALUES ($1, $2, $3, $4, 'running', $5) RETURNING *`,
      [userId, projectId, container.id, `${user.username}/${repoName}`, terminalUrl]
    );

    return sessionRes.rows[0];
  },

  async getSession(sessionId: string) {
    const res = await pool.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    return res.rows[0] || null;
  },

  async completeSession(sessionId: string, userGiteaToken: string) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Session not found');
    if (session.status !== 'running') throw new Error('Session is not running');

    const container = docker.getContainer(session.container_id);

    // Stage, commit, rebase onto latest upstream, and force-push
    const exec = await container.exec({
      Cmd: ['sh', '-c', `cd /home/builder/*/ && git add -A && (git diff --cached --quiet || git commit -m "OpenBuild session contribution") && git fetch upstream && git rebase upstream/main && git push --force-with-lease origin main 2>&1`],
      User: 'builder',
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await exec.start({});
    // Collect output for debugging
    let execOutput = '';
    stream.on('data', (chunk: Buffer) => { execOutput += chunk.toString(); });
    await new Promise<void>((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    console.log('[completeSession] git output:', execOutput);

    // Create PR from fork to upstream
    const projectRes = await pool.query('SELECT * FROM projects WHERE id = $1', [session.project_id]);
    const project = projectRes.rows[0];
    const [upstreamOwner, repoName] = project.repo_name.split('/');
    const [forkOwner] = session.fork_repo_name.split('/');

    console.log(`[completeSession] Creating PR: ${forkOwner}:main -> ${upstreamOwner}/${repoName}:main`);
    let prResult;
    try {
      prResult = await gitService.createPullRequest(
        userGiteaToken,
        upstreamOwner,
        repoName,
        `Contribution from ${forkOwner}`,
        'Submitted via OpenBuild session',
        `${forkOwner}:main`,
        'main'
      );
      console.log('[completeSession] PR created:', JSON.stringify(prResult).slice(0, 200));
    } catch (err: any) {
      console.log('[completeSession] PR error:', err.message);
      if (err.message?.includes('409')) {
        prResult = { existing: true };
      } else {
        throw err;
      }
    }

    // Cleanup container
    await container.stop();
    await container.remove();

    // Update session and add contributor
    await pool.query(
      `UPDATE sessions SET status = 'completed', ended_at = NOW() WHERE id = $1`,
      [sessionId]
    );
    await pool.query(
      `INSERT INTO project_contributors (project_id, user_id, fork_repo_name)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [session.project_id, session.user_id, session.fork_repo_name]
    );

    return { status: 'completed', pr_created: true, pr: prResult };
  },

  async destroySession(sessionId: string) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    try {
      const container = docker.getContainer(session.container_id);
      await container.stop();
      await container.remove();
    } catch {
      // Container may already be gone
    }

    await pool.query(
      `UPDATE sessions SET status = 'failed', ended_at = NOW() WHERE id = $1`,
      [sessionId]
    );
  },
};
