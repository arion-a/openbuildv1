import { FastifyInstance } from 'fastify';
import { randomBytes, randomInt, scrypt, createHash, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { pool } from '../db/pool.js';
import { gitService } from '../services/git.service.js';
import { firebaseAdmin } from '../config/firebase.js';
import { sendMail } from '../services/mailer.service.js';
import { config, encrypt, decrypt, giteaWebBase } from '../config/env.js';

const scryptAsync = promisify(scrypt);

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

function hashOtp(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string) {
  const [salt, hex] = String(stored).split(':');
  if (!salt || !hex) return false;
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const prior = Buffer.from(hex, 'hex');
  if (prior.length !== derived.length) return false;
  return timingSafeEqual(prior, derived);
}

function generateGiteaPassword(): string {
  return `ob_${randomBytes(16).toString('hex')}`;
}

function cleanHandle(raw?: string | null): string | null {
  if (!raw) return null;
  const v = raw.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  return v.length >= 2 ? v : null;
}

const RESERVED = new Set([
  'admin', 'api', 'auth', 'openbuild', 'settings', 'account', 'login', 'signup',
  'signin', 'help', 'support', 'about', 'privacy', 'terms', 'u', 'me', 'new',
  'discover', 'buildlive', 'ideastream', 'makers', 'publish', 'messages',
  'notifications', 'welcome', 'search',
]);

/** Loose handle normaliser — lowercases and drops anything that isn't [a-z0-9_-]. */
function normalizeHandle(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30);
}

/** null = ok, string = why it's not. Does not check the DB. */
function handleProblem(h: string): string | null {
  if (h.length < 2) return 'Pick at least 2 characters.';
  if (h.length > 30) return 'Keep it under 30 characters.';
  if (!/^[a-z0-9_-]+$/.test(h)) return 'Letters, numbers, _ and - only.';
  if (RESERVED.has(h)) return 'That one’s reserved — try another.';
  return null;
}

function cleanHttpUrl(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function provisionGitea(username: string, email: string, password: string) {
  let giteaId = null;
  let giteaToken = null;
  if (!config.gitea.autoProvision) {
    // Lazy Gitea: no repo hosting wired up (or explicitly disabled). Signup and
    // publish work without it; a repo can be created later when the user opts in.
    return { giteaId, giteaToken };
  }
  try {
    const giteaUser = await gitService.createUser(username, email, password);
    const tokenName = `openbuild_${Date.now()}`;
    const tokenRes = await gitService.createAccessToken(username, password, tokenName);
    giteaId = giteaUser.id;
    giteaToken = tokenRes.sha1;
  } catch (err: any) {
    if (err.message.includes('already exists') || err.message.includes('409')) {
      try {
        const tokenName = `openbuild_${Date.now()}`;
        const tokenRes = await gitService.createAccessToken(username, password, tokenName);
        giteaToken = tokenRes.sha1;
      } catch {
        console.warn('Gitea token creation also failed for:', username);
      }
    } else {
      console.warn('Gitea provisioning failed:', err.message);
    }
  }
  return { giteaId, giteaToken };
}

export async function authRoutes(app: FastifyInstance) {
  // Firebase token verification + auto-provision
  app.post('/firebase', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ message: 'Missing token' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decoded;
    try {
      decoded = await firebaseAdmin.auth().verifyIdToken(idToken);
    } catch (err) {
      request.log.error({ err: (err as Error)?.message }, 'verifyIdToken failed (/auth/firebase)');
      return reply.status(401).send({ message: 'Invalid Firebase token' });
    }

    const { uid, email, name, picture } = decoded;
    const body = (request.body || {}) as {
      github_username?: string;
      github_url?: string;
    };
    const githubUsername = cleanHandle(body.github_username);
    const githubUrl = cleanHttpUrl(body.github_url) || (githubUsername ? `https://github.com/${githubUsername}` : null);

    const baseUsername = (
      githubUsername ||
      name ||
      email?.split('@')[0] ||
      `user_${uid.slice(0, 8)}`
    ).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();

    // Check if user exists by firebase_uid or email first
    let res = await pool.query(
      'SELECT * FROM users WHERE firebase_uid = $1 OR email = $2',
      [uid, email]
    );

    // Generate a unique username with random suffix if needed
    let sanitizedUsername = baseUsername;
    if (res.rows.length === 0) {
      const existing = await pool.query('SELECT id FROM users WHERE username = $1', [baseUsername]);
      if (existing.rows.length > 0) {
        sanitizedUsername = `${baseUsername}_${uid.slice(0, 6)}`;
      }
    }

    if (res.rows.length === 0) {
      const giteaPassword = generateGiteaPassword();
      const { giteaId, giteaToken } = await provisionGitea(sanitizedUsername, email || `${uid}@openbuild.local`, giteaPassword);

      res = await pool.query(
        `INSERT INTO users (username, display_name, email, firebase_uid, avatar_url, gitea_id, gitea_token_encrypted, gitea_password, github_username, github_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (username) DO NOTHING
         RETURNING id, username, display_name, email, avatar_url, bio, github_username, github_url, lovable_url, replit_url, bolt_url`,
        [sanitizedUsername, name || sanitizedUsername, email, uid, picture || null, giteaId, giteaToken ? encrypt(giteaToken) : null, encrypt(giteaPassword), githubUsername, githubUrl]
      );
      // If conflict (extremely rare race), retry with a longer suffix
      if (res.rows.length === 0) {
        sanitizedUsername = `${baseUsername}_${randomBytes(4).toString('hex')}`;
        res = await pool.query(
          `INSERT INTO users (username, display_name, email, firebase_uid, avatar_url, gitea_id, gitea_token_encrypted, gitea_password, github_username, github_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id, username, display_name, email, avatar_url, bio, github_username, github_url, lovable_url, replit_url, bolt_url`,
          [sanitizedUsername, name || sanitizedUsername, email, uid, picture || null, giteaId, giteaToken ? encrypt(giteaToken) : null, encrypt(giteaPassword), githubUsername, githubUrl]
        );
      }
    } else if (res.rows[0].firebase_uid !== uid) {
      // Only update firebase_uid if it's currently NULL (first-time link)
      // Never overwrite an existing firebase_uid — that would be an account takeover
      if (res.rows[0].firebase_uid) {
        return reply.status(403).send({ message: 'Account already linked to a different identity' });
      }
      await pool.query(
        'UPDATE users SET firebase_uid = $1, email = COALESCE($2, email), avatar_url = COALESCE($3, avatar_url) WHERE id = $4 AND firebase_uid IS NULL',
        [uid, email, picture, res.rows[0].id]
      );
      res = await pool.query('SELECT * FROM users WHERE id = $1', [res.rows[0].id]);
    } else if (!res.rows[0].gitea_token_encrypted) {
      const user = res.rows[0];
      const giteaPassword = user.gitea_password ? decrypt(user.gitea_password) : generateGiteaPassword();
      const { giteaId, giteaToken } = await provisionGitea(user.username, user.email, giteaPassword);
      if (giteaToken) {
        await pool.query(
          'UPDATE users SET gitea_id = $1, gitea_token_encrypted = $2, gitea_password = COALESCE(gitea_password, $3) WHERE id = $4',
          [giteaId, giteaToken ? encrypt(giteaToken) : null, encrypt(giteaPassword), user.id]
        );
        res = await pool.query('SELECT * FROM users WHERE id = $1', [user.id]);
      }
    }

    if (githubUsername || githubUrl) {
      await pool.query(
        `UPDATE users SET
           github_username = COALESCE($1, github_username),
           github_url = COALESCE($2, github_url)
         WHERE id = $3`,
        [githubUsername, githubUrl, res.rows[0].id]
      );
      res = await pool.query('SELECT * FROM users WHERE id = $1', [res.rows[0].id]);
    }

    const user = res.rows[0];
    const jwtToken = app.jwt.sign({ id: user.id, username: user.username }, { expiresIn: '7d' });

    return {
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        email: user.email,
        avatar_url: user.avatar_url,
        bio: user.bio,
        github_username: user.github_username,
        github_url: user.github_url,
        lovable_url: user.lovable_url,
        replit_url: user.replit_url,
        bolt_url: user.bolt_url,
      },
      token: jwtToken,
    };
  });

  app.post('/local', async (request, reply) => {
    if (process.env.NODE_ENV === 'production') {
      return reply.status(403).send({ message: 'Local email auth is only available in development' });
    }
    const body = (request.body || {}) as { email?: string; password?: string; display_name?: string; mode?: string };
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';
    const mode = body.mode === 'signin' ? 'signin' : 'signup';
    if (!email || !email.includes('@')) {
      return reply.status(400).send({ message: 'Need a real email and password' });
    }

    if (mode === 'signin') {
      if (password.length < 1) {
        return reply.status(400).send({ message: 'Need a real email and password' });
      }
      const res = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      const user = res.rows[0];
      if (!user?.password_hash || !(await verifyPassword(password, user.password_hash))) {
        return reply.status(401).send({ message: 'Email or password is wrong' });
      }
      const jwtToken = app.jwt.sign({ id: user.id, username: user.username }, { expiresIn: '7d' });
      return {
        token: jwtToken,
        user: {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          email: user.email,
          avatar_url: user.avatar_url,
          bio: user.bio,
        },
      };
    }

    const strong =
      password.length >= 8 &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[^A-Za-z0-9]/.test(password);
    if (!strong) {
      return reply.status(400).send({
        message: 'Password needs 8+ characters, a capital letter, a number, and a symbol.',
      });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows[0]) {
      return reply.status(409).send({ message: 'That email already has an account. Sign in instead.' });
    }

    const displayName = (body.display_name || email.split('@')[0]).trim();
    let username = displayName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    if (username.length < 2) username = `user_${randomBytes(3).toString('hex')}`;
    const taken = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (taken.rows[0]) username = `${username}_${randomBytes(3).toString('hex')}`;

    const passwordHash = await hashPassword(password);
    const giteaPassword = generateGiteaPassword();
    const { giteaId, giteaToken } = await provisionGitea(username, email, giteaPassword);
    const inserted = await pool.query(
      `INSERT INTO users (username, display_name, email, password_hash, gitea_id, gitea_token_encrypted, gitea_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, username, display_name, email, avatar_url, bio`,
      [username, displayName, email, passwordHash, giteaId, giteaToken ? encrypt(giteaToken) : null, encrypt(giteaPassword)]
    );
    const user = inserted.rows[0];
    const jwtToken = app.jwt.sign({ id: user.id, username: user.username }, { expiresIn: '7d' });
    return { token: jwtToken, user };
  });

  // Fallback sign-in when a password attempt fails: email a one-time code and
  // exchange it for the same kind of JWT /local issues. Works for any account
  // that has an email on file, Firebase-backed or local — /authenticate
  // accepts a locally-signed JWT either way.
  app.post('/otp/request', async (request, reply) => {
    const body = (request.body || {}) as { email?: string };
    const email = (body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return reply.status(400).send({ message: 'Need a real email address' });
    }

    const user = (await pool.query('SELECT id FROM users WHERE email = $1', [email])).rows[0];
    // Same response whether or not the email has an account — don't let this
    // endpoint be used to check which emails are registered.
    if (user) {
      const recent = (await pool.query(
        `SELECT created_at FROM email_otp_codes WHERE email = $1 AND consumed_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
        [email]
      )).rows[0];
      if (!recent || Date.now() - new Date(recent.created_at).getTime() > 60_000) {
        const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
        const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);
        await pool.query(
          `INSERT INTO email_otp_codes (email, code_hash, expires_at) VALUES ($1, $2, $3)`,
          [email, hashOtp(code), expiresAt]
        );
        await sendMail({
          to: email,
          subject: 'Your OpenBuild sign-in code',
          text: `Your one-time code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes. If you didn't request this, you can ignore this email.`,
        });
      }
    }
    return { message: 'If that email has an account, a code is on its way.' };
  });

  app.post('/otp/verify', async (request, reply) => {
    const body = (request.body || {}) as { email?: string; code?: string };
    const email = (body.email || '').trim().toLowerCase();
    const code = (body.code || '').trim();
    if (!email || !code) {
      return reply.status(400).send({ message: 'Need an email and code' });
    }

    const row = (await pool.query(
      `SELECT id, code_hash, expires_at, attempts FROM email_otp_codes
       WHERE email = $1 AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [email]
    )).rows[0];

    const expired = !row || new Date(row.expires_at) < new Date() || row.attempts >= OTP_MAX_ATTEMPTS;
    if (expired) {
      return reply.status(401).send({ message: 'That code is invalid or expired. Request a new one.' });
    }

    const given = Buffer.from(hashOtp(code));
    const expected = Buffer.from(row.code_hash);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      await pool.query('UPDATE email_otp_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
      return reply.status(401).send({ message: 'That code is wrong. Try again.' });
    }

    await pool.query('UPDATE email_otp_codes SET consumed_at = NOW() WHERE id = $1', [row.id]);

    const user = (await pool.query(
      'SELECT id, username, display_name, email, avatar_url, bio FROM users WHERE email = $1',
      [email]
    )).rows[0];
    if (!user) {
      return reply.status(404).send({ message: 'No account found for that email.' });
    }

    const jwtToken = app.jwt.sign({ id: user.id, username: user.username }, { expiresIn: '7d' });
    return { token: jwtToken, user };
  });

  app.get('/username-available', { preHandler: [(app as any).authenticate] }, async (request) => {
    const { id } = (request as any).user;
    const normalized = normalizeHandle((request.query as any)?.u);
    const problem = handleProblem(normalized);
    if (problem) return { normalized, available: false, reason: problem };
    const taken = await pool.query('SELECT 1 FROM users WHERE username = $1 AND id <> $2', [normalized, id]);
    return {
      normalized,
      available: taken.rows.length === 0,
      reason: taken.rows.length === 0 ? null : 'That username is taken.',
    };
  });

  app.get('/me', { preHandler: [(app as any).authenticate] }, async (request) => {
    const { id } = (request as any).user;
    const res = await pool.query(
      `SELECT id, username, display_name, email, avatar_url, bio, gitea_password, created_at,
              github_username, github_url, lovable_url, replit_url, bolt_url
       FROM users WHERE id = $1`,
      [id]
    );
    const user = res.rows[0];
    return {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      email: user.email,
      avatar_url: user.avatar_url,
      bio: user.bio,
      created_at: user.created_at,
      github_username: user.github_username,
      github_url: user.github_url,
      lovable_url: user.lovable_url,
      replit_url: user.replit_url,
      bolt_url: user.bolt_url,
      // Only real when this deployment actually provisions Gitea accounts —
      // otherwise there's no matching account behind these, so don't show a
      // dev-only fallback URL or a password for infrastructure that isn't there.
      gitea_url: config.gitea.autoProvision ? giteaWebBase() || null : null,
      gitea_password: config.gitea.autoProvision && user.gitea_password ? decrypt(user.gitea_password) : null,
    };
  });

  app.put('/profile', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id } = (request as any).user;
    const { avatar_url, bio, username, display_name, github_url, lovable_url, replit_url, bolt_url } = request.body as any;

    let sanitizedUsername = null;
    if (username !== undefined && username !== null && username !== '') {
      sanitizedUsername = normalizeHandle(username);
      const problem = handleProblem(sanitizedUsername);
      if (problem) {
        reply.code(400);
        return { error: problem, message: problem };
      }
      const taken = await pool.query('SELECT 1 FROM users WHERE username = $1 AND id <> $2', [sanitizedUsername, id]);
      if (taken.rows.length > 0) {
        reply.code(409);
        return { error: 'That username is taken.', message: 'That username is taken.' };
      }
    }

    const res = await pool.query(
      `UPDATE users SET
        avatar_url = COALESCE($2, avatar_url),
        bio = COALESCE($3, bio),
        username = COALESCE($4, username),
        display_name = COALESCE($5, display_name),
        github_url = COALESCE($6, github_url),
        lovable_url = COALESCE($7, lovable_url),
        replit_url = COALESCE($8, replit_url),
        bolt_url = COALESCE($9, bolt_url)
       WHERE id = $1
       RETURNING id, username, display_name, email, avatar_url, bio,
                 github_username, github_url, lovable_url, replit_url, bolt_url`,
      [
        id,
        avatar_url || null,
        bio || null,
        sanitizedUsername,
        display_name || null,
        cleanHttpUrl(github_url),
        cleanHttpUrl(lovable_url),
        cleanHttpUrl(replit_url),
        cleanHttpUrl(bolt_url),
      ]
    );
    return res.rows[0];
  });
}
