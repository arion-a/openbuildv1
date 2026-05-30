/**
 * Migration: Re-encrypt all secrets after key derivation change.
 * Old: KEY_BUFFER = Buffer.from(key.padEnd(32, '0').slice(0, 32))
 * New: KEY_BUFFER = createHash('sha256').update(key).digest()
 *
 * Run once: npx tsx src/db/migrations/001_reencrypt_key_derivation.ts
 */
import 'dotenv/config';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET!;
const OLD_KEY = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
const NEW_KEY = createHash('sha256').update(ENCRYPTION_KEY).digest();

function decryptWithKey(data: string, key: Buffer): string | null {
  const [ivHex, tagHex, encHex] = data.split(':');
  if (!ivHex || !tagHex || !encHex) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex'), undefined, 'utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
}

function encryptWithKey(text: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function reencrypt(data: string): string | null {
  const plaintext = decryptWithKey(data, OLD_KEY);
  if (plaintext === null) return null;
  return encryptWithKey(plaintext, NEW_KEY);
}

async function migrate() {
  console.log('Starting re-encryption migration...');

  // Re-encrypt users table: gitea_token_encrypted, gitea_password
  const users = await pool.query(
    'SELECT id, gitea_token_encrypted, gitea_password FROM users WHERE gitea_token_encrypted IS NOT NULL OR gitea_password IS NOT NULL'
  );
  console.log(`Found ${users.rows.length} users with encrypted fields`);

  let updated = 0;
  for (const user of users.rows) {
    const newToken = user.gitea_token_encrypted ? reencrypt(user.gitea_token_encrypted) : null;
    const newPassword = user.gitea_password ? reencrypt(user.gitea_password) : null;

    if (newToken === null && user.gitea_token_encrypted) {
      console.warn(`  [SKIP] user ${user.id}: gitea_token_encrypted failed to decrypt (may be plaintext or already migrated)`);
      continue;
    }
    if (newPassword === null && user.gitea_password) {
      console.warn(`  [SKIP] user ${user.id}: gitea_password failed to decrypt (may be plaintext or already migrated)`);
      continue;
    }

    await pool.query(
      'UPDATE users SET gitea_token_encrypted = COALESCE($2, gitea_token_encrypted), gitea_password = COALESCE($3, gitea_password) WHERE id = $1',
      [user.id, newToken, newPassword]
    );
    updated++;
  }
  console.log(`  Updated ${updated} users`);

  // Re-encrypt user_settings table: api_key_encrypted
  const settings = await pool.query(
    'SELECT user_id, api_key_encrypted FROM user_settings WHERE api_key_encrypted IS NOT NULL'
  );
  console.log(`Found ${settings.rows.length} user_settings with encrypted API keys`);

  let settingsUpdated = 0;
  for (const row of settings.rows) {
    const newKey = reencrypt(row.api_key_encrypted);
    if (newKey === null) {
      console.warn(`  [SKIP] user_settings ${row.user_id}: api_key_encrypted failed to decrypt`);
      continue;
    }
    await pool.query(
      'UPDATE user_settings SET api_key_encrypted = $2 WHERE user_id = $1',
      [row.user_id, newKey]
    );
    settingsUpdated++;
  }
  console.log(`  Updated ${settingsUpdated} user_settings`);

  console.log('Migration complete.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
