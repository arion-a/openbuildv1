import { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';
import { pool } from '../db/pool.js';
import { gitService } from '../services/git.service.js';
import { firebaseAdmin } from '../config/firebase.js';
import { encrypt, decrypt } from '../config/env.js';

function generateGiteaPassword(): string {
  return `ob_${randomBytes(16).toString('hex')}`;
}

async function provisionGitea(username: string, email: string, password: string) {
  let giteaId = null;
  let giteaToken = null;
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
      return reply.status(401).send({ message: 'Invalid Firebase token' });
    }

    const { uid, email, name, picture } = decoded;
    const baseUsername = (name || email?.split('@')[0] || `user_${uid.slice(0, 8)}`).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();

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
        `INSERT INTO users (username, display_name, email, firebase_uid, avatar_url, gitea_id, gitea_token_encrypted, gitea_password)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (username) DO NOTHING
         RETURNING id, username, display_name, email, avatar_url`,
        [sanitizedUsername, name || sanitizedUsername, email, uid, picture || null, giteaId, giteaToken ? encrypt(giteaToken) : null, encrypt(giteaPassword)]
      );
      // If conflict (extremely rare race), retry with a longer suffix
      if (res.rows.length === 0) {
        sanitizedUsername = `${baseUsername}_${randomBytes(4).toString('hex')}`;
        res = await pool.query(
          `INSERT INTO users (username, display_name, email, firebase_uid, avatar_url, gitea_id, gitea_token_encrypted, gitea_password)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, username, display_name, email, avatar_url`,
          [sanitizedUsername, name || sanitizedUsername, email, uid, picture || null, giteaId, giteaToken ? encrypt(giteaToken) : null, encrypt(giteaPassword)]
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

    const user = res.rows[0];
    const jwtToken = app.jwt.sign({ id: user.id, username: user.username }, { expiresIn: '7d' });

    return { user: { id: user.id, username: user.username, display_name: user.display_name, email: user.email, avatar_url: user.avatar_url, bio: user.bio }, token: jwtToken };
  });

  app.get('/me', { preHandler: [(app as any).authenticate] }, async (request) => {
    const { id } = (request as any).user;
    const res = await pool.query(
      'SELECT id, username, display_name, email, avatar_url, bio, gitea_password, created_at FROM users WHERE id = $1',
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
      gitea_url: 'https://git.openbuild.world',
      gitea_password: user.gitea_password ? decrypt(user.gitea_password) : null,
    };
  });

  app.put('/profile', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id } = (request as any).user;
    const { avatar_url, bio, username, display_name } = request.body as any;

    let sanitizedUsername = null;
    if (username) {
      sanitizedUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
      if (sanitizedUsername.length < 2) {
        reply.code(400);
        return { error: 'Username must be at least 2 characters (letters, numbers, _ and - only)' };
      }
    }

    const res = await pool.query(
      `UPDATE users SET
        avatar_url = COALESCE($2, avatar_url),
        bio = COALESCE($3, bio),
        username = COALESCE($4, username),
        display_name = COALESCE($5, display_name)
       WHERE id = $1
       RETURNING id, username, display_name, email, avatar_url, bio`,
      [id, avatar_url || null, bio || null, sanitizedUsername, display_name || null]
    );
    return res.rows[0];
  });
}
