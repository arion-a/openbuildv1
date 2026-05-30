import { spawn, ChildProcess, execSync, execFileSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { pool } from '../db/pool.js';
import { gitService } from './git.service.js';
import { config, decrypt } from '../config/env.js';
import net from 'net';

const SESSIONS_DIR = process.env.SESSIONS_DIR || '/var/sessions';
const HOST_IFACE = 'enp39s0';
const NS_SUBNET_BASE = '10.200';
const activeProcesses = new Map<string, { nsName: string; hostPort: number; subnetId: number }>();

let nextSubnetId = 1;

function findAvailableSubnetId(): number {
  for (let i = 0; i < 250; i++) {
    const id = nextSubnetId;
    nextSubnetId = (nextSubnetId % 250) + 1;
    const veth = `vo${id}h`;
    try {
      execSync(`ip link show ${veth} 2>/dev/null`, { stdio: 'pipe' });
    } catch {
      return id;
    }
  }
  throw new Error('No available subnet IDs — all 250 veth interfaces in use');
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function runGit(args: string[], cwd: string, env: Record<string, string>): void {
  execFileSync('git', args, { cwd, env: { ...process.env, ...env }, stdio: 'pipe' });
}

function runGitAsSession(args: string[], cwd: string, env: Record<string, string>): void {
  const envStr = Object.entries(env).map(([k, v]) => `${k}=${v}`).join(' ');
  const gitCmd = `cd "${cwd}" && ${envStr} git ${args.map(a => `'${a}'`).join(' ')}`;
  execSync(`sudo -u obsession bash -c '${gitCmd.replace(/'/g, "'\\''")}'`, { stdio: 'pipe' });
}

const SUDO = '/usr/bin/sudo';

function shell(cmd: string): void {
  execSync(cmd, { stdio: 'pipe' });
}

function createNetNamespace(nsName: string, subnetId: number): { gateway: string; nsIp: string } {
  const gateway = `${NS_SUBNET_BASE}.${subnetId}.1`;
  const nsIp = `${NS_SUBNET_BASE}.${subnetId}.2`;
  const subnet = `${NS_SUBNET_BASE}.${subnetId}.0/30`;
  const vethHost = `vo${subnetId}h`;
  const vethNs = `vo${subnetId}n`;

  // Create namespace
  shell(`sudo ip netns add ${nsName}`);

  // Create veth pair
  shell(`sudo ip link add ${vethHost} type veth peer name ${vethNs}`);
  shell(`sudo ip link set ${vethNs} netns ${nsName}`);

  // Configure host side
  shell(`sudo ip addr add ${gateway}/30 dev ${vethHost}`);
  shell(`sudo ip link set ${vethHost} up`);

  // Configure namespace side
  shell(`sudo ip netns exec ${nsName} ip addr add ${nsIp}/30 dev ${vethNs}`);
  shell(`sudo ip netns exec ${nsName} ip link set ${vethNs} up`);
  shell(`sudo ip netns exec ${nsName} ip link set lo up`);
  shell(`sudo ip netns exec ${nsName} ip route add default via ${gateway}`);

  // DNS
  shell(`sudo mkdir -p /etc/netns/${nsName}`);
  shell(`echo 'nameserver 172.31.0.2' | sudo tee /etc/netns/${nsName}/resolv.conf > /dev/null`);

  // NAT for outbound internet
  shell(`sudo iptables -t nat -A POSTROUTING -s ${subnet} -j MASQUERADE`);

  // FORWARD rules (insert into DOCKER-USER so Docker doesn't drop them)
  shell(`sudo iptables -I DOCKER-USER -i ${vethHost} -o ${HOST_IFACE} -j ACCEPT`);
  shell(`sudo iptables -I DOCKER-USER -i ${HOST_IFACE} -o ${vethHost} -m state --state RELATED,ESTABLISHED -j ACCEPT`);

  // Block access to internal services from the namespace
  // Block localhost, Docker networks, and the gateway's service ports
  shell(`sudo iptables -I DOCKER-USER -i ${vethHost} -d 127.0.0.0/8 -j DROP`);
  shell(`sudo iptables -I DOCKER-USER -i ${vethHost} -d 172.17.0.0/16 -j DROP`);
  shell(`sudo iptables -I DOCKER-USER -i ${vethHost} -d 172.18.0.0/16 -j DROP`);
  shell(`sudo iptables -I DOCKER-USER -i ${vethHost} -d ${gateway} -p tcp --dport 1:65535 -j DROP`);

  // Enable IP forwarding (idempotent)
  shell(`sudo sysctl -w net.ipv4.ip_forward=1 > /dev/null`);

  return { gateway, nsIp };
}

function deleteNetNamespace(nsName: string, subnetId: number): void {
  const subnet = `${NS_SUBNET_BASE}.${subnetId}.0/30`;
  const gateway = `${NS_SUBNET_BASE}.${subnetId}.1`;
  const vethHost = `vo${subnetId}h`;

  // Kill all processes in the namespace
  try { shell(`sudo ip netns pids ${nsName} 2>/dev/null | xargs -r sudo kill -9`); } catch {}

  // Remove iptables rules
  try { shell(`sudo iptables -t nat -D POSTROUTING -s ${subnet} -j MASQUERADE`); } catch {}
  try { shell(`sudo iptables -D DOCKER-USER -i ${vethHost} -o ${HOST_IFACE} -j ACCEPT`); } catch {}
  try { shell(`sudo iptables -D DOCKER-USER -i ${HOST_IFACE} -o ${vethHost} -m state --state RELATED,ESTABLISHED -j ACCEPT`); } catch {}
  try { shell(`sudo iptables -D DOCKER-USER -i ${vethHost} -d 127.0.0.0/8 -j DROP`); } catch {}
  try { shell(`sudo iptables -D DOCKER-USER -i ${vethHost} -d 172.17.0.0/16 -j DROP`); } catch {}
  try { shell(`sudo iptables -D DOCKER-USER -i ${vethHost} -d 172.18.0.0/16 -j DROP`); } catch {}
  try { shell(`sudo iptables -D DOCKER-USER -i ${vethHost} -d ${gateway} -p tcp --dport 1:65535 -j DROP`); } catch {}

  // Delete namespace and veth
  try { shell(`sudo ip netns del ${nsName}`); } catch {}
  try { shell(`sudo ip link del ${vethHost}`); } catch {}
  try { shell(`sudo rm -rf /etc/netns/${nsName}`); } catch {}
}

export const sessionProcessService = {
  async createSession(userId: string, projectId: string, userGiteaToken: string) {
    const projectRes = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    const project = projectRes.rows[0];
    if (!project) throw new Error('Project not found');

    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userRes.rows[0];

    const settingsRes = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [userId]);
    const settings = settingsRes.rows[0];

    const rawApiKey = settings?.api_key_encrypted || settings?.api_key_legacy;
    const apiKey = rawApiKey ? decrypt(rawApiKey) : null;
    const provider = settings?.provider || 'anthropic';

    const [repoOwner, repoName] = project.repo_name.split('/');
    const fork = await gitService.forkRepo(userGiteaToken, repoOwner, repoName, user.username);
    const forkCloneUrl = gitService.getCloneUrl(user.username, repoName);
    const upstreamCloneUrl = gitService.getCloneUrl(repoOwner, repoName);

    // Create session directory
    const sessionId = crypto.randomUUID();
    const sessionDir = join(SESSIONS_DIR, sessionId);
    const projectDir = join(sessionDir, repoName);
    mkdirSync(sessionDir, { recursive: true, mode: 0o700 });

    // Setup git credentials
    const giteaHost = config.gitea.url.replace('http://', '').replace('https://', '');
    const credContent = `http://${user.username}:${userGiteaToken}@${giteaHost}\nhttps://${user.username}:${userGiteaToken}@${giteaHost}\n`;
    writeFileSync(join(sessionDir, '.git-credentials'), credContent, { mode: 0o600 });

    const gitEnv: Record<string, string> = {
      HOME: sessionDir,
      GIT_AUTHOR_NAME: user.username,
      GIT_AUTHOR_EMAIL: user.email,
      GIT_COMMITTER_NAME: user.username,
      GIT_COMMITTER_EMAIL: user.email,
    };

    // Configure git for this session
    const gitconfigContent = `[user]\n\tname = ${user.username}\n\temail = ${user.email}\n[credential]\n\thelper = store\n`;
    writeFileSync(join(sessionDir, '.gitconfig'), gitconfigContent, { mode: 0o600 });

    // Clone the fork
    runGit(['clone', forkCloneUrl, projectDir], sessionDir, gitEnv);

    // Add upstream and rebase
    runGit(['remote', 'add', 'upstream', upstreamCloneUrl], projectDir, gitEnv);
    try {
      runGit(['fetch', 'upstream'], projectDir, gitEnv);
      runGit(['rebase', 'upstream/main'], projectDir, gitEnv);
    } catch {
      try { runGit(['rebase', '--abort'], projectDir, gitEnv); } catch {}
    }

    // Write OpenCode config
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
    const model = settings?.model || 'claude-sonnet-4-6';

    if (apiKey) {
      const opencodeConfig = {
        $schema: 'https://opencode.ai/config.json',
        model: `${provider}/${model}`,
        provider: {
          [provider]: {
            options: { apiKey: `{env:${keyEnvName}}` },
          },
        },
      };
      writeFileSync(join(projectDir, 'opencode.json'), JSON.stringify(opencodeConfig, null, 2));
    }

    if (settings?.custom_instructions) {
      writeFileSync(join(projectDir, 'AGENTS.md'), settings.custom_instructions);
    }

    // Global gitignore for session
    writeFileSync(join(sessionDir, '.gitignore_global'), 'opencode.json\nAGENTS.md\n');
    runGit(['config', '--global', 'core.excludesFile', join(sessionDir, '.gitignore_global')], projectDir, gitEnv);

    // Create network namespace with internet access
    const subnetId = findAvailableSubnetId();
    const nsName = `ob_${sessionId.slice(0, 8)}`;
    createNetNamespace(nsName, subnetId);

    // Find a free port on the host for the socat forwarder
    const hostPort = await findFreePort();
    const nsPort = 7681;

    // Build clean env
    const cleanEnv = { ...process.env as Record<string, string> };
    delete cleanEnv.ANTHROPIC_API_KEY;
    delete cleanEnv.OPENAI_API_KEY;
    delete cleanEnv.GOOGLE_API_KEY;
    delete cleanEnv.GROQ_API_KEY;
    delete cleanEnv.MISTRAL_API_KEY;
    delete cleanEnv.DEEPSEEK_API_KEY;
    delete cleanEnv.OPENROUTER_API_KEY;

    // Write env file for the session
    const envFile = join(sessionDir, 'session.env');
    const envLines = [
      `HOME=${sessionDir}`,
      `PATH=${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}`,
      `GIT_AUTHOR_NAME=${user.username}`,
      `GIT_AUTHOR_EMAIL=${user.email}`,
      `GIT_COMMITTER_NAME=${user.username}`,
      `GIT_COMMITTER_EMAIL=${user.email}`,
      ...(apiKey ? [`${keyEnvName}=${apiKey}`] : []),
    ];
    writeFileSync(envFile, envLines.join('\n'), { mode: 0o600 });

    // Write launcher script
    const launcherScript = join(sessionDir, 'launch.sh');
    writeFileSync(launcherScript, [
      '#!/bin/bash',
      `set -a && source "${envFile}" && set +a`,
      `cd "${projectDir}"`,
      `exec opencode web --port ${nsPort} --hostname 0.0.0.0`,
    ].join('\n'), { mode: 0o755 });

    // Give the session user ownership of all files
    execSync(`sudo chown -R obsession:obsession "${sessionDir}"`, { stdio: 'pipe' });

    // Launch OpenCode inside the network namespace
    const child = spawn(SUDO, [
      'ip', 'netns', 'exec', nsName,
      'su', '-s', '/bin/bash', 'obsession', '-c', launcherScript,
    ], {
      cwd: '/tmp',
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    child.on('error', (err) => {
      console.error(`[session ${sessionId}] spawn error:`, err.message);
      activeProcesses.delete(sessionId);
      deleteNetNamespace(nsName, subnetId);
    });

    child.unref();
    activeProcesses.set(sessionId, { nsName, hostPort, subnetId });

    child.on('exit', (code) => {
      console.log(`[session ${sessionId}] exited with code ${code}`);
      activeProcesses.delete(sessionId);
      try { execSync(`sudo pkill -f "socat.*TCP-LISTEN:${hostPort}"`, { stdio: 'ignore' }); } catch {}
    });

    // Wait for OpenCode to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Start socat forwarder: host:hostPort -> namespace:nsPort
    const forwarder = spawn(SUDO, [
      'socat',
      `TCP-LISTEN:${hostPort},bind=127.0.0.1,fork,reuseaddr`,
      `SYSTEM:ip netns exec ${nsName} socat STDIO TCP\\:127.0.0.1\\:${nsPort}`,
    ], { stdio: 'ignore', detached: true });
    forwarder.on('error', (err) => {
      console.error(`[session ${sessionId}] socat spawn error:`, err.message);
    });
    forwarder.unref();

    const terminalUrl = `http://127.0.0.1:${hostPort}`;

    const sessionRes = await pool.query(
      `INSERT INTO sessions (id, user_id, project_id, container_id, fork_repo_name, status, web_terminal_url)
       VALUES ($1, $2, $3, $4, $5, 'running', $6) RETURNING *`,
      [sessionId, userId, projectId, `ns:${nsName}:${subnetId}`, `${user.username}/${repoName}`, terminalUrl]
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

    const projectRes = await pool.query('SELECT * FROM projects WHERE id = $1', [session.project_id]);
    const project = projectRes.rows[0];
    const [upstreamOwner, repoName] = project.repo_name.split('/');
    const [forkOwner] = session.fork_repo_name.split('/');

    const sessionDir = join(SESSIONS_DIR, sessionId);
    const projectDir = join(sessionDir, repoName);

    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [session.user_id]);
    const user = userRes.rows[0];

    const gitEnv: Record<string, string> = {
      HOME: sessionDir,
      GIT_AUTHOR_NAME: user.username,
      GIT_AUTHOR_EMAIL: user.email,
      GIT_COMMITTER_NAME: user.username,
      GIT_COMMITTER_EMAIL: user.email,
    };

    // Stage, commit, push to a feature branch
    const branchName = `openbuild/session-${sessionId.slice(0, 8)}`;
    try {
      runGitAsSession(['checkout', '-b', branchName], projectDir, gitEnv);
      runGitAsSession(['add', '-A'], projectDir, gitEnv);
      try {
        runGitAsSession(['diff', '--cached', '--quiet'], projectDir, gitEnv);
      } catch {
        runGitAsSession(['commit', '-m', 'OpenBuild session contribution'], projectDir, gitEnv);
      }
      runGitAsSession(['push', 'origin', branchName], projectDir, gitEnv);
    } catch (err: any) {
      console.error('[completeSession] git error:', err.message);
    }

    // Create PR from fork's feature branch to upstream main
    let prResult;
    try {
      prResult = await gitService.createPullRequest(
        userGiteaToken,
        upstreamOwner,
        repoName,
        `Contribution from ${forkOwner}`,
        'Submitted via OpenBuild session',
        `${forkOwner}:${branchName}`,
        'main'
      );
    } catch (err: any) {
      console.error('[completeSession] PR creation failed:', err.message);
      prResult = { error: err.message };
    }

    // Kill the namespace and cleanup
    this.killSession(sessionId);

    // Cleanup directory (owned by obsession, need sudo)
    try {
      execSync(`sudo rm -rf "${sessionDir}"`, { stdio: 'pipe' });
    } catch {}

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

    this.killSession(sessionId);

    const sessionDir = join(SESSIONS_DIR, sessionId);
    try {
      execSync(`sudo rm -rf "${sessionDir}"`, { stdio: 'pipe' });
    } catch {}

    await pool.query(
      `UPDATE sessions SET status = 'failed', ended_at = NOW() WHERE id = $1`,
      [sessionId]
    );
  },

  killSession(sessionId: string) {
    const entry = activeProcesses.get(sessionId);
    if (!entry) return;

    deleteNetNamespace(entry.nsName, entry.subnetId);

    // Kill the socat port forwarder
    try { execSync(` pkill -f "socat.*TCP-LISTEN:${entry.hostPort}"`, { stdio: 'ignore' }); } catch {}

    activeProcesses.delete(sessionId);
  },
};
